import { Endpoint } from '@matter/main';
import { HumiditySensorDevice, TemperatureSensorDevice } from '@matter/main/devices';
import { GenericDevice } from '../../lib';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import Temperature from '../../lib/devices/Temperature';
import { IdentifyOptions, MappingGenericDevice } from './MappingGenericDevice';
import { initializeMaintenanceStateHandlers } from './SharedStateHandlers';

/** Mapping Logic to map a ioBroker Temperature device to a Matter TemperatureSensorDevice. */
export class MappingTemperature extends MappingGenericDevice {
    readonly #ioBrokerDevice: Temperature;
    readonly #matterEndpointTemperature: Endpoint<TemperatureSensorDevice>;
    readonly #matterEndpointHumidity?: Endpoint<HumiditySensorDevice>;

    constructor(ioBrokerDevice: GenericDevice, name: string, uuid: string) {
        super(name, uuid);
        this.#matterEndpointTemperature = new Endpoint(TemperatureSensorDevice, {
            id: `${uuid}-Temperature`,
        });
        this.#ioBrokerDevice = ioBrokerDevice as Temperature;
        if (this.#ioBrokerDevice.hasHumidity()) {
            this.#matterEndpointHumidity = new Endpoint(HumiditySensorDevice, { id: `${uuid}-Humidity` });
        }
    }

    async doIdentify(_identifyOptions: IdentifyOptions): Promise<void> {}
    async resetIdentify(_identifyOptions: IdentifyOptions): Promise<void> {}

    getMatterEndpoints(): Endpoint[] {
        const endpoints: Endpoint[] = [this.#matterEndpointTemperature];
        if (this.#matterEndpointHumidity) {
            endpoints.push(this.#matterEndpointHumidity);
        }
        return endpoints;
    }

    getIoBrokerDevice(): GenericDevice {
        return this.#ioBrokerDevice;
    }

    registerMatterHandlers(): void {}

    convertHumidityValue(value: number): number {
        return value * 100;
    }

    convertTemperatureValue(value: number): number {
        return value * 100;
    }

    async registerIoBrokerHandlersAndInitialize(): Promise<void> {
        // install ioBroker listeners
        // here we react on changes from the ioBroker side for onOff and current lamp level
        this.#ioBrokerDevice.onChange(async event => {
            switch (event.property) {
                case PropertyType.Temperature:
                    await this.#matterEndpointTemperature.set({
                        temperatureMeasurement: {
                            measuredValue: this.convertTemperatureValue(event.value as number),
                        },
                    });
                    break;
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

        const value = this.#ioBrokerDevice.getTemperature();
        // init current state from ioBroker side
        await this.#matterEndpointTemperature.set({
            temperatureMeasurement: {
                measuredValue: value === undefined ? null : this.convertTemperatureValue(value),
            },
        });
        await initializeMaintenanceStateHandlers(this.#matterEndpointTemperature, this.#ioBrokerDevice);

        if (this.#matterEndpointHumidity && this.#matterEndpointHumidity?.owner !== undefined) {
            const humidity = this.#ioBrokerDevice.getHumidity();
            await this.#matterEndpointHumidity.set({
                relativeHumidityMeasurement: {
                    measuredValue: humidity === undefined ? null : this.convertHumidityValue(humidity),
                },
            });
            await initializeMaintenanceStateHandlers(this.#matterEndpointHumidity, this.#ioBrokerDevice);
        }
    }
}
