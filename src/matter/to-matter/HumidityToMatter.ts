import { Endpoint } from '@matter/main';
import { HumiditySensorDevice } from '@matter/main/devices';
import type { Humidity } from '../../lib/devices/Humidity';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import { GenericDeviceToMatter } from './GenericDeviceToMatter';
import { IoIdentifyServer } from '../behaviors/IdentifyServer';
import { IoBrokerContext } from '../behaviors/IoBrokerContext';

/** Mapping Logic to map a ioBroker Humidity device to a Matter HumiditySensorDevice. */
export class HumidityToMatter extends GenericDeviceToMatter {
    readonly #ioBrokerDevice: Humidity;
    readonly #matterEndpoint: Endpoint<HumiditySensorDevice>;

    constructor(ioBrokerDevice: Humidity, name: string, uuid: string) {
        super(name, uuid);
        this.#matterEndpoint = new Endpoint(HumiditySensorDevice.with(IoIdentifyServer, IoBrokerContext), {
            id: uuid,
            ioBrokerContext: {
                device: ioBrokerDevice,
                adapter: ioBrokerDevice.adapter,
            },
        });
        this.#ioBrokerDevice = ioBrokerDevice;
    }

    get matterEndpoints(): Endpoint[] {
        return [this.#matterEndpoint];
    }

    get ioBrokerDevice(): Humidity {
        return this.#ioBrokerDevice;
    }

    convertHumidityValue(value: number): number {
        return value * 100;
    }

    async registerHandlersAndInitialize(): Promise<void> {
        await super.registerHandlersAndInitialize();

        const value = this.#ioBrokerDevice.getHumidity();
        // init current state from ioBroker side
        await this.#matterEndpoint.set({
            relativeHumidityMeasurement: {
                measuredValue: typeof value === 'number' ? this.convertHumidityValue(value) : null,
            },
        });

        this.#ioBrokerDevice.onChange(async event => {
            switch (event.property) {
                case PropertyType.Humidity:
                    await this.#matterEndpoint.set({
                        relativeHumidityMeasurement: {
                            measuredValue:
                                typeof event.value === 'number' ? this.convertHumidityValue(event.value) : null,
                        },
                    });
                    break;
            }
        });
    }
}
