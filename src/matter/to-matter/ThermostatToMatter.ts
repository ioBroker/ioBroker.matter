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
    #supportedModes = new Array<ThermostatMode>();
    #validModes = new Array<ThermostatMode>();
    #temperatureDebounceTimeout?: ioBroker.Timeout;
    readonly #ThermostatServer;

    constructor(ioBrokerDevice: Thermostat, name: string, uuid: string) {
        super(name, uuid);

        this.#ioBrokerDevice = ioBrokerDevice;

        const clusterModes = new Array<MatterThermostat.Feature>();
        const ignoredModes = new Array<ThermostatMode>();
        const modes = this.#ioBrokerDevice.hasMode() ? this.#ioBrokerDevice.getModes() : [];
        for (const mode of modes) {
            switch (mode) {
                case ThermostatMode.Heat:
                    this.#supportedModes.push(ThermostatMode.Heat);
                    this.#validModes.push(ThermostatMode.Heat);
                    clusterModes.push(MatterThermostat.Feature.Heating);
                    break;
                case ThermostatMode.Cool:
                    this.#supportedModes.push(ThermostatMode.Cool);
                    this.#validModes.push(ThermostatMode.Cool);
                    clusterModes.push(MatterThermostat.Feature.Cooling);
                    break;
                case ThermostatMode.Auto:
                    // Ignore for now, is handled next with an extra check
                    break;
                case ThermostatMode.Off:
                    this.#supportedModes.push(ThermostatMode.Off);
                    this.#validModes.push(ThermostatMode.Off);
                    break;
                case ThermostatMode.FanOnly:
                    this.#supportedModes.push(ThermostatMode.FanOnly);
                    this.#validModes.push(ThermostatMode.FanOnly);
                    break;
                case ThermostatMode.Dry:
                    this.#supportedModes.push(ThermostatMode.Dry);
                    this.#validModes.push(ThermostatMode.Dry);
                    break;
                default:
                    ignoredModes.push(mode);
            }
        }
        if (
            modes.includes(ThermostatMode.Auto) &&
            clusterModes.includes(MatterThermostat.Feature.Heating) &&
            clusterModes.includes(MatterThermostat.Feature.Cooling)
        ) {
            clusterModes.push(MatterThermostat.Feature.AutoMode);
            this.#supportedModes.push(ThermostatMode.Auto);
            this.#validModes.push(ThermostatMode.Auto);
        } else {
            // Auto mode requires Heating and cooling to be supported too
            this.#ioBrokerDevice.adapter.log.info(
                `${uuid}: AutoMode is supported, but no Heating or Cooling, ignoring AutoMode`,
            );
        }

        if (
            !clusterModes.includes(MatterThermostat.Feature.Heating) &&
            !clusterModes.includes(MatterThermostat.Feature.Cooling)
        ) {
            // When no mode is there tell that it is a Heating thermostat
            this.#ioBrokerDevice.adapter.log.info(
                `${uuid}: Matter Thermostats need to either support heating or cooling. Defaulting to Heating`,
            );
            clusterModes.push(MatterThermostat.Feature.Heating);
            this.#supportedModes.push(ThermostatMode.Heat);
        }
        if (ignoredModes.length > 0) {
            this.#ioBrokerDevice.adapter.log.info(
                `${uuid}: Ignoring unsupported modes for Thermostat: ${ignoredModes.join(', ')}`,
            );
        }
        this.#ioBrokerDevice.adapter.log.info(
            `Mapped Thermostat Modes "${this.#supportedModes.join('","')}" to Matter Features "${clusterModes.map(feature => MatterThermostat.Feature[feature]).join('","')}"`,
        );
        this.#ioBrokerDevice.adapter.log.info(
            `Valid Modes the adapter will react on from ioBroker Device: ${this.#validModes.length ? `"${this.#validModes.join('","')}"` : 'None, Mode state is ignored'}`,
        );

        const hasHeating = clusterModes.includes(MatterThermostat.Feature.Heating);
        const hasCooling = clusterModes.includes(MatterThermostat.Feature.Cooling);

        this.#ThermostatServer = ThermostatServer.with(...clusterModes);
        this.#matterEndpointThermostat = new Endpoint(IoThermostatDevice.with(this.#ThermostatServer), {
            id: `${uuid}-Thermostat`,
            ioBrokerContext: {
                device: ioBrokerDevice,
                adapter: ioBrokerDevice.adapter,
            },
            thermostat: {
                // Values are corrected later again with real values
                systemMode: hasHeating ? MatterThermostat.SystemMode.Heat : MatterThermostat.SystemMode.Cool,
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
            },
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

    /**
     * Both kinds resolve to the same ioBroker state when the device exposes neither dedicated setpoint, so in
     * Auto only one of them may be written — the second write would just overwrite the first.
     */
    get #setpointStateIsShared(): boolean {
        return !this.#ioBrokerDevice.hasLevelHeating() && !this.#ioBrokerDevice.hasLevelCooling();
    }

    #writeSetpoint(kind: SetpointKind, matterValue: number): void {
        if (!this.#ioBrokerDevice.hasSetpoint(kind)) {
            return;
        }
        const value = MatterConverters.fromMatterHundredths(matterValue);
        this.#ioBrokerDevice.adapter.log.debug(`Setting ${kind} setpoint to ${value} after debounce`);
        this.#ioBrokerDevice
            .setSetpoint(kind, value)
            .catch(error => this.#ioBrokerDevice.adapter.log.warn(`Error setting ${kind} setpoint: ${error.message}`));
    }

    #setpointValue(kind: SetpointKind): number | undefined {
        if (!this.#ioBrokerDevice.hasSetpoint(kind)) {
            return undefined;
        }
        const value = this.#ioBrokerDevice.getSetpoint(kind);
        return typeof value === 'number' ? value : undefined;
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
            const state = this.#matterEndpointThermostat.stateOf(this.#ThermostatServer);
            const systemMode = state.systemMode;
            if (systemMode === MatterThermostat.SystemMode.Heat || systemMode === MatterThermostat.SystemMode.Auto) {
                this.#writeSetpoint(SetpointKind.Heating, state.occupiedHeatingSetpoint);
            }
            if (
                (systemMode === MatterThermostat.SystemMode.Cool ||
                    (systemMode === MatterThermostat.SystemMode.Auto && !this.#setpointStateIsShared)) &&
                typeof state.occupiedCoolingSetpoint === 'number'
            ) {
                this.#writeSetpoint(SetpointKind.Cooling, state.occupiedCoolingSetpoint);
            }
        }, delay);
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
        const data: Record<string, number> = {};
        if (this.#supportedModes.includes(ThermostatMode.Heat)) {
            const setpoint = this.#setpointValue(SetpointKind.Heating);
            if (setpoint !== undefined) {
                const minMax = this.#ioBrokerDevice.getSetpointMinMax(SetpointKind.Heating) ?? { min: 7, max: 30 };
                data.occupiedHeatingSetpoint = MatterConverters.toMatterHundredths(
                    this.#ioBrokerDevice.cropValue(setpoint, minMax.min, minMax.max, true),
                );
                data.minHeatSetpointLimit = MatterConverters.toMatterHundredths(Math.max(minMax.min, 0));
                data.maxHeatSetpointLimit = MatterConverters.toMatterHundredths(Math.min(minMax.max, 50));
            }
        }
        if (this.#supportedModes.includes(ThermostatMode.Cool)) {
            const setpoint = this.#setpointValue(SetpointKind.Cooling);
            if (setpoint !== undefined) {
                const minMax = this.#ioBrokerDevice.getSetpointMinMax(SetpointKind.Cooling) ?? { min: 16, max: 32 };
                data.occupiedCoolingSetpoint = MatterConverters.toMatterHundredths(
                    this.#ioBrokerDevice.cropValue(setpoint, minMax.min, minMax.max, true),
                );
                data.minCoolSetpointLimit = MatterConverters.toMatterHundredths(Math.max(minMax.min, 0));
                data.maxCoolSetpointLimit = MatterConverters.toMatterHundredths(Math.min(minMax.max, 50));
            }
        }
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

                        this.#updateSetPointTemperature();
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

                        this.#updateSetPointTemperature();
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
                case PropertyType.Level: {
                    // The plain setpoint only stands for a kind that has no dedicated state of its own
                    const systemMode = this.#matterEndpointThermostat.stateOf(this.#ThermostatServer).systemMode;
                    const value = MatterConverters.toMatterHundredths(event.value as number);
                    if (
                        !this.#ioBrokerDevice.hasLevelHeating() &&
                        (systemMode === MatterThermostat.SystemMode.Heat ||
                            systemMode === MatterThermostat.SystemMode.Auto)
                    ) {
                        await this.#matterEndpointThermostat.setStateOf(this.#ThermostatServer, {
                            occupiedHeatingSetpoint: value,
                        });
                    }
                    if (
                        !this.#ioBrokerDevice.hasLevelCooling() &&
                        (systemMode === MatterThermostat.SystemMode.Cool ||
                            systemMode === MatterThermostat.SystemMode.Auto)
                    ) {
                        await this.#matterEndpointThermostat.setStateOf(this.#ThermostatServer, {
                            occupiedCoolingSetpoint: value,
                        });
                    }
                    break;
                }
                case PropertyType.LevelHeating:
                    await this.#matterEndpointThermostat.setStateOf(this.#ThermostatServer, {
                        occupiedHeatingSetpoint: MatterConverters.toMatterHundredths(event.value as number),
                    });
                    break;
                case PropertyType.LevelCooling:
                    await this.#matterEndpointThermostat.setStateOf(this.#ThermostatServer, {
                        occupiedCoolingSetpoint: MatterConverters.toMatterHundredths(event.value as number),
                    });
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
