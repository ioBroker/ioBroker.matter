import { Endpoint, type ActionContext } from '@matter/main';
import { HumiditySensorDevice, ThermostatDevice, OnOffPlugInUnitDevice } from '@matter/main/devices';
import { Thermostat as MatterThermostat } from '@matter/main/clusters';
import { SetpointKind } from '../../lib/devices/ClimateControlDevice';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import { ThermostatServer } from '@matter/main/behaviors';
import { ThermostatMode, type Thermostat } from '../../lib/devices/Thermostat';
import { GenericDeviceToMatter } from './GenericDeviceToMatter';
import { IoBrokerEvents } from '../behaviors/IoBrokerEvents';
import { IoIdentifyServer } from '../behaviors/IdentifyServer';
import { IoBrokerContext } from '../behaviors/IoBrokerContext';
import { EventedOnOffPlugInUnitOnOffServer } from '../behaviors/EventedOnOffPlugInUnitOnOffServer';
import { hasLocalActor } from '@matter/main/protocol';
import { MatterConverters } from '../ConversionUtils';
import {
    deriveThermostatFeatures,
    ThermostatSetpointBridge,
    thermostatInitialState,
    type ThermostatSetpointState,
} from '../ThermostatUtils';

const IoThermostatDevice = ThermostatDevice.with(IoBrokerEvents, IoIdentifyServer, IoBrokerContext);
type IoThermostatDevice = typeof IoThermostatDevice;

const IoOnOffPlugInUnitDevice = OnOffPlugInUnitDevice.with(
    EventedOnOffPlugInUnitOnOffServer,
    IoBrokerEvents,
    IoBrokerContext,
);
type IoOnOffPlugInUnitDevice = typeof IoOnOffPlugInUnitDevice;

/** Mapping Logic to map an ioBroker Temperature device to a Matter TemperatureSensorDevice. */
export class ThermostatToMatter extends GenericDeviceToMatter {
    readonly #ioBrokerDevice: Thermostat;
    readonly #matterEndpointThermostat: Endpoint<IoThermostatDevice>;
    readonly #matterEndpointHumidity?: Endpoint<HumiditySensorDevice>;
    readonly #matterEndpointBoost?: Endpoint<IoOnOffPlugInUnitDevice>;
    readonly #supportedModes: ThermostatMode[];
    readonly #validModes: ThermostatMode[];
    readonly #ThermostatServer;
    readonly #setpoints: ThermostatSetpointBridge;

    constructor(ioBrokerDevice: Thermostat, name: string, uuid: string) {
        super(name, uuid);

        this.#ioBrokerDevice = ioBrokerDevice;

        const derivation = deriveThermostatFeatures<ThermostatMode>({
            modes: this.#ioBrokerDevice.hasMode() ? this.#ioBrokerDevice.getModes() : [],
            modeMap: {
                heat: ThermostatMode.Heat,
                cool: ThermostatMode.Cool,
                auto: ThermostatMode.Auto,
                off: ThermostatMode.Off,
                fanOnly: ThermostatMode.FanOnly,
                dry: ThermostatMode.Dry,
            },
            supportedSetpointKinds: this.#ioBrokerDevice.supportedSetpointKinds(),
            fallbackFeature: MatterThermostat.Feature.Heating,
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
                `${uuid}: Matter Thermostats need to either support heating or cooling. Defaulting to Heating`,
            );
        }
        if (derivation.ignoredModes.length > 0) {
            this.#ioBrokerDevice.adapter.log.info(
                `${uuid}: Ignoring unsupported modes for Thermostat: ${derivation.ignoredModes.join(', ')}`,
            );
        }
        this.#ioBrokerDevice.adapter.log.info(
            `Mapped Thermostat Modes "${this.#supportedModes.join('","')}" to Matter Features "${derivation.clusterModes.map(feature => MatterThermostat.Feature[feature]).join('","')}"`,
        );
        this.#ioBrokerDevice.adapter.log.info(
            `Valid Modes the adapter will react on from ioBroker Device: ${this.#validModes.length ? `"${this.#validModes.join('","')}"` : 'None, Mode state is ignored'}`,
        );

        this.#ThermostatServer = ThermostatServer.with(...derivation.clusterModes);
        this.#matterEndpointThermostat = new Endpoint(IoThermostatDevice.with(this.#ThermostatServer), {
            id: `${uuid}-Thermostat`,
            ioBrokerContext: {
                device: ioBrokerDevice,
                adapter: ioBrokerDevice.adapter,
            },
            // Values are corrected later again with real values
            thermostat: thermostatInitialState(derivation.clusterModes, SetpointKind.Heating),
        });
        this.#setpoints = new ThermostatSetpointBridge({
            device: ioBrokerDevice,
            uuid,
            supportsHeating: this.#supportedModes.includes(ThermostatMode.Heat),
            supportsCooling: this.#supportedModes.includes(ThermostatMode.Cool),
            readState: () => this.#readThermostatState(),
            writeState: patch => this.#matterEndpointThermostat.setStateOf(this.#ThermostatServer, patch),
            scheduleDebounce: (callback, ms) => this.setDeviceTimeout(callback, ms),
            cancelDebounce: timeout => this.clearDeviceTimeout(timeout),
        });
        if (this.#ioBrokerDevice.hasHumidity()) {
            this.#matterEndpointHumidity = new Endpoint(HumiditySensorDevice, { id: `${uuid}-Humidity` });
        }
        if (this.#ioBrokerDevice.hasBoost()) {
            this.#matterEndpointBoost = new Endpoint(
                OnOffPlugInUnitDevice.with(
                    EventedOnOffPlugInUnitOnOffServer,
                    IoBrokerEvents,
                    IoIdentifyServer,
                    IoBrokerContext,
                ),
                {
                    id: `${uuid}-BoostOnOff`,
                    ioBrokerContext: {
                        device: ioBrokerDevice,
                        adapter: ioBrokerDevice.adapter,
                    },
                },
            );
        }
    }

    get matterEndpoints(): Endpoint[] {
        const endpoints: Endpoint[] = [this.#matterEndpointThermostat];
        if (this.#matterEndpointHumidity) {
            endpoints.push(this.#matterEndpointHumidity);
        }
        if (this.#matterEndpointBoost) {
            endpoints.push(this.#matterEndpointBoost);
        }
        return endpoints;
    }

    get ioBrokerDevice(): Thermostat {
        return this.#ioBrokerDevice;
    }

    #mapModeToMatter(mode: ThermostatMode | undefined): MatterThermostat.SystemMode | undefined {
        if (mode === undefined || !this.#validModes.includes(mode)) {
            return;
        }
        switch (mode) {
            case ThermostatMode.Heat:
                return MatterThermostat.SystemMode.Heat;
            case ThermostatMode.Cool:
                return MatterThermostat.SystemMode.Cool;
            case ThermostatMode.Auto:
                return MatterThermostat.SystemMode.Auto;
            case ThermostatMode.FanOnly:
                return MatterThermostat.SystemMode.FanOnly;
            case ThermostatMode.Dry:
                return MatterThermostat.SystemMode.Dry;
        }
    }

    #readThermostatState(): ThermostatSetpointState {
        const state = this.#matterEndpointThermostat.stateOf(this.#ThermostatServer);
        return {
            systemMode: state.systemMode,
            occupiedHeatingSetpoint: state.occupiedHeatingSetpoint,
            occupiedCoolingSetpoint: state.occupiedCoolingSetpoint,
        };
    }

    async registerHandlersAndInitialize(): Promise<void> {
        await super.registerHandlersAndInitialize();

        const temperature = this.#ioBrokerDevice.hasTemperature() ? this.#ioBrokerDevice.getTemperature() : undefined;
        let systemMode =
            this.#ioBrokerDevice.hasPower() && !this.#ioBrokerDevice.getPower()
                ? MatterThermostat.SystemMode.Off
                : undefined;
        if (systemMode === undefined && this.#ioBrokerDevice.hasMode()) {
            systemMode = this.#mapModeToMatter(this.#ioBrokerDevice.getMode());
        }
        if (systemMode === undefined) {
            systemMode = this.#supportedModes.includes(ThermostatMode.Heat)
                ? MatterThermostat.SystemMode.Heat
                : this.#supportedModes.includes(ThermostatMode.Cool)
                  ? MatterThermostat.SystemMode.Cool
                  : undefined;
            if (systemMode === undefined) {
                this.#ioBrokerDevice.adapter.log.error(`${this.uuid}: Could not determine SystemMode`);
            }
        }
        const controlSequenceOfOperation =
            this.#supportedModes.includes(ThermostatMode.Heat) && this.#supportedModes.includes(ThermostatMode.Cool)
                ? MatterThermostat.ControlSequenceOfOperation.CoolingAndHeating
                : this.#supportedModes.includes(ThermostatMode.Heat)
                  ? MatterThermostat.ControlSequenceOfOperation.HeatingOnly
                  : MatterThermostat.ControlSequenceOfOperation.CoolingOnly;
        await this.#matterEndpointThermostat.setStateOf(this.#ThermostatServer, {
            externalMeasuredIndoorTemperature:
                typeof temperature === 'number' ? MatterConverters.toMatterHundredths(temperature) : undefined,
            systemMode,
            controlSequenceOfOperation,
        });
        const data = this.#setpoints.initialSetpointState({
            [SetpointKind.Heating]: { min: 7, max: 30 },
            [SetpointKind.Cooling]: { min: 16, max: 32 },
        });
        if (Object.keys(data).length > 0) {
            this.#ioBrokerDevice.adapter.log.debug(`Setting Thermostat setpoints to ${JSON.stringify(data)}`);
            await this.#matterEndpointThermostat.setStateOf(this.#ThermostatServer, data);
        }

        const events = this.#matterEndpointThermostat.eventsOf(this.#ThermostatServer);
        if (events?.systemMode$Changed !== undefined) {
            this.matterEvents.on(events.systemMode$Changed, async (value, _oldValue, context) => {
                if (hasLocalActor(context)) {
                    return;
                }
                switch (value) {
                    case MatterThermostat.SystemMode.Off:
                        if (this.#ioBrokerDevice.hasPower() && this.#ioBrokerDevice.getPower()) {
                            await this.#ioBrokerDevice.setPower(false);
                        }
                        if (this.#supportedModes.includes(ThermostatMode.Off) && this.#ioBrokerDevice.hasMode()) {
                            await this.#ioBrokerDevice.setMode(ThermostatMode.Off);
                        } else {
                            this.#ioBrokerDevice.adapter.log.info(
                                `${this.uuid}: SystemMode changed to Off, but no mode available to set`,
                            );
                        }
                        break;
                    case MatterThermostat.SystemMode.Heat: {
                        if (this.#ioBrokerDevice.hasPower() && !this.#ioBrokerDevice.getPower()) {
                            await this.#ioBrokerDevice.setPower(true);
                        }
                        if (this.#ioBrokerDevice.hasMode() && this.#validModes.includes(ThermostatMode.Heat)) {
                            await this.#ioBrokerDevice.setMode(ThermostatMode.Heat);
                        }
                        const heatingTemp = this.#matterEndpointThermostat.stateOf(
                            this.#ThermostatServer,
                        ).occupiedHeatingSetpoint;
                        if (heatingTemp !== undefined && this.#ioBrokerDevice.hasSetpoint(SetpointKind.Heating)) {
                            await this.#ioBrokerDevice.setSetpoint(
                                SetpointKind.Heating,
                                MatterConverters.fromMatterHundredths(heatingTemp),
                            );
                        }
                        break;
                    }
                    case MatterThermostat.SystemMode.Cool: {
                        if (this.#ioBrokerDevice.hasPower() && !this.#ioBrokerDevice.getPower()) {
                            await this.#ioBrokerDevice.setPower(true);
                        }
                        if (this.#ioBrokerDevice.hasMode() && this.#validModes.includes(ThermostatMode.Cool)) {
                            await this.#ioBrokerDevice.setMode(ThermostatMode.Cool);
                        }
                        const coolingTemp = this.#matterEndpointThermostat.stateOf(
                            this.#ThermostatServer,
                        ).occupiedCoolingSetpoint;
                        if (typeof coolingTemp === 'number' && this.#ioBrokerDevice.hasSetpoint(SetpointKind.Cooling)) {
                            await this.#ioBrokerDevice.setSetpoint(
                                SetpointKind.Cooling,
                                MatterConverters.fromMatterHundredths(coolingTemp),
                            );
                        }
                        break;
                    }
                    case MatterThermostat.SystemMode.Auto:
                        if (this.#ioBrokerDevice.hasPower() && !this.#ioBrokerDevice.getPower()) {
                            await this.#ioBrokerDevice.setPower(true);
                        }
                        if (this.#ioBrokerDevice.hasMode() && this.#validModes.includes(ThermostatMode.Auto)) {
                            await this.#ioBrokerDevice.setMode(ThermostatMode.Auto);
                        }
                        break;
                    case MatterThermostat.SystemMode.FanOnly:
                        if (this.#ioBrokerDevice.hasPower() && !this.#ioBrokerDevice.getPower()) {
                            await this.#ioBrokerDevice.setPower(true);
                        }
                        if (this.#ioBrokerDevice.hasMode() && this.#validModes.includes(ThermostatMode.FanOnly)) {
                            await this.#ioBrokerDevice.setMode(ThermostatMode.FanOnly);
                        }
                        break;
                    case MatterThermostat.SystemMode.Dry:
                        if (this.#ioBrokerDevice.hasPower() && !this.#ioBrokerDevice.getPower()) {
                            await this.#ioBrokerDevice.setPower(true);
                        }
                        if (this.#ioBrokerDevice.hasMode() && this.#validModes.includes(ThermostatMode.Dry)) {
                            await this.#ioBrokerDevice.setMode(ThermostatMode.Dry);
                        }
                        break;
                }
            });
        }

        if (this.#supportedModes.includes(ThermostatMode.Heat)) {
            if (events?.occupiedHeatingSetpoint$Changed !== undefined) {
                this.matterEvents.on(
                    events?.occupiedHeatingSetpoint$Changed,
                    // @ts-expect-error Workaround a matter.js instancing/typing error
                    (_value: unknown, _oldValue: unknown, context: ActionContext) => {
                        if (hasLocalActor(context)) {
                            return;
                        }

                        this.#setpoints.scheduleSetpointWrite();
                    },
                );
            }
        }

        if (this.#supportedModes.includes(ThermostatMode.Cool)) {
            if (events?.occupiedCoolingSetpoint$Changed !== undefined) {
                this.matterEvents.on(
                    events?.occupiedCoolingSetpoint$Changed,
                    // @ts-expect-error Workaround a matter.js instancing/typing error
                    (_value: unknown, _oldValue: unknown, context: ActionContext) => {
                        if (hasLocalActor(context)) {
                            return;
                        }

                        this.#setpoints.scheduleSetpointWrite();
                    },
                );
            }
        }

        if (this.#matterEndpointBoost) {
            this.matterEvents.on(
                this.#matterEndpointBoost.events.ioBrokerEvents.onOffControlled,
                async on => await this.#ioBrokerDevice.setBoost(on),
            );
        }

        this.#ioBrokerDevice.onChange(async event => {
            switch (event.property) {
                case PropertyType.Temperature:
                    if (typeof event.value === 'number') {
                        await this.#matterEndpointThermostat.setStateOf(this.#ThermostatServer, {
                            externalMeasuredIndoorTemperature: MatterConverters.toMatterHundredths(event.value),
                        });
                    }
                    break;
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
                    let systemMode = event.value ? undefined : MatterThermostat.SystemMode.Off;
                    if (event.value && this.#ioBrokerDevice.hasMode()) {
                        const mode = this.#ioBrokerDevice.getMode();
                        const mappedMode = this.#mapModeToMatter(mode);
                        if (mappedMode == undefined) {
                            return;
                        }
                        systemMode = mappedMode;
                    }
                    if (systemMode !== undefined) {
                        await this.#matterEndpointThermostat.setStateOf(this.#ThermostatServer, {
                            systemMode,
                        });
                    }
                    break;
                }
                case PropertyType.Mode: {
                    if (this.ioBrokerDevice.hasPower() && !this.ioBrokerDevice.getPower()) {
                        // it is turned off, so do not report any mode changes
                        return;
                    }
                    if (!this.#validModes.length) {
                        return;
                    }
                    const systemMode = this.#mapModeToMatter(event.value as ThermostatMode);
                    if (systemMode === undefined) {
                        return;
                    }
                    await this.#matterEndpointThermostat.setStateOf(this.#ThermostatServer, {
                        systemMode,
                    });
                    break;
                }
                case PropertyType.Humidity:
                    if (this.#matterEndpointHumidity?.owner !== undefined) {
                        await this.#matterEndpointHumidity?.set({
                            relativeHumidityMeasurement: {
                                measuredValue: MatterConverters.toMatterHundredths(event.value as number),
                            },
                        });
                    }
                    break;
                case PropertyType.Boost:
                    if (this.#matterEndpointBoost?.owner !== undefined) {
                        await this.#matterEndpointBoost?.set({
                            onOff: {
                                onOff: this.#boostToOnOff(event.value as boolean | number),
                            },
                        });
                    }
                    break;
            }
        });

        if (this.#matterEndpointHumidity && this.#matterEndpointHumidity?.owner !== undefined) {
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
}
