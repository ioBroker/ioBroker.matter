import { Endpoint, type ActionContext } from '@matter/main';
import { HumiditySensorDevice, OnOffPlugInUnitDevice, RoomAirConditionerDevice } from '@matter/main/devices';
import { FanControl as MatterFanControl, Thermostat as MatterThermostat } from '@matter/main/clusters';
import { FanControlServer, OnOffServer, ThermostatServer } from '@matter/main/behaviors';
import { hasLocalActor } from '@matter/main/protocol';
import { SetpointKind } from '../../lib/devices/ClimateControlDevice';
import { mapFanModeToSpeed, mapSpeedToFanMode } from '../FanControlUtils';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import {
    AirConditionerMode,
    type AirConditionerSpeed,
    AirConditionerSwing,
    type AirCondition,
} from '../../lib/devices/AirCondition';
import { GenericDeviceToMatter } from './GenericDeviceToMatter';
import { IoBrokerEvents } from '../behaviors/IoBrokerEvents';
import { IoIdentifyServer } from '../behaviors/IdentifyServer';
import { IoBrokerContext } from '../behaviors/IoBrokerContext';
import { EventedOnOffPlugInUnitOnOffServer } from '../behaviors/EventedOnOffPlugInUnitOnOffServer';
import { MatterConverters } from '../ConversionUtils';

const IoRoomAirConditionerDevice = RoomAirConditionerDevice.with(
    ThermostatServer,
    IoBrokerEvents,
    IoIdentifyServer,
    IoBrokerContext,
);
const IoRoomAirConditionerDeviceWithFan = RoomAirConditionerDevice.with(
    ThermostatServer,
    FanControlServer,
    IoBrokerEvents,
    IoIdentifyServer,
    IoBrokerContext,
);

const IoOnOffPlugInUnitDevice = OnOffPlugInUnitDevice.with(
    EventedOnOffPlugInUnitOnOffServer,
    IoBrokerEvents,
    IoIdentifyServer,
    IoBrokerContext,
);
type IoOnOffPlugInUnitDevice = typeof IoOnOffPlugInUnitDevice;

/** Mapping Logic to map an ioBroker Air Conditioner device to a Matter RoomAirConditionerDevice. */
export class AirConditionerToMatter extends GenericDeviceToMatter {
    readonly #ioBrokerDevice: AirCondition;
    readonly #matterEndpoint: Endpoint;
    readonly #matterEndpointHumidity?: Endpoint<HumiditySensorDevice>;
    readonly #matterEndpointBoost?: Endpoint<IoOnOffPlugInUnitDevice>;
    readonly #thermostatServer;
    readonly #fanControlServer?;
    #supportedModes = new Array<AirConditionerMode>();
    #validModes = new Array<AirConditionerMode>();
    #hasFan: boolean;
    #hasSwing: boolean;
    #temperatureDebounceTimeout?: ioBroker.Timeout;

    constructor(ioBrokerDevice: AirCondition, name: string, uuid: string) {
        super(name, uuid);
        this.#ioBrokerDevice = ioBrokerDevice;

        const clusterModes = new Array<MatterThermostat.Feature>();
        const ignoredModes = new Array<AirConditionerMode>();
        const modes = this.#ioBrokerDevice.hasMode() ? this.#ioBrokerDevice.getModes() : [];
        for (const mode of modes) {
            switch (mode) {
                case AirConditionerMode.Heat:
                    this.#supportedModes.push(AirConditionerMode.Heat);
                    this.#validModes.push(AirConditionerMode.Heat);
                    clusterModes.push(MatterThermostat.Feature.Heating);
                    break;
                case AirConditionerMode.Cool:
                    this.#supportedModes.push(AirConditionerMode.Cool);
                    this.#validModes.push(AirConditionerMode.Cool);
                    clusterModes.push(MatterThermostat.Feature.Cooling);
                    break;
                case AirConditionerMode.Auto:
                    // handled below, needs Heating and Cooling
                    break;
                case AirConditionerMode.Off:
                    this.#supportedModes.push(AirConditionerMode.Off);
                    this.#validModes.push(AirConditionerMode.Off);
                    break;
                case AirConditionerMode.FanOnly:
                    this.#supportedModes.push(AirConditionerMode.FanOnly);
                    this.#validModes.push(AirConditionerMode.FanOnly);
                    break;
                case AirConditionerMode.Dry:
                    this.#supportedModes.push(AirConditionerMode.Dry);
                    this.#validModes.push(AirConditionerMode.Dry);
                    break;
                case AirConditionerMode.Eco:
                    // Matter has no Eco mode, controlled as Auto
                    this.#validModes.push(AirConditionerMode.Eco);
                    break;
                default:
                    ignoredModes.push(mode);
            }
        }
        // occupiedHeatingSetpoint/occupiedCoolingSetpoint are conformant to the Heating/Cooling feature, so an
        // undeclared feature means there is no attribute to carry the setpoint the device does have.
        for (const kind of this.#ioBrokerDevice.supportedSetpointKinds()) {
            if (kind === SetpointKind.Heating && !clusterModes.includes(MatterThermostat.Feature.Heating)) {
                clusterModes.push(MatterThermostat.Feature.Heating);
                this.#supportedModes.push(AirConditionerMode.Heat);
            } else if (kind === SetpointKind.Cooling && !clusterModes.includes(MatterThermostat.Feature.Cooling)) {
                clusterModes.push(MatterThermostat.Feature.Cooling);
                this.#supportedModes.push(AirConditionerMode.Cool);
            }
        }

        if (
            modes.includes(AirConditionerMode.Auto) &&
            clusterModes.includes(MatterThermostat.Feature.Heating) &&
            clusterModes.includes(MatterThermostat.Feature.Cooling)
        ) {
            clusterModes.push(MatterThermostat.Feature.AutoMode);
            this.#supportedModes.push(AirConditionerMode.Auto);
            this.#validModes.push(AirConditionerMode.Auto);
        }

        if (
            !clusterModes.includes(MatterThermostat.Feature.Heating) &&
            !clusterModes.includes(MatterThermostat.Feature.Cooling)
        ) {
            this.#ioBrokerDevice.adapter.log.info(
                `${uuid}: Matter Thermostats need to either support heating or cooling. Defaulting to Cooling`,
            );
            clusterModes.push(MatterThermostat.Feature.Cooling);
            this.#supportedModes.push(AirConditionerMode.Cool);
        }
        if (ignoredModes.length > 0) {
            this.#ioBrokerDevice.adapter.log.info(
                `${uuid}: Ignoring unsupported modes for Air Conditioner: ${ignoredModes.join(', ')}`,
            );
        }

        const hasHeating = clusterModes.includes(MatterThermostat.Feature.Heating);
        const hasCooling = clusterModes.includes(MatterThermostat.Feature.Cooling);

        this.#hasSwing = this.#ioBrokerDevice.hasSwing();
        this.#hasFan = this.#ioBrokerDevice.hasSpeed() || this.#hasSwing;

        this.#thermostatServer = ThermostatServer.with(...clusterModes);

        const thermostatInit = {
            systemMode: hasCooling ? MatterThermostat.SystemMode.Cool : MatterThermostat.SystemMode.Heat,
            controlSequenceOfOperation:
                hasHeating && hasCooling
                    ? MatterThermostat.ControlSequenceOfOperation.CoolingAndHeating
                    : hasCooling
                      ? MatterThermostat.ControlSequenceOfOperation.CoolingOnly
                      : MatterThermostat.ControlSequenceOfOperation.HeatingOnly,
            minSetpointDeadBand: clusterModes.includes(MatterThermostat.Feature.AutoMode) ? 0 : undefined,
            absMinHeatSetpointLimit: hasHeating ? MatterConverters.toMatterHundredths(0) : undefined,
            absMaxHeatSetpointLimit: hasHeating ? MatterConverters.toMatterHundredths(50) : undefined,
            absMinCoolSetpointLimit: hasCooling ? MatterConverters.toMatterHundredths(0) : undefined,
            absMaxCoolSetpointLimit: hasCooling ? MatterConverters.toMatterHundredths(50) : undefined,
        };

        if (this.#hasFan) {
            const fanFeatures = new Array<MatterFanControl.Feature>(MatterFanControl.Feature.Auto);
            if (this.#hasSwing) {
                fanFeatures.push(MatterFanControl.Feature.Rocking);
            }
            this.#fanControlServer = FanControlServer.with(...fanFeatures);
            this.#matterEndpoint = new Endpoint(
                IoRoomAirConditionerDeviceWithFan.with(this.#thermostatServer, this.#fanControlServer),
                {
                    id: `${uuid}-RoomAirConditioner`,
                    ioBrokerContext: { device: ioBrokerDevice, adapter: ioBrokerDevice.adapter },
                    thermostat: thermostatInit,
                    fanControl: {
                        fanMode: MatterFanControl.FanMode.Auto,
                        fanModeSequence: MatterFanControl.FanModeSequence.OffLowMedHighAuto,
                    },
                },
            );
        } else {
            this.#matterEndpoint = new Endpoint(IoRoomAirConditionerDevice.with(this.#thermostatServer), {
                id: `${uuid}-RoomAirConditioner`,
                ioBrokerContext: { device: ioBrokerDevice, adapter: ioBrokerDevice.adapter },
                thermostat: thermostatInit,
            });
        }

        if (this.#ioBrokerDevice.hasHumidity()) {
            this.#matterEndpointHumidity = new Endpoint(HumiditySensorDevice, { id: `${uuid}-Humidity` });
        }
        if (this.#ioBrokerDevice.hasBoost()) {
            this.#matterEndpointBoost = new Endpoint(IoOnOffPlugInUnitDevice, {
                id: `${uuid}-BoostOnOff`,
                ioBrokerContext: { device: ioBrokerDevice, adapter: ioBrokerDevice.adapter },
            });
        }
    }

    get matterEndpoints(): Endpoint[] {
        const endpoints: Endpoint[] = [this.#matterEndpoint];
        if (this.#matterEndpointHumidity) {
            endpoints.push(this.#matterEndpointHumidity);
        }
        if (this.#matterEndpointBoost) {
            endpoints.push(this.#matterEndpointBoost);
        }
        return endpoints;
    }

    get ioBrokerDevice(): AirCondition {
        return this.#ioBrokerDevice;
    }

    #mapModeToMatter(mode: AirConditionerMode | undefined): MatterThermostat.SystemMode | undefined {
        if (mode === undefined || !this.#validModes.includes(mode)) {
            return;
        }
        switch (mode) {
            case AirConditionerMode.Off:
                return MatterThermostat.SystemMode.Off;
            case AirConditionerMode.Heat:
                return MatterThermostat.SystemMode.Heat;
            case AirConditionerMode.Cool:
                return MatterThermostat.SystemMode.Cool;
            case AirConditionerMode.Auto:
                return MatterThermostat.SystemMode.Auto;
            case AirConditionerMode.FanOnly:
                return MatterThermostat.SystemMode.FanOnly;
            case AirConditionerMode.Dry:
                return MatterThermostat.SystemMode.Dry;
            case AirConditionerMode.Eco:
                this.#ioBrokerDevice.adapter.log.info(`${this.uuid}: Matter has no Eco mode, reporting as Auto`);
                return MatterThermostat.SystemMode.Auto;
        }
    }

    /** First non-Off mode to use when an external "on" arrives for a device that only exposes a Mode state. */
    #defaultOnMode(): AirConditionerMode | undefined {
        return (
            [
                AirConditionerMode.Auto,
                AirConditionerMode.Cool,
                AirConditionerMode.Heat,
                AirConditionerMode.FanOnly,
                AirConditionerMode.Dry,
            ].find(mode => this.#validModes.includes(mode)) ?? undefined
        );
    }

    #speedToFanMode(speed: AirConditionerSpeed | undefined): MatterFanControl.FanMode | undefined {
        return mapSpeedToFanMode(speed, (unsupported, reportedAs) =>
            this.#ioBrokerDevice.adapter.log.info(
                `${this.uuid}: Matter has no ${unsupported} fan speed, reporting as ${reportedAs}`,
            ),
        );
    }

    #setpointValue(kind: SetpointKind): number | undefined {
        if (!this.#ioBrokerDevice.hasSetpoint(kind)) {
            return undefined;
        }
        const value = this.#ioBrokerDevice.getSetpoint(kind);
        return typeof value === 'number' ? value : undefined;
    }

    /**
     * Both kinds resolve to the same ioBroker state when the device exposes neither dedicated setpoint, so in
     * Auto only one of them may be written — the second write would just overwrite the first.
     */
    get #setpointStateIsShared(): boolean {
        return !this.#ioBrokerDevice.hasLevelHeating() && !this.#ioBrokerDevice.hasLevelCooling();
    }

    /**
     * Puts the value the ioBroker side really holds back on a setpoint attribute. A dropped write would otherwise
     * leave the controller showing a temperature the device never accepted, with nothing to correct it later.
     */
    #restoreSetpointAttribute(kind: SetpointKind): void {
        const supported =
            kind === SetpointKind.Heating
                ? this.#supportedModes.includes(AirConditionerMode.Heat)
                : this.#supportedModes.includes(AirConditionerMode.Cool);
        const value = this.#ioBrokerDevice.hasLevel() ? this.#ioBrokerDevice.getLevel() : undefined;
        if (!supported || typeof value !== 'number') {
            return;
        }
        const matterValue = MatterConverters.toMatterHundredths(value);
        this.#matterEndpoint
            .setStateOf(
                this.#thermostatServer,
                kind === SetpointKind.Heating
                    ? { occupiedHeatingSetpoint: matterValue }
                    : { occupiedCoolingSetpoint: matterValue },
            )
            .catch(error =>
                this.#ioBrokerDevice.adapter.log.warn(`Error restoring ${kind} setpoint: ${error.message}`),
            );
    }

    #writeSetpoint(kind: SetpointKind, matterValue: number): void {
        if (!this.#ioBrokerDevice.hasSetpoint(kind)) {
            // The shared setpoint state stands for the other kind while the ioBroker mode disagrees with the Matter
            // system mode; writing it anyway would store a temperature meant for one kind under the other
            this.#ioBrokerDevice.adapter.log.debug(
                `${this.uuid}: Dropping ${kind} setpoint write, no ioBroker state currently represents the ${kind} setpoint`,
            );
            this.#restoreSetpointAttribute(kind);
            return;
        }
        this.#ioBrokerDevice
            .setSetpoint(kind, MatterConverters.fromMatterHundredths(matterValue))
            .catch(error => this.#ioBrokerDevice.adapter.log.warn(`Error setting ${kind} setpoint: ${error.message}`));
    }

    #updateSetPointTemperature(delay = 1500): void {
        if (
            !this.#ioBrokerDevice.hasSetpoint(SetpointKind.Heating) &&
            !this.#ioBrokerDevice.hasSetpoint(SetpointKind.Cooling)
        ) {
            return;
        }
        this.clearDeviceTimeout(this.#temperatureDebounceTimeout);
        this.#temperatureDebounceTimeout = this.setDeviceTimeout(() => {
            this.#temperatureDebounceTimeout = undefined;
            const state = this.#matterEndpoint.stateOf(this.#thermostatServer);
            const systemMode = state.systemMode;
            if (
                (systemMode === MatterThermostat.SystemMode.Heat || systemMode === MatterThermostat.SystemMode.Auto) &&
                typeof state.occupiedHeatingSetpoint === 'number'
            ) {
                this.#writeSetpoint(SetpointKind.Heating, state.occupiedHeatingSetpoint);
            }
            if (
                (systemMode === MatterThermostat.SystemMode.Cool ||
                    (systemMode === MatterThermostat.SystemMode.Auto && !this.#setpointStateIsShared)) &&
                typeof state.occupiedCoolingSetpoint === 'number'
            ) {
                this.#writeSetpoint(SetpointKind.Cooling, state.occupiedCoolingSetpoint);
            } else if (
                systemMode === MatterThermostat.SystemMode.Auto &&
                this.#setpointStateIsShared &&
                typeof state.occupiedCoolingSetpoint === 'number'
            ) {
                this.#ioBrokerDevice.adapter.log.debug(
                    `${this.uuid}: Dropping cooling setpoint write, in Auto the single ioBroker setpoint state follows the heating setpoint`,
                );
                this.#restoreSetpointAttribute(SetpointKind.Cooling);
            }
        }, delay);
    }

    async registerHandlersAndInitialize(): Promise<void> {
        await super.registerHandlersAndInitialize();

        await this.#initializeMatterState();
        this.#registerMatterHandlers();
        this.#registerIoBrokerHandlers();
    }

    async #initializeMatterState(): Promise<void> {
        const temperature = this.#ioBrokerDevice.hasTemperature() ? this.#ioBrokerDevice.getTemperature() : undefined;

        let systemMode =
            this.#ioBrokerDevice.hasPower() && !this.#ioBrokerDevice.getPower()
                ? MatterThermostat.SystemMode.Off
                : undefined;
        if (systemMode === undefined && this.#ioBrokerDevice.hasMode()) {
            systemMode = this.#mapModeToMatter(this.#ioBrokerDevice.getMode());
        }
        if (systemMode === undefined) {
            systemMode = this.#supportedModes.includes(AirConditionerMode.Cool)
                ? MatterThermostat.SystemMode.Cool
                : this.#supportedModes.includes(AirConditionerMode.Heat)
                  ? MatterThermostat.SystemMode.Heat
                  : undefined;
        }

        await this.#matterEndpoint.setStateOf(this.#thermostatServer, {
            externalMeasuredIndoorTemperature:
                typeof temperature === 'number' ? MatterConverters.toMatterHundredths(temperature) : undefined,
            ...(systemMode !== undefined ? { systemMode } : {}),
        });

        const data: Record<string, number> = {};
        if (this.#supportedModes.includes(AirConditionerMode.Heat)) {
            const setpoint = this.#setpointValue(SetpointKind.Heating);
            if (setpoint !== undefined) {
                const minMax = this.#ioBrokerDevice.getSetpointMinMax(SetpointKind.Heating) ?? { min: 7, max: 35 };
                data.occupiedHeatingSetpoint = MatterConverters.toMatterHundredths(
                    this.#ioBrokerDevice.cropValue(setpoint, minMax.min, minMax.max, true),
                );
                data.minHeatSetpointLimit = MatterConverters.toMatterHundredths(Math.max(minMax.min, 0));
                data.maxHeatSetpointLimit = MatterConverters.toMatterHundredths(Math.min(minMax.max, 50));
            }
        }
        if (this.#supportedModes.includes(AirConditionerMode.Cool)) {
            const setpoint = this.#setpointValue(SetpointKind.Cooling);
            if (setpoint !== undefined) {
                const minMax = this.#ioBrokerDevice.getSetpointMinMax(SetpointKind.Cooling) ?? { min: 7, max: 35 };
                data.occupiedCoolingSetpoint = MatterConverters.toMatterHundredths(
                    this.#ioBrokerDevice.cropValue(setpoint, minMax.min, minMax.max, true),
                );
                data.minCoolSetpointLimit = MatterConverters.toMatterHundredths(Math.max(minMax.min, 0));
                data.maxCoolSetpointLimit = MatterConverters.toMatterHundredths(Math.min(minMax.max, 50));
            }
        }
        if (Object.keys(data).length > 0) {
            await this.#matterEndpoint.setStateOf(this.#thermostatServer, data);
        }

        // OnOff reflects the power state; for Mode-only devices it is derived from MODE != Off
        const on = this.#ioBrokerDevice.hasPower()
            ? (this.#ioBrokerDevice.getPower() ?? true)
            : this.#ioBrokerDevice.hasMode()
              ? this.#ioBrokerDevice.getMode() !== AirConditionerMode.Off
              : true;
        await this.#matterEndpoint.setStateOf(OnOffServer, { onOff: on });

        if (this.#fanControlServer) {
            const fanMode = this.#ioBrokerDevice.hasSpeed()
                ? this.#speedToFanMode(this.#ioBrokerDevice.getSpeed())
                : undefined;
            await this.#matterEndpoint.setStateOf(this.#fanControlServer, {
                ...(fanMode !== undefined ? { fanMode } : {}),
                ...(this.#hasSwing
                    ? {
                          rockSupport: { rockLeftRight: true, rockUpDown: true, rockRound: false },
                          rockSetting: this.#mapSwingToRock(this.#ioBrokerDevice.getSwing()),
                      }
                    : {}),
            });
        }

        if (this.#matterEndpointHumidity?.owner !== undefined) {
            const humidity = this.#ioBrokerDevice.getHumidity();
            await this.#matterEndpointHumidity.set({
                relativeHumidityMeasurement: {
                    measuredValue: typeof humidity === 'number' ? MatterConverters.toMatterHundredths(humidity) : null,
                },
            });
        }

        if (this.#matterEndpointBoost?.owner !== undefined) {
            await this.#matterEndpointBoost.set({
                onOff: { onOff: this.#boostToOnOff(this.#ioBrokerDevice.getBoost()) },
            });
        }
    }

    #boostToOnOff(value: boolean | number | undefined): boolean {
        return typeof value === 'number' ? value !== 0 : !!value;
    }

    #mapSwingToRock(swing: AirConditionerSwing | undefined): {
        rockLeftRight: boolean;
        rockUpDown: boolean;
        rockRound: boolean;
    } {
        if (swing === AirConditionerSwing.Horizontal) {
            return { rockLeftRight: true, rockUpDown: false, rockRound: false };
        }
        if (swing === AirConditionerSwing.Vertical) {
            return { rockLeftRight: false, rockUpDown: true, rockRound: false };
        }
        if (swing === AirConditionerSwing.Auto) {
            this.#ioBrokerDevice.adapter.log.info(`${this.uuid}: Matter has no Auto swing, enabling rocking`);
            return { rockLeftRight: true, rockUpDown: false, rockRound: false };
        }
        return { rockLeftRight: false, rockUpDown: false, rockRound: false };
    }

    #registerMatterHandlers(): void {
        const thermostatEvents = this.#matterEndpoint.eventsOf(this.#thermostatServer);
        if (thermostatEvents?.systemMode$Changed !== undefined) {
            this.matterEvents.on(thermostatEvents.systemMode$Changed, async (value, _oldValue, context) => {
                if (hasLocalActor(context)) {
                    return;
                }
                await this.#handleMatterSystemModeChange(value);
            });
        }
        if (
            this.#supportedModes.includes(AirConditionerMode.Heat) &&
            thermostatEvents?.occupiedHeatingSetpoint$Changed !== undefined
        ) {
            this.matterEvents.on(
                thermostatEvents.occupiedHeatingSetpoint$Changed,
                // @ts-expect-error Workaround a matter.js instancing/typing error
                (_value: unknown, _oldValue: unknown, context: ActionContext) => {
                    if (hasLocalActor(context)) {
                        return;
                    }
                    this.#updateSetPointTemperature();
                },
            );
        }
        if (
            this.#supportedModes.includes(AirConditionerMode.Cool) &&
            thermostatEvents?.occupiedCoolingSetpoint$Changed !== undefined
        ) {
            this.matterEvents.on(
                thermostatEvents.occupiedCoolingSetpoint$Changed,
                // @ts-expect-error Workaround a matter.js instancing/typing error
                (_value: unknown, _oldValue: unknown, context: ActionContext) => {
                    if (hasLocalActor(context)) {
                        return;
                    }
                    this.#updateSetPointTemperature();
                },
            );
        }

        const onOffEvents = this.#matterEndpoint.eventsOf(OnOffServer);
        if (onOffEvents?.onOff$Changed !== undefined) {
            this.matterEvents.on(onOffEvents.onOff$Changed, async (value, _oldValue, context) => {
                if (hasLocalActor(context)) {
                    return;
                }
                if (this.#ioBrokerDevice.hasPower()) {
                    await this.#ioBrokerDevice.setPower(!!value);
                } else if (this.#ioBrokerDevice.hasMode()) {
                    // Mode-only device: translate on/off into the MODE state
                    if (!value) {
                        if (this.#validModes.includes(AirConditionerMode.Off)) {
                            await this.#ioBrokerDevice.setMode(AirConditionerMode.Off);
                        }
                    } else if (this.#ioBrokerDevice.getMode() === AirConditionerMode.Off) {
                        const onMode = this.#defaultOnMode();
                        if (onMode !== undefined) {
                            await this.#ioBrokerDevice.setMode(onMode);
                        }
                    }
                }
            });
        }

        if (this.#fanControlServer) {
            const fanEvents = this.#matterEndpoint.eventsOf(this.#fanControlServer);
            if (this.#ioBrokerDevice.hasSpeed() && fanEvents?.fanMode$Changed !== undefined) {
                this.matterEvents.on(fanEvents.fanMode$Changed, async (value, _oldValue, context) => {
                    if (hasLocalActor(context)) {
                        return;
                    }
                    const speed = mapFanModeToSpeed(value);
                    if (speed !== undefined) {
                        await this.#ioBrokerDevice.setSpeed(speed);
                    }
                });
            }
            if (this.#hasSwing && fanEvents?.rockSetting$Changed !== undefined) {
                this.matterEvents.on(fanEvents.rockSetting$Changed, async (value, _oldValue, context) => {
                    if (hasLocalActor(context)) {
                        return;
                    }
                    let swing = AirConditionerSwing.Stationary;
                    if (value?.rockLeftRight) {
                        swing = AirConditionerSwing.Horizontal;
                    } else if (value?.rockUpDown || value?.rockRound) {
                        swing = AirConditionerSwing.Vertical;
                    }
                    await this.#ioBrokerDevice.setSwing(swing);
                });
            }
        }

        if (this.#matterEndpointBoost) {
            this.matterEvents.on(
                this.#matterEndpointBoost.events.ioBrokerEvents.onOffControlled,
                async on => await this.#ioBrokerDevice.setBoost(on),
            );
        }
    }

    async #handleMatterSystemModeChange(value: MatterThermostat.SystemMode): Promise<void> {
        const setPower = async (on: boolean): Promise<void> => {
            if (this.#ioBrokerDevice.hasPower() && this.#ioBrokerDevice.getPower() !== on) {
                await this.#ioBrokerDevice.setPower(on);
            }
        };
        const setMode = async (mode: AirConditionerMode): Promise<void> => {
            if (this.#ioBrokerDevice.hasMode() && this.#validModes.includes(mode)) {
                await this.#ioBrokerDevice.setMode(mode);
            }
        };

        switch (value) {
            case MatterThermostat.SystemMode.Off:
                await setPower(false);
                await setMode(AirConditionerMode.Off);
                break;
            case MatterThermostat.SystemMode.Heat: {
                await setPower(true);
                await setMode(AirConditionerMode.Heat);
                const heatingTemp = this.#matterEndpoint.stateOf(this.#thermostatServer).occupiedHeatingSetpoint;
                if (typeof heatingTemp === 'number' && this.#ioBrokerDevice.hasSetpoint(SetpointKind.Heating)) {
                    await this.#ioBrokerDevice.setSetpoint(
                        SetpointKind.Heating,
                        MatterConverters.fromMatterHundredths(heatingTemp),
                    );
                }
                break;
            }
            case MatterThermostat.SystemMode.Cool: {
                await setPower(true);
                await setMode(AirConditionerMode.Cool);
                const coolingTemp = this.#matterEndpoint.stateOf(this.#thermostatServer).occupiedCoolingSetpoint;
                if (typeof coolingTemp === 'number' && this.#ioBrokerDevice.hasSetpoint(SetpointKind.Cooling)) {
                    await this.#ioBrokerDevice.setSetpoint(
                        SetpointKind.Cooling,
                        MatterConverters.fromMatterHundredths(coolingTemp),
                    );
                }
                break;
            }
            case MatterThermostat.SystemMode.Auto:
                await setPower(true);
                await setMode(AirConditionerMode.Auto);
                break;
            case MatterThermostat.SystemMode.FanOnly:
                await setPower(true);
                await setMode(AirConditionerMode.FanOnly);
                break;
            case MatterThermostat.SystemMode.Dry:
                await setPower(true);
                await setMode(AirConditionerMode.Dry);
                break;
        }
    }

    #registerIoBrokerHandlers(): void {
        this.#ioBrokerDevice.onChange(async event => {
            switch (event.property) {
                case PropertyType.Temperature:
                    if (typeof event.value === 'number') {
                        await this.#matterEndpoint.setStateOf(this.#thermostatServer, {
                            externalMeasuredIndoorTemperature: MatterConverters.toMatterHundredths(event.value),
                        });
                    }
                    break;
                case PropertyType.Level: {
                    // The plain setpoint only stands for a kind that has no dedicated state of its own
                    const systemMode = this.#matterEndpoint.stateOf(this.#thermostatServer).systemMode;
                    const value = MatterConverters.toMatterHundredths(event.value as number);
                    if (
                        !this.#ioBrokerDevice.hasLevelHeating() &&
                        (systemMode === MatterThermostat.SystemMode.Heat ||
                            systemMode === MatterThermostat.SystemMode.Auto)
                    ) {
                        await this.#matterEndpoint.setStateOf(this.#thermostatServer, {
                            occupiedHeatingSetpoint: value,
                        });
                    }
                    if (
                        !this.#ioBrokerDevice.hasLevelCooling() &&
                        (systemMode === MatterThermostat.SystemMode.Cool ||
                            systemMode === MatterThermostat.SystemMode.Auto)
                    ) {
                        await this.#matterEndpoint.setStateOf(this.#thermostatServer, {
                            occupiedCoolingSetpoint: value,
                        });
                    }
                    break;
                }
                case PropertyType.LevelHeating:
                    await this.#matterEndpoint.setStateOf(this.#thermostatServer, {
                        occupiedHeatingSetpoint: MatterConverters.toMatterHundredths(event.value as number),
                    });
                    break;
                case PropertyType.LevelCooling:
                    await this.#matterEndpoint.setStateOf(this.#thermostatServer, {
                        occupiedCoolingSetpoint: MatterConverters.toMatterHundredths(event.value as number),
                    });
                    break;
                case PropertyType.Power: {
                    const on = !!event.value;
                    await this.#matterEndpoint.setStateOf(OnOffServer, { onOff: on });
                    // Re-sync the active mode on power-on: Mode changes are suppressed while powered off
                    if (on && this.#ioBrokerDevice.hasMode()) {
                        const systemMode = this.#mapModeToMatter(this.#ioBrokerDevice.getMode());
                        if (systemMode !== undefined) {
                            await this.#matterEndpoint.setStateOf(this.#thermostatServer, { systemMode });
                        }
                    }
                    break;
                }
                case PropertyType.Mode: {
                    const mode = event.value as AirConditionerMode;
                    const systemMode = this.#mapModeToMatter(mode);
                    if (systemMode === undefined) {
                        return;
                    }
                    if (this.#ioBrokerDevice.hasPower()) {
                        // OnOff is driven by the dedicated POWER state; only report the mode while powered on
                        if (!this.#ioBrokerDevice.getPower()) {
                            return;
                        }
                        await this.#matterEndpoint.setStateOf(this.#thermostatServer, { systemMode });
                    } else {
                        // Mode-only device: MODE drives both OnOff and the active system mode
                        const on = mode !== AirConditionerMode.Off;
                        await this.#matterEndpoint.setStateOf(OnOffServer, { onOff: on });
                        if (on) {
                            await this.#matterEndpoint.setStateOf(this.#thermostatServer, { systemMode });
                        }
                    }
                    break;
                }
                case PropertyType.Speed: {
                    if (!this.#fanControlServer) {
                        return;
                    }
                    const fanMode = this.#speedToFanMode(event.value as AirConditionerSpeed);
                    if (fanMode !== undefined) {
                        await this.#matterEndpoint.setStateOf(this.#fanControlServer, { fanMode });
                    }
                    break;
                }
                case PropertyType.Swing: {
                    if (!this.#fanControlServer || !this.#hasSwing) {
                        return;
                    }
                    await this.#matterEndpoint.setStateOf(this.#fanControlServer, {
                        rockSetting: this.#mapSwingToRock(event.value as AirConditionerSwing),
                    });
                    break;
                }
                case PropertyType.Humidity:
                    if (this.#matterEndpointHumidity?.owner !== undefined && typeof event.value === 'number') {
                        await this.#matterEndpointHumidity.set({
                            relativeHumidityMeasurement: {
                                measuredValue: MatterConverters.toMatterHundredths(event.value),
                            },
                        });
                    }
                    break;
                case PropertyType.Boost:
                    if (this.#matterEndpointBoost?.owner !== undefined) {
                        await this.#matterEndpointBoost.set({
                            onOff: { onOff: this.#boostToOnOff(event.value as boolean | number) },
                        });
                    }
                    break;
            }
        });
    }
}
