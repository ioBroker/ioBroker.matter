import { type Behavior, Endpoint } from '@matter/main';
import { FanDevice } from '@matter/main/devices';
import { FanControl as MatterFanControl } from '@matter/main/clusters';
import { FanControlServer, OnOffServer } from '@matter/main/behaviors';
import { hasLocalActor } from '@matter/main/protocol';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import { type Fan, FanAirflowDirection, FanSpeed, FanSwing } from '../../lib/devices/Fan';
import { mapFanModeToSpeed, mapSpeedToFanMode } from './FanControlUtils';
import { GenericElectricityDataDeviceToMatter } from './GenericElectricityDataDeviceToMatter';
import { IoIdentifyServer } from '../behaviors/IdentifyServer';
import { IoBrokerContext } from '../behaviors/IoBrokerContext';

const IoFanDevice = FanDevice.with(IoIdentifyServer, IoBrokerContext);
const IoFanDeviceWithOnOff = FanDevice.with(OnOffServer, IoIdentifyServer, IoBrokerContext);

export type FanControlInit = {
    fanMode: MatterFanControl.FanMode;
    fanModeSequence: MatterFanControl.FanModeSequence;
    airflowDirection?: MatterFanControl.AirflowDirection;
};

/**
 * Builds the endpoint that carries the FanControl cluster. Device types that embed a fan supply their own so the
 * mapping logic can be shared without the base class knowing the concrete Matter device type.
 */
export type FanEndpointFactory = (fanControlServer: Behavior.Type, fanControlInit: FanControlInit) => Endpoint;

type PercentValues = { percentSetting: number | null; percentCurrent: number };

type RockValues = { rockLeftRight: boolean; rockUpDown: boolean; rockRound: boolean };

/** Mapping Logic to map an ioBroker Fan device to a Matter FanDevice. */
export class FanToMatter<T extends Fan = Fan> extends GenericElectricityDataDeviceToMatter {
    readonly #ioBrokerDevice: T;
    readonly #matterEndpoint: Endpoint;
    readonly #fanControlServer;
    readonly #speedModes: FanSpeed[];
    readonly #hasSpeed: boolean;
    readonly #hasSpeedLevel: boolean;
    readonly #hasOnOff: boolean;
    readonly #hasSwing: boolean;
    readonly #hasEnumSwing: boolean;
    readonly #hasAirflowDirection: boolean;
    readonly #sequenceHasLow: boolean;
    readonly #sequenceHasMedium: boolean;

    constructor(ioBrokerDevice: T, name: string, uuid: string, createEndpoint?: FanEndpointFactory) {
        super(name, uuid);
        this.#ioBrokerDevice = ioBrokerDevice;
        this.#hasSpeed = ioBrokerDevice.hasSpeed();
        this.#hasSpeedLevel = ioBrokerDevice.hasSpeedLevel();
        this.#hasOnOff = ioBrokerDevice.hasPower();
        this.#hasSwing = ioBrokerDevice.hasSwing();
        this.#hasAirflowDirection = ioBrokerDevice.hasAirflowDirection();
        this.#speedModes = this.#hasSpeed ? ioBrokerDevice.getSpeedModes() : [];
        // The detector matches either the enum or the boolean SWING pattern, and only the enum one declares modes
        this.#hasEnumSwing = this.#hasSwing && ioBrokerDevice.getSwingModes().some(mode => typeof mode === 'string');
        this.#sequenceHasLow = this.#speedModes.includes(FanSpeed.Low) || this.#speedModes.includes(FanSpeed.Quiet);
        this.#sequenceHasMedium = this.#sequenceHasLow && this.#speedModes.includes(FanSpeed.Medium);

        const features = new Array<MatterFanControl.Feature>();
        if (this.#speedModes.includes(FanSpeed.Auto)) {
            features.push(MatterFanControl.Feature.Auto);
        }
        if (this.#hasSwing) {
            features.push(MatterFanControl.Feature.Rocking);
        }
        if (this.#hasAirflowDirection) {
            features.push(MatterFanControl.Feature.AirflowDirection);
        }
        this.#fanControlServer = FanControlServer.with(...features);

        const fanControlInit: FanControlInit = {
            fanMode: MatterFanControl.FanMode.Off,
            fanModeSequence: this.#fanModeSequence(),
            // airflowDirection has no cluster default, so declaring the feature also obliges us to seed the attribute
            ...(this.#hasAirflowDirection
                ? { airflowDirection: this.#mapAirflowDirectionToMatter(ioBrokerDevice.getAirflowDirection()) }
                : {}),
        };

        this.#matterEndpoint = createEndpoint
            ? createEndpoint(this.#fanControlServer, fanControlInit)
            : new Endpoint(
                  this.#hasOnOff
                      ? IoFanDeviceWithOnOff.with(this.#fanControlServer)
                      : IoFanDevice.with(this.#fanControlServer),
                  {
                      id: `${uuid}-Fan`,
                      ioBrokerContext: { device: ioBrokerDevice, adapter: ioBrokerDevice.adapter },
                      fanControl: fanControlInit,
                  },
              );

        this.addElectricityDataClusters(this.#matterEndpoint, ioBrokerDevice);
    }

    get matterEndpoints(): Endpoint[] {
        return [this.#matterEndpoint];
    }

    get ioBrokerDevice(): T {
        return this.#ioBrokerDevice;
    }

    protected get endpoint(): Endpoint {
        return this.#matterEndpoint;
    }

    #fanModeSequence(): MatterFanControl.FanModeSequence {
        if (this.#speedModes.includes(FanSpeed.Auto)) {
            if (this.#sequenceHasMedium) {
                return MatterFanControl.FanModeSequence.OffLowMedHighAuto;
            }
            return this.#sequenceHasLow
                ? MatterFanControl.FanModeSequence.OffLowHighAuto
                : MatterFanControl.FanModeSequence.OffHighAuto;
        }
        if (this.#sequenceHasMedium) {
            return MatterFanControl.FanModeSequence.OffLowMedHigh;
        }
        return this.#sequenceHasLow
            ? MatterFanControl.FanModeSequence.OffLowHigh
            : MatterFanControl.FanModeSequence.OffHigh;
    }

    /** Controllers build their UI from fanModeSequence, so a step outside of it cannot be rendered. */
    #clampFanMode(fanMode: MatterFanControl.FanMode): MatterFanControl.FanMode {
        if (fanMode === MatterFanControl.FanMode.Medium && !this.#sequenceHasMedium) {
            return MatterFanControl.FanMode.High;
        }
        if (fanMode === MatterFanControl.FanMode.Low && !this.#sequenceHasLow) {
            return MatterFanControl.FanMode.High;
        }
        return fanMode;
    }

    #speedToFanMode(speed: FanSpeed | undefined): MatterFanControl.FanMode | undefined {
        return mapSpeedToFanMode(speed, (unsupported, reportedAs) =>
            this.#ioBrokerDevice.adapter.log.debug(
                `${this.uuid}: Matter has no ${unsupported} fan speed, reporting as ${reportedAs}`,
            ),
        );
    }

    /** Matter always offers Low/Medium/High, so a requested speed the device does not know needs a nearby one. */
    #supportedSpeed(speed: FanSpeed): FanSpeed | undefined {
        if (this.#speedModes.length === 0 || this.#speedModes.includes(speed)) {
            return speed;
        }
        const alternatives: Record<FanSpeed, FanSpeed[]> = {
            [FanSpeed.Auto]: [],
            [FanSpeed.Low]: [FanSpeed.Quiet, FanSpeed.Medium, FanSpeed.High],
            [FanSpeed.Medium]: [FanSpeed.Low, FanSpeed.High],
            [FanSpeed.High]: [FanSpeed.Turbo, FanSpeed.Medium, FanSpeed.Low],
            [FanSpeed.Quiet]: [FanSpeed.Low, FanSpeed.Medium],
            [FanSpeed.Turbo]: [FanSpeed.High, FanSpeed.Medium],
        };
        return alternatives[speed].find(alternative => this.#speedModes.includes(alternative));
    }

    async #writeSpeed(speed: FanSpeed): Promise<void> {
        if (!this.#hasSpeed) {
            return;
        }
        const supported = this.#supportedSpeed(speed);
        if (supported === undefined) {
            this.#ioBrokerDevice.adapter.log.info(`${this.uuid}: Device does not support fan speed ${speed}, ignoring`);
            return;
        }
        await this.#ioBrokerDevice.setSpeed(supported);
    }

    #mapPercentToFanMode(percent: number): MatterFanControl.FanMode {
        if (percent <= 0) {
            return MatterFanControl.FanMode.Off;
        }
        if (percent <= 33) {
            return this.#clampFanMode(MatterFanControl.FanMode.Low);
        }
        if (percent <= 66) {
            return this.#clampFanMode(MatterFanControl.FanMode.Medium);
        }
        return MatterFanControl.FanMode.High;
    }

    #percentForFanMode(fanMode: MatterFanControl.FanMode): number {
        switch (fanMode) {
            case MatterFanControl.FanMode.Off:
                return 0;
            case MatterFanControl.FanMode.Low:
                return 33;
            case MatterFanControl.FanMode.Medium:
                return 66;
            default:
                return 100;
        }
    }

    #speedLevel(): number | undefined {
        const level = this.#hasSpeedLevel ? this.#ioBrokerDevice.getSpeedLevel() : undefined;
        return typeof level === 'number' ? Math.round(this.#ioBrokerDevice.cropValue(level, 0, 100, false)) : undefined;
    }

    /** Percent Rules: the setting is null while the fan runs in Auto, because the requested speed is then unknown. */
    #percentValues(fanMode: MatterFanControl.FanMode, level: number | undefined): PercentValues {
        if (fanMode === MatterFanControl.FanMode.Off) {
            return { percentSetting: 0, percentCurrent: 0 };
        }
        const percentCurrent = level ?? this.#percentForFanMode(fanMode);
        const isAuto = fanMode === MatterFanControl.FanMode.Auto || fanMode === MatterFanControl.FanMode.Smart;
        return { percentSetting: isAuto ? null : percentCurrent, percentCurrent };
    }

    #isPowered(): boolean {
        return this.#hasOnOff ? (this.#ioBrokerDevice.getPower() ?? true) : true;
    }

    #currentFanMode(): MatterFanControl.FanMode {
        if (!this.#isPowered()) {
            return MatterFanControl.FanMode.Off;
        }
        const level = this.#speedLevel();
        const fanMode =
            (this.#hasSpeed ? this.#speedToFanMode(this.#ioBrokerDevice.getSpeed()) : undefined) ??
            (level !== undefined ? this.#mapPercentToFanMode(level) : MatterFanControl.FanMode.Off);
        return this.#clampFanMode(fanMode);
    }

    #mapSwingToRock(swing: unknown): RockValues {
        if (typeof swing === 'boolean') {
            return { rockLeftRight: swing, rockUpDown: false, rockRound: false };
        }
        if (swing === FanSwing.Horizontal) {
            return { rockLeftRight: true, rockUpDown: false, rockRound: false };
        }
        if (swing === FanSwing.Vertical) {
            return { rockLeftRight: false, rockUpDown: true, rockRound: false };
        }
        if (swing === FanSwing.Auto) {
            this.#ioBrokerDevice.adapter.log.debug(`${this.uuid}: Matter has no Auto swing, enabling rocking`);
            return { rockLeftRight: true, rockUpDown: false, rockRound: false };
        }
        return { rockLeftRight: false, rockUpDown: false, rockRound: false };
    }

    #rockSupport(): RockValues {
        if (!this.#hasEnumSwing) {
            return { rockLeftRight: true, rockUpDown: false, rockRound: false };
        }
        const modes = this.#ioBrokerDevice.getSwingModes();
        const rockLeftRight = modes.length === 0 || modes.includes(FanSwing.Horizontal);
        return { rockLeftRight, rockUpDown: modes.includes(FanSwing.Vertical) || !rockLeftRight, rockRound: false };
    }

    #mapRockToSwing(rock: Partial<RockValues> | undefined): FanSwing | boolean {
        const rocking = !!rock && !!(rock.rockLeftRight || rock.rockUpDown || rock.rockRound);
        if (!this.#hasEnumSwing) {
            return rocking;
        }
        if (!rocking) {
            return FanSwing.Stationary;
        }
        return rock?.rockLeftRight ? FanSwing.Horizontal : FanSwing.Vertical;
    }

    #mapAirflowDirectionToMatter(direction: unknown): MatterFanControl.AirflowDirection {
        return direction === FanAirflowDirection.Reverse
            ? MatterFanControl.AirflowDirection.Reverse
            : MatterFanControl.AirflowDirection.Forward;
    }

    async registerHandlersAndInitialize(): Promise<void> {
        await super.registerHandlersAndInitialize();

        await this.initializeElectricityStateHandlers(this.#matterEndpoint, this.#ioBrokerDevice);
        await this.#initializeMatterState();
        this.#registerMatterHandlers();
        this.#registerIoBrokerHandlers();
    }

    async #initializeMatterState(): Promise<void> {
        const fanMode = this.#currentFanMode();
        await this.#matterEndpoint.setStateOf(this.#fanControlServer, {
            fanMode,
            ...this.#percentValues(fanMode, this.#speedLevel()),
            ...(this.#hasSwing
                ? {
                      rockSupport: this.#rockSupport(),
                      rockSetting: this.#mapSwingToRock(this.#ioBrokerDevice.getSwing()),
                  }
                : {}),
            ...(this.#hasAirflowDirection
                ? { airflowDirection: this.#mapAirflowDirectionToMatter(this.#ioBrokerDevice.getAirflowDirection()) }
                : {}),
        });

        if (this.#hasOnOff) {
            await this.#matterEndpoint.setStateOf(OnOffServer, { onOff: this.#isPowered() });
        }
    }

    #registerMatterHandlers(): void {
        const fanEvents = this.#matterEndpoint.eventsOf(this.#fanControlServer);

        if (fanEvents?.fanMode$Changed !== undefined) {
            this.matterEvents.on(fanEvents.fanMode$Changed, async (value, _oldValue, context) => {
                if (hasLocalActor(context)) {
                    return;
                }
                await this.#handleMatterFanModeChange(value);
            });
        }

        if (fanEvents?.percentSetting$Changed !== undefined) {
            this.matterEvents.on(fanEvents.percentSetting$Changed, async (value, _oldValue, context) => {
                if (hasLocalActor(context) || value === null) {
                    return;
                }
                await this.#handleMatterPercentChange(value);
            });
        }

        if (this.#hasSwing && fanEvents?.rockSetting$Changed !== undefined) {
            this.matterEvents.on(fanEvents.rockSetting$Changed, async (value, _oldValue, context) => {
                if (hasLocalActor(context)) {
                    return;
                }
                await this.#ioBrokerDevice.setSwing(this.#mapRockToSwing(value));
            });
        }

        if (this.#hasAirflowDirection && fanEvents?.airflowDirection$Changed !== undefined) {
            this.matterEvents.on(fanEvents.airflowDirection$Changed, async (value, _oldValue, context) => {
                if (hasLocalActor(context)) {
                    return;
                }
                await this.#ioBrokerDevice.setAirflowDirection(
                    value === MatterFanControl.AirflowDirection.Reverse
                        ? FanAirflowDirection.Reverse
                        : FanAirflowDirection.Forward,
                );
            });
        }

        if (this.#hasOnOff) {
            const onOffEvents = this.#matterEndpoint.eventsOf(OnOffServer);
            if (onOffEvents?.onOff$Changed !== undefined) {
                this.matterEvents.on(onOffEvents.onOff$Changed, async (value, _oldValue, context) => {
                    if (hasLocalActor(context)) {
                        return;
                    }
                    await this.#ioBrokerDevice.setPower(!!value);
                });
            }
        }
    }

    async #handleMatterFanModeChange(fanMode: MatterFanControl.FanMode): Promise<void> {
        if (fanMode === MatterFanControl.FanMode.Off) {
            if (this.#hasOnOff) {
                await this.#ioBrokerDevice.setPower(false);
            } else if (this.#hasSpeedLevel) {
                await this.#ioBrokerDevice.setSpeedLevel(0);
            } else {
                this.#ioBrokerDevice.adapter.log.info(`${this.uuid}: Device cannot be switched off, ignoring Off mode`);
                await this.#updateMatterSpeed();
                return;
            }
        } else {
            if (this.#hasOnOff && this.#ioBrokerDevice.getPower() === false) {
                await this.#ioBrokerDevice.setPower(true);
            }
            const speed = mapFanModeToSpeed(fanMode);
            if (speed !== undefined) {
                await this.#writeSpeed(speed);
            }
        }

        // Percent Rules: the percent attributes follow the mode step, the device reports its own level again later
        await this.#matterEndpoint.setStateOf(this.#fanControlServer, this.#percentValues(fanMode, undefined));
    }

    async #handleMatterPercentChange(percent: number): Promise<void> {
        const fanMode = this.#mapPercentToFanMode(percent);
        if (this.#hasSpeedLevel) {
            await this.#ioBrokerDevice.setSpeedLevel(percent);
        }
        if (percent === 0) {
            if (this.#hasOnOff) {
                await this.#ioBrokerDevice.setPower(false);
            }
        } else {
            if (this.#hasOnOff && this.#ioBrokerDevice.getPower() === false) {
                await this.#ioBrokerDevice.setPower(true);
            }
            // With a percent state of its own the device keeps its speed step, so only the coarse fallback writes it
            if (!this.#hasSpeedLevel) {
                const speed = mapFanModeToSpeed(fanMode);
                if (speed !== undefined) {
                    await this.#writeSpeed(speed);
                }
            }
        }

        await this.#matterEndpoint.setStateOf(this.#fanControlServer, { fanMode, percentCurrent: percent });
    }

    async #updateMatterSpeed(): Promise<void> {
        const fanMode = this.#currentFanMode();
        await this.#matterEndpoint.setStateOf(this.#fanControlServer, {
            fanMode,
            ...this.#percentValues(fanMode, this.#speedLevel()),
        });
    }

    #registerIoBrokerHandlers(): void {
        this.#ioBrokerDevice.onChange(async event => {
            switch (event.property) {
                case PropertyType.Power:
                    await this.#matterEndpoint.setStateOf(OnOffServer, { onOff: !!event.value });
                    await this.#updateMatterSpeed();
                    break;
                case PropertyType.Speed:
                case PropertyType.SpeedLevel:
                    await this.#updateMatterSpeed();
                    break;
                case PropertyType.Swing:
                    if (this.#hasSwing) {
                        await this.#matterEndpoint.setStateOf(this.#fanControlServer, {
                            rockSetting: this.#mapSwingToRock(event.value),
                        });
                    }
                    break;
                case PropertyType.AirflowDirection:
                    if (this.#hasAirflowDirection) {
                        await this.#matterEndpoint.setStateOf(this.#fanControlServer, {
                            airflowDirection: this.#mapAirflowDirectionToMatter(event.value),
                        });
                    }
                    break;
            }
        });
    }
}
