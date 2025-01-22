import { Endpoint } from '@matter/main';
import { HumiditySensorDevice, TemperatureSensorDevice } from '@matter/main/devices';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { Temperature } from '../../lib/devices/Temperature';
import { GenericDeviceToMatter } from './GenericDeviceToMatter';
import { IoIdentifyServer } from '../behaviors/IdentifyServer';
import { IoBrokerContext } from '../behaviors/IoBrokerContext';

/** Mapping Logic to map a ioBroker Temperature device to a Matter TemperatureSensorDevice. */
export class TemperatureToMatter extends GenericDeviceToMatter {
    readonly #ioBrokerDevice: Temperature;
    readonly #matterEndpointTemperature: Endpoint<TemperatureSensorDevice>;
    readonly #matterEndpointHumidity?: Endpoint<HumiditySensorDevice>;

    constructor(ioBrokerDevice: Temperature, name: string, uuid: string) {
        super(name, uuid);
        this.#matterEndpointTemperature = new Endpoint(
            TemperatureSensorDevice.with(IoIdentifyServer, IoBrokerContext),
            {
                id: `${uuid}-Temperature`,
                ioBrokerContext: {
                    device: ioBrokerDevice,
                    adapter: ioBrokerDevice.adapter,
                },
            },
        );
        this.#ioBrokerDevice = ioBrokerDevice;
        if (this.#ioBrokerDevice.hasHumidity()) {
            this.#matterEndpointHumidity = new Endpoint(HumiditySensorDevice, { id: `${uuid}-Humidity` });
        }
    }

    get matterEndpoints(): Endpoint[] {
        const endpoints: Endpoint[] = [this.#matterEndpointTemperature];
        if (this.#matterEndpointHumidity) {
            endpoints.push(this.#matterEndpointHumidity);
        }
        return endpoints;
    }

    get ioBrokerDevice(): Temperature {
        return this.#ioBrokerDevice;
    }

    convertHumidityValue(value: number): number {
        return value * 100;
    }

    convertTemperatureValue(value: number): number {
        return value * 100;
    }

    async registerHandlersAndInitialize(): Promise<void> {
        await super.registerHandlersAndInitialize();
        const value = this.#ioBrokerDevice.getTemperature();
        // init current state from ioBroker side
        await this.#matterEndpointTemperature.set({
            temperatureMeasurement: {
                measuredValue: typeof value === 'number' ? this.convertTemperatureValue(value) : null,
            },
        });

        if (this.#matterEndpointHumidity && this.#matterEndpointHumidity?.owner !== undefined) {
            const humidity = this.#ioBrokerDevice.getHumidity();
            await this.#matterEndpointHumidity.set({
                relativeHumidityMeasurement: {
                    measuredValue: typeof humidity === 'number' ? this.convertHumidityValue(humidity) : null,
                },
            });
        }

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
    }
}
