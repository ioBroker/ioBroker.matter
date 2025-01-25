import { Endpoint } from '@matter/main';
import { HumiditySensorDevice, ThermostatDevice } from '@matter/main/devices';
import { Thermostat as MatterThermostat } from '@matter/main/clusters';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import { ThermostatMode, type Thermostat } from '../../lib/devices/Thermostat';
import { GenericDeviceToMatter } from './GenericDeviceToMatter';
import { IoThermostatServer } from '../behaviors/ThermostatServer';
import { IoBrokerEvents } from '../behaviors/IoBrokerEvents';
import { IoIdentifyServer } from '../behaviors/IdentifyServer';
import { IoBrokerContext } from '../behaviors/IoBrokerContext';

//const HeatingThermostatServer = IoThermostatServer.with(MatterThermostat.Feature.Heating);
//const CoolingThermostatServer = IoThermostatServer.with(MatterThermostat.Feature.Cooling);

/** Mapping Logic to map a ioBroker Temperature device to a Matter TemperatureSensorDevice. */
export class ThermostatToMatter extends GenericDeviceToMatter {
    readonly #ioBrokerDevice: Thermostat;
    readonly #matterEndpointThermostat: Endpoint<ThermostatDevice>;
    readonly #matterEndpointHumidity?: Endpoint<HumiditySensorDevice>;
    #supportedModes = new Array<ThermostatMode>();
    #validModes = new Array<ThermostatMode>();

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
                    // Ignore for now, is handled next with extra check
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

        this.#matterEndpointThermostat = new Endpoint(
            ThermostatDevice.with(
                IoThermostatServer.with(...clusterModes),
                IoBrokerEvents,
                IoIdentifyServer,
                IoBrokerContext,
            ),
            {
                id: `${uuid}-Thermostat`,
                ioBrokerContext: {
                    device: ioBrokerDevice,
                    adapter: ioBrokerDevice.adapter,
                },
                thermostat: {
                    // Values are potentially corrected later again
                    systemMode: hasHeating ? MatterThermostat.SystemMode.Heat : MatterThermostat.SystemMode.Cool,
                    controlSequenceOfOperation:
                        hasHeating && hasCooling
                            ? MatterThermostat.ControlSequenceOfOperation.CoolingAndHeating
                            : hasCooling
                              ? MatterThermostat.ControlSequenceOfOperation.CoolingOnly
                              : MatterThermostat.ControlSequenceOfOperation.HeatingOnly,
                    minSetpointDeadBand: clusterModes.includes(MatterThermostat.Feature.AutoMode) ? 0 : undefined,
                    absMinHeatSetpointLimit: hasHeating ? this.convertTemperatureValue(7) : undefined,
                    absMaxHeatSetpointLimit: hasHeating ? this.convertTemperatureValue(30) : undefined,
                    absMinCoolSetpointLimit: hasCooling ? this.convertTemperatureValue(16) : undefined,
                    absMaxCoolSetpointLimit: hasCooling ? this.convertTemperatureValue(32) : undefined,
                },
            },
        );
        if (this.#ioBrokerDevice.hasHumidity()) {
            this.#matterEndpointHumidity = new Endpoint(HumiditySensorDevice, { id: `${uuid}-Humidity` });
        }
    }

    get matterEndpoints(): Endpoint[] {
        const endpoints: Endpoint[] = [this.#matterEndpointThermostat];
        if (this.#matterEndpointHumidity) {
            endpoints.push(this.#matterEndpointHumidity);
        }
        return endpoints;
    }

    get ioBrokerDevice(): Thermostat {
        return this.#ioBrokerDevice;
    }

    convertHumidityValue(value: number): number {
        return value * 100;
    }

    convertTemperatureValue(value: number): number {
        return value * 100;
    }

    temperatureFromMatter(value: number): number {
        return parseFloat((value / 100).toFixed(2));
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
        await this.#matterEndpointThermostat.setStateOf(IoThermostatServer, {
            localTemperature: typeof temperature === 'number' ? this.convertTemperatureValue(temperature) : null,
            systemMode,
            controlSequenceOfOperation,
        });
        const setpointTemperature = this.#ioBrokerDevice.getLevel();
        if (typeof setpointTemperature === 'number') {
            if (this.#supportedModes.includes(ThermostatMode.Heat)) {
                const minMax = this.#ioBrokerDevice.getSetpointMinMax() ?? { min: 7, max: 30 };
                await this.#matterEndpointThermostat.setStateOf(IoThermostatServer, {
                    // should be HeatingThermostatServer
                    // @ts-expect-error Workaround a .js instancing/typing error
                    occupiedHeatingSetpoint: this.convertTemperatureValue(setpointTemperature),
                    absMinHeatSetpointLimit: this.convertTemperatureValue(minMax.min),
                    absMaxHeatSetpointLimit: this.convertTemperatureValue(minMax.max),
                });
            }
            if (this.#supportedModes.includes(ThermostatMode.Cool)) {
                const minMax = this.#ioBrokerDevice.getSetpointMinMax() ?? { min: 16, max: 32 };
                await this.#matterEndpointThermostat.setStateOf(IoThermostatServer, {
                    // @ts-expect-error Workaround a matter.js instancing/typing error
                    occupiedCoolingSetpoint: this.convertTemperatureValue(setpointTemperature),
                    absMinCoolSetpointLimit: this.convertTemperatureValue(minMax.min),
                    absMaxCoolSetpointLimit: this.convertTemperatureValue(minMax.max),
                });
            }
        }

        this.matterEvents.on(
            this.#matterEndpointThermostat.eventsOf(IoThermostatServer).systemMode$Changed,
            async value => {
                switch (value) {
                    case MatterThermostat.SystemMode.Off:
                        await this.#ioBrokerDevice.setPower(false);
                        break;
                    case MatterThermostat.SystemMode.Heat: {
                        if (this.#ioBrokerDevice.hasMode() && this.#validModes.includes(ThermostatMode.Heat)) {
                            await this.#ioBrokerDevice.setMode(ThermostatMode.Heat);
                        }
                        const heatingTemp =
                            // @ts-expect-error Workaround a matter.js instancing/typing error
                            this.#matterEndpointThermostat.stateOf(IoThermostatServer).occupiedHeatingSetpoint;
                        if (heatingTemp !== undefined) {
                            await this.#ioBrokerDevice.setLevel(this.temperatureFromMatter(heatingTemp));
                        }
                        break;
                    }
                    case MatterThermostat.SystemMode.Cool: {
                        if (this.#ioBrokerDevice.hasMode() && this.#validModes.includes(ThermostatMode.Cool)) {
                            await this.#ioBrokerDevice.setMode(ThermostatMode.Cool);
                        }
                        const coolingTemp =
                            // @ts-expect-error Workaround a matter.js instancing/typing error
                            this.#matterEndpointThermostat.stateOf(IoThermostatServer).occupiedCoolingSetpoint;
                        if (coolingTemp !== undefined) {
                            await this.#ioBrokerDevice.setLevel(this.temperatureFromMatter(coolingTemp));
                        }
                        break;
                    }
                    case MatterThermostat.SystemMode.Auto:
                        if (this.#ioBrokerDevice.hasMode() && this.#validModes.includes(ThermostatMode.Auto)) {
                            await this.#ioBrokerDevice.setMode(ThermostatMode.Auto);
                        }
                        break;
                    case MatterThermostat.SystemMode.FanOnly:
                        if (this.#ioBrokerDevice.hasMode() && this.#validModes.includes(ThermostatMode.FanOnly)) {
                            await this.#ioBrokerDevice.setMode(ThermostatMode.FanOnly);
                        }
                        break;
                    case MatterThermostat.SystemMode.Dry:
                        if (this.#ioBrokerDevice.hasMode() && this.#validModes.includes(ThermostatMode.Dry)) {
                            await this.#ioBrokerDevice.setMode(ThermostatMode.Dry);
                        }
                        break;
                }
            },
        );

        if (this.#supportedModes.includes(ThermostatMode.Heat)) {
            this.matterEvents.on(
                // @ts-expect-error Workaround a matter.js instancing/typing error
                this.#matterEndpointThermostat.eventsOf(IoThermostatServer).occupiedHeatingSetpoint$Changed,
                // @ts-expect-error Workaround a matter.js instancing/typing error
                async value => {
                    if (!this.#ioBrokerDevice.hasMode() || this.#ioBrokerDevice.getMode() === ThermostatMode.Heat) {
                        await this.#ioBrokerDevice.setLevel(value / 100);
                    }
                },
            );
        }

        if (this.#supportedModes.includes(ThermostatMode.Cool)) {
            this.matterEvents.on(
                // @ts-expect-error Workaround a matter.js instancing/typing error
                this.#matterEndpointThermostat.eventsOf(IoThermostatServer).occupiedCoolingSetpoint$Changed,
                // @ts-expect-error Workaround a matter.js instancing/typing error
                async value => {
                    if (this.#ioBrokerDevice.hasMode() && this.#ioBrokerDevice.getMode() === ThermostatMode.Cool) {
                        await this.#ioBrokerDevice.setLevel(value / 100);
                    }
                },
            );
        }

        this.#ioBrokerDevice.onChange(async event => {
            switch (event.property) {
                case PropertyType.Temperature:
                    await this.#matterEndpointThermostat.setStateOf(IoThermostatServer, {
                        localTemperature:
                            typeof event.value === 'number' ? this.convertTemperatureValue(event.value) : null,
                    });
                    break;
                case PropertyType.Level: {
                    const systemMode = this.#matterEndpointThermostat.stateOf(IoThermostatServer).systemMode;
                    const value = this.convertTemperatureValue(event.value as number);
                    if (
                        systemMode === MatterThermostat.SystemMode.Heat ||
                        systemMode === MatterThermostat.SystemMode.Auto
                    ) {
                        await this.#matterEndpointThermostat.setStateOf(IoThermostatServer, {
                            // @ts-expect-error Workaround a matter.js instancing/typing error
                            occupiedHeatingSetpoint: value,
                        });
                    }
                    if (
                        systemMode === MatterThermostat.SystemMode.Cool ||
                        systemMode === MatterThermostat.SystemMode.Auto
                    ) {
                        await this.#matterEndpointThermostat.setStateOf(IoThermostatServer, {
                            // @ts-expect-error Workaround a matter.js instancing/typing error
                            occupiedCoolingSetpoint: value,
                        });
                    }
                    break;
                }
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
                        await this.#matterEndpointThermostat.setStateOf(IoThermostatServer, {
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
                    await this.#matterEndpointThermostat.setStateOf(IoThermostatServer, {
                        systemMode,
                    });
                    break;
                }
                case PropertyType.Humidity:
                    if (this.#matterEndpointHumidity?.owner !== undefined) {
                        await this.#matterEndpointHumidity?.set({
                            relativeHumidityMeasurement: {
                                measuredValue: this.convertHumidityValue(event.value as number),
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
                    measuredValue: typeof humidity === 'number' ? this.convertHumidityValue(humidity) : null,
                },
            });
        }
    }
}
