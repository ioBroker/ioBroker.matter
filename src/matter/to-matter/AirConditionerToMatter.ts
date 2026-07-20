import { Endpoint, type ActionContext } from '@matter/main';
import { HumiditySensorDevice, OnOffPlugInUnitDevice, RoomAirConditionerDevice } from '@matter/main/devices';
import { FanControl as MatterFanControl, Thermostat as MatterThermostat } from '@matter/main/clusters';
import { FanControlServer, OnOffServer, ThermostatServer } from '@matter/main/behaviors';
import { hasLocalActor } from '@matter/main/protocol';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import {
    AirConditionerMode,
    AirConditionerSpeed,
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

    #mapSpeedToFanMode(speed: AirConditionerSpeed | undefined): MatterFanControl.FanMode | undefined {
        switch (speed) {
            case AirConditionerSpeed.Auto:
                return MatterFanControl.FanMode.Auto;
            case AirConditionerSpeed.Low:
                return MatterFanControl.FanMode.Low;
            case AirConditionerSpeed.Quiet:
                this.#ioBrokerDevice.adapter.log.info(`${this.uuid}: Matter has no Quiet fan speed, reporting as Low`);
                return MatterFanControl.FanMode.Low;
            case AirConditionerSpeed.Medium:
                return MatterFanControl.FanMode.Medium;
            case AirConditionerSpeed.High:
                return MatterFanControl.FanMode.High;
            case AirConditionerSpeed.Turbo:
                this.#ioBrokerDevice.adapter.log.info(`${this.uuid}: Matter has no Turbo fan speed, reporting as High`);
                return MatterFanControl.FanMode.High;
        }
    }

    #mapFanModeToSpeed(fanMode: MatterFanControl.FanMode): AirConditionerSpeed | undefined {
        switch (fanMode) {
            case MatterFanControl.FanMode.Auto:
            case MatterFanControl.FanMode.Smart:
                return AirConditionerSpeed.Auto;
            case MatterFanControl.FanMode.Low:
                return AirConditionerSpeed.Low;
            case MatterFanControl.FanMode.Medium:
                return AirConditionerSpeed.Medium;
            case MatterFanControl.FanMode.High:
            case MatterFanControl.FanMode.On:
                return AirConditionerSpeed.High;
            case MatterFanControl.FanMode.Off:
                return undefined;
        }
    }

    #updateSetPointTemperature(delay = 1500): void {
        this.clearDeviceTimeout(this.#temperatureDebounceTimeout);
        this.#temperatureDebounceTimeout = this.setDeviceTimeout(() => {
            this.#temperatureDebounceTimeout = undefined;
            const systemMode = this.#matterEndpoint.stateOf(this.#thermostatServer).systemMode;
            if (systemMode === MatterThermostat.SystemMode.Heat || systemMode === MatterThermostat.SystemMode.Auto) {
                const heatingTemp = this.#matterEndpoint.stateOf(this.#thermostatServer).occupiedHeatingSetpoint;
                if (typeof heatingTemp === 'number') {
                    this.#ioBrokerDevice
                        .setLevel(MatterConverters.fromMatterHundredths(heatingTemp))
                        .catch(error => this.#ioBrokerDevice.adapter.log.warn(`Error setting level: ${error.message}`));
                }
            } else if (systemMode === MatterThermostat.SystemMode.Cool) {
                const coolingTemp = this.#matterEndpoint.stateOf(this.#thermostatServer).occupiedCoolingSetpoint;
                if (typeof coolingTemp === 'number') {
                    this.#ioBrokerDevice
                        .setLevel(MatterConverters.fromMatterHundredths(coolingTemp))
                        .catch(error => this.#ioBrokerDevice.adapter.log.warn(`Error setting level: ${error.message}`));
                }
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

        const setpointTemperature = this.#ioBrokerDevice.getLevel();
        if (typeof setpointTemperature === 'number') {
            const data: Record<string, number> = {};
            const minMax = this.#ioBrokerDevice.getSetpointMinMax() ?? { min: 7, max: 35 };
            const cropped = this.#ioBrokerDevice.cropValue(setpointTemperature, minMax.min, minMax.max, true);
            if (this.#supportedModes.includes(AirConditionerMode.Heat)) {
                data.occupiedHeatingSetpoint = MatterConverters.toMatterHundredths(cropped);
                data.minHeatSetpointLimit = MatterConverters.toMatterHundredths(Math.max(minMax.min, 0));
                data.maxHeatSetpointLimit = MatterConverters.toMatterHundredths(Math.min(minMax.max, 50));
            }
            if (this.#supportedModes.includes(AirConditionerMode.Cool)) {
                data.occupiedCoolingSetpoint = MatterConverters.toMatterHundredths(cropped);
                data.minCoolSetpointLimit = MatterConverters.toMatterHundredths(Math.max(minMax.min, 0));
                data.maxCoolSetpointLimit = MatterConverters.toMatterHundredths(Math.min(minMax.max, 50));
            }
            if (Object.keys(data).length > 0) {
                await this.#matterEndpoint.setStateOf(this.#thermostatServer, data);
            }
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
                ? this.#mapSpeedToFanMode(this.#ioBrokerDevice.getSpeed())
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
                    const speed = this.#mapFanModeToSpeed(value);
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
                if (typeof heatingTemp === 'number') {
                    await this.#ioBrokerDevice.setLevel(MatterConverters.fromMatterHundredths(heatingTemp));
                }
                break;
            }
            case MatterThermostat.SystemMode.Cool: {
                await setPower(true);
                await setMode(AirConditionerMode.Cool);
                const coolingTemp = this.#matterEndpoint.stateOf(this.#thermostatServer).occupiedCoolingSetpoint;
                if (typeof coolingTemp === 'number') {
                    await this.#ioBrokerDevice.setLevel(MatterConverters.fromMatterHundredths(coolingTemp));
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
                    const systemMode = this.#matterEndpoint.stateOf(this.#thermostatServer).systemMode;
                    const value = MatterConverters.toMatterHundredths(event.value as number);
                    if (
                        systemMode === MatterThermostat.SystemMode.Heat ||
                        systemMode === MatterThermostat.SystemMode.Auto
                    ) {
                        await this.#matterEndpoint.setStateOf(this.#thermostatServer, {
                            occupiedHeatingSetpoint: value,
                        });
                    }
                    if (
                        systemMode === MatterThermostat.SystemMode.Cool ||
                        systemMode === MatterThermostat.SystemMode.Auto
                    ) {
                        await this.#matterEndpoint.setStateOf(this.#thermostatServer, {
                            occupiedCoolingSetpoint: value,
                        });
                    }
                    break;
                }
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
                    const fanMode = this.#mapSpeedToFanMode(event.value as AirConditionerSpeed);
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
                            onOff: { onOff: event.value as boolean },
                        });
                    }
                    break;
            }
        });
    }
}
