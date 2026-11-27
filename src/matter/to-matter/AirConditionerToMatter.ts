import { Endpoint, type ActionContext } from '@matter/main';
import { HumiditySensorDevice, OnOffPlugInUnitDevice, RoomAirConditionerDevice } from '@matter/main/devices';
import { Thermostat as MatterThermostat } from '@matter/main/clusters';
import { FanControlServer, OnOffServer, ThermostatServer } from '@matter/main/behaviors';
import { hasLocalActor } from '@matter/main/protocol';
import { SetpointKind } from '../../lib/devices/ClimateControlDevice';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import { AirConditionerMode, type AirCondition } from '../../lib/devices/AirCondition';
import { GenericDeviceToMatter } from './GenericDeviceToMatter';
import { IoBrokerEvents } from '../behaviors/IoBrokerEvents';
import { IoIdentifyServer, IoPlugInUnitIdentifyServer } from '../behaviors/IdentifyServer';
import { IoBrokerContext } from '../behaviors/IoBrokerContext';
import { EventedOnOffPlugInUnitOnOffServer } from '../behaviors/EventedOnOffPlugInUnitOnOffServer';
import { MatterConverters } from '../ConversionUtils';
import { IoFanControlServer } from '../behaviors/IoFanControlServer';
import { FanControlMapping, type IoBrokerFanStates } from './FanControlMapping';
import {
    deriveThermostatFeatures,
    ThermostatSetpointBridge,
    thermostatInitialState,
    type ThermostatSetpointState,
} from '../ThermostatUtils';

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
    IoPlugInUnitIdentifyServer,
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
    readonly #fanControl?: FanControlMapping;
    readonly #supportedModes: AirConditionerMode[];
    readonly #validModes: AirConditionerMode[];
    readonly #setpoints: ThermostatSetpointBridge;

    constructor(ioBrokerDevice: AirCondition, name: string, uuid: string) {
        super(name, uuid);
        this.#ioBrokerDevice = ioBrokerDevice;

        const derivation = deriveThermostatFeatures<AirConditionerMode>({
            modes: this.#ioBrokerDevice.hasMode() ? this.#ioBrokerDevice.getModes() : [],
            modeMap: {
                heat: AirConditionerMode.Heat,
                cool: AirConditionerMode.Cool,
                auto: AirConditionerMode.Auto,
                off: AirConditionerMode.Off,
                fanOnly: AirConditionerMode.FanOnly,
                dry: AirConditionerMode.Dry,
            },
            supportedSetpointKinds: this.#ioBrokerDevice.supportedSetpointKinds(),
            // Matter has no Eco mode, controlled as Auto
            passthroughModes: [AirConditionerMode.Eco],
            fallbackFeature: MatterThermostat.Feature.Cooling,
        });
        this.#supportedModes = derivation.supportedModes;
        this.#validModes = derivation.validModes;

        if (derivation.autoModeIgnored) {
            this.#ioBrokerDevice.adapter.log.info(
                `${uuid}: AutoMode is supported, but no Heating or Cooling, ignoring AutoMode`,
            );
        }
        if (derivation.fallbackApplied) {
            this.#ioBrokerDevice.adapter.log.info(
                `${uuid}: Matter Thermostats need to either support heating or cooling. Defaulting to Cooling`,
            );
        }
        if (derivation.ignoredModes.length > 0) {
            this.#ioBrokerDevice.adapter.log.info(
                `${uuid}: Ignoring unsupported modes for Air Conditioner: ${derivation.ignoredModes.join(', ')}`,
            );
        }

        this.#thermostatServer = ThermostatServer.with(...derivation.clusterModes);

        const thermostatInit = thermostatInitialState(derivation.clusterModes, SetpointKind.Cooling);

        if (
            ioBrokerDevice.hasSpeed() ||
            ioBrokerDevice.hasSpeedLevel() ||
            ioBrokerDevice.hasSwing() ||
            ioBrokerDevice.hasAirflowDirection()
        ) {
            const fanStates = this.#fanStates();
            const fanControlServer = IoFanControlServer.with(...FanControlMapping.featuresFor(fanStates));
            const fanControl = new FanControlMapping(
                fanStates,
                {
                    fanMode: () => this.#matterEndpoint.stateOf(fanControlServer).fanMode,
                    percentSetting: () => this.#matterEndpoint.stateOf(fanControlServer).percentSetting,
                    set: values => this.#matterEndpoint.setStateOf(fanControlServer, values),
                },
                {
                    debug: message => ioBrokerDevice.adapter.log.debug(`${uuid}: ${message}`),
                    info: message => ioBrokerDevice.adapter.log.info(`${uuid}: ${message}`),
                },
            );
            this.#fanControl = fanControl;
            this.#fanControlServer = fanControlServer;
            this.#matterEndpoint = new Endpoint(
                IoRoomAirConditionerDeviceWithFan.with(this.#thermostatServer, fanControlServer),
                {
                    id: `${uuid}-RoomAirConditioner`,
                    ioBrokerContext: { device: ioBrokerDevice, adapter: ioBrokerDevice.adapter },
                    thermostat: thermostatInit,
                    fanControl: fanControl.initialState,
                },
            );
        } else {
            this.#matterEndpoint = new Endpoint(IoRoomAirConditionerDevice.with(this.#thermostatServer), {
                id: `${uuid}-RoomAirConditioner`,
                ioBrokerContext: { device: ioBrokerDevice, adapter: ioBrokerDevice.adapter },
                thermostat: thermostatInit,
            });
        }

        this.#setpoints = new ThermostatSetpointBridge({
            device: ioBrokerDevice,
            uuid,
            supportsHeating: this.#supportedModes.includes(AirConditionerMode.Heat),
            supportsCooling: this.#supportedModes.includes(AirConditionerMode.Cool),
            readState: () => this.#readThermostatState(),
            writeState: patch => this.#matterEndpoint.setStateOf(this.#thermostatServer, patch),
            scheduleDebounce: (callback, ms) => this.setDeviceTimeout(callback, ms),
            cancelDebounce: timeout => this.clearDeviceTimeout(timeout),
        });

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
        // Writing towards Matter, so the cluster's own feature set decides, not what the adapter reacts to
        if (mode === undefined || !this.#supportedModes.includes(mode)) {
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

    /** The fan follows the power of the air conditioner, so it cannot be switched off through FanControl. */
    #fanStates(): IoBrokerFanStates {
        const device = this.#ioBrokerDevice;
        return {
            deviceOn: () => this.#isOn() && this.#modeIsNotOff(),
            speed: device.hasSpeed()
                ? { modes: device.getSpeedModes(), get: () => device.getSpeed(), set: speed => device.setSpeed(speed) }
                : undefined,
            speedLevel: device.hasSpeedLevel()
                ? { get: () => device.getSpeedLevel(), set: percent => device.setSpeedLevel(percent) }
                : undefined,
            swing: device.hasSwing()
                ? { modes: device.getSwingModes(), get: () => device.getSwing(), set: swing => device.setSwing(swing) }
                : undefined,
            airflowDirection: device.hasAirflowDirection()
                ? { get: () => device.getAirflowDirection(), set: direction => device.setAirflowDirection(direction) }
                : undefined,
        };
    }

    #modeIsNotOff(): boolean {
        return !this.#ioBrokerDevice.hasMode() || this.#ioBrokerDevice.getMode() !== AirConditionerMode.Off;
    }

    /** OnOff reflects the power state; for Mode-only devices it is derived from MODE != Off. */
    #isOn(): boolean {
        if (this.#ioBrokerDevice.hasPower()) {
            return this.#ioBrokerDevice.getPower() ?? true;
        }
        return this.#modeIsNotOff();
    }

    #readThermostatState(): ThermostatSetpointState {
        const state = this.#matterEndpoint.stateOf(this.#thermostatServer);
        return {
            systemMode: state.systemMode,
            occupiedHeatingSetpoint: state.occupiedHeatingSetpoint,
            occupiedCoolingSetpoint: state.occupiedCoolingSetpoint,
        };
    }

    /** Matter RelativeHumidityMeasurement MeasuredValue = %RH * 100, constrained to 0..10000. */
    #toMatterHumidity(percent: number): number {
        return this.#ioBrokerDevice.cropValue(MatterConverters.toMatterHundredths(percent), 0, 10_000);
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
                MatterConverters.toMatterMeasurement(temperature, MatterConverters.toMatterHundredths) ?? undefined,
            ...(systemMode !== undefined ? { systemMode } : {}),
        });

        const data = this.#setpoints.initialSetpointState();
        if (Object.keys(data).length > 0) {
            await this.#matterEndpoint.setStateOf(this.#thermostatServer, data);
        }

        await this.#matterEndpoint.setStateOf(OnOffServer, { onOff: this.#isOn() });
        await this.#fanControl?.initialize();

        if (this.#matterEndpointHumidity?.owner !== undefined) {
            const humidity = this.#ioBrokerDevice.getHumidity();
            await this.#matterEndpointHumidity.set({
                relativeHumidityMeasurement: {
                    measuredValue: MatterConverters.toMatterMeasurement(humidity, value =>
                        this.#toMatterHumidity(value),
                    ),
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
                    this.#setpoints.scheduleSetpointWrite();
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
                    this.#setpoints.scheduleSetpointWrite();
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

        const fanControl = this.#fanControl;
        if (this.#fanControlServer !== undefined && fanControl !== undefined) {
            const fanEvents = this.#matterEndpoint.eventsOf(this.#fanControlServer);
            this.matterEvents.on(fanEvents.fanMode$Changed, async (_value, _oldValue, context) => {
                if (!hasLocalActor(context)) {
                    await fanControl.matterSpeedChanged();
                }
            });
            this.matterEvents.on(fanEvents.percentSetting$Changed, async (_value, _oldValue, context) => {
                if (!hasLocalActor(context)) {
                    await fanControl.matterSpeedChanged();
                }
            });
            if (fanEvents.rockSetting$Changed !== undefined) {
                this.matterEvents.on(fanEvents.rockSetting$Changed, async (value, _oldValue, context) => {
                    if (!hasLocalActor(context)) {
                        await fanControl.matterRockSettingChanged(value);
                    }
                });
            }
            if (fanEvents.airflowDirection$Changed !== undefined) {
                this.matterEvents.on(fanEvents.airflowDirection$Changed, async (value, _oldValue, context) => {
                    if (!hasLocalActor(context)) {
                        await fanControl.matterAirflowDirectionChanged(value);
                    }
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
                case PropertyType.Temperature: {
                    // matter.js takes no null here, so an unknown temperature keeps the last LocalTemperature
                    const externalMeasuredIndoorTemperature = MatterConverters.toMatterMeasurement(
                        event.value,
                        MatterConverters.toMatterHundredths,
                    );
                    if (externalMeasuredIndoorTemperature !== null) {
                        await this.#matterEndpoint.setStateOf(this.#thermostatServer, {
                            externalMeasuredIndoorTemperature,
                        });
                    }
                    break;
                }
                case PropertyType.Level:
                    await this.#setpoints.applyLevelChange(event.value as number);
                    break;
                case PropertyType.LevelHeating:
                    await this.#setpoints.applyDedicatedLevelChange(SetpointKind.Heating, event.value as number);
                    break;
                case PropertyType.LevelCooling:
                    await this.#setpoints.applyDedicatedLevelChange(SetpointKind.Cooling, event.value as number);
                    break;
                case PropertyType.Power: {
                    const on = !!event.value;
                    await this.#matterEndpoint.setStateOf(OnOffServer, { onOff: on });
                    await this.#fanControl?.ioBrokerChanged();
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
                    await this.#fanControl?.ioBrokerChanged();
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
                case PropertyType.Speed:
                case PropertyType.SpeedLevel:
                case PropertyType.Swing:
                case PropertyType.AirflowDirection:
                    await this.#fanControl?.ioBrokerChanged();
                    break;
                case PropertyType.Humidity:
                    if (this.#matterEndpointHumidity?.owner !== undefined) {
                        await this.#matterEndpointHumidity.set({
                            relativeHumidityMeasurement: {
                                measuredValue: MatterConverters.toMatterMeasurement(event.value, value =>
                                    this.#toMatterHumidity(value),
                                ),
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
