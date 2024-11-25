import { Endpoint } from '@matter/main';
import { HumiditySensorDevice } from '@matter/main/devices';
import type { GenericDevice, Humidity } from '../../lib';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import { GenericDeviceToMatter, type IdentifyOptions } from './GenericDeviceToMatter';
import { initializeMaintenanceStateHandlers } from './SharedStateHandlers';

/** Mapping Logic to map a ioBroker Humidity device to a Matter HumiditySensorDevice. */
export class HumidityToMatter extends GenericDeviceToMatter {
    readonly #ioBrokerDevice: Humidity;
    readonly #matterEndpoint: Endpoint<HumiditySensorDevice>;

    constructor(ioBrokerDevice: GenericDevice, name: string, uuid: string) {
        super(name, uuid);
        this.#matterEndpoint = new Endpoint(HumiditySensorDevice, { id: uuid });
        this.#ioBrokerDevice = ioBrokerDevice as Humidity;
    }

    async doIdentify(_identifyOptions: IdentifyOptions): Promise<void> {}
    async resetIdentify(_identifyOptions: IdentifyOptions): Promise<void> {}

    getMatterEndpoints(): Endpoint[] {
        return [this.#matterEndpoint];
    }

    get ioBrokerDevice(): GenericDevice {
        return this.#ioBrokerDevice;
    }

    registerMatterHandlers(): void {}

    convertHumidityValue(value: number): number {
        return value * 100;
    }

    async registerIoBrokerHandlersAndInitialize(): Promise<void> {
        // install ioBroker listeners
        // here we react on changes from the ioBroker side for onOff and current lamp level
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

        const value = this.#ioBrokerDevice.getHumidity();
        // init current state from ioBroker side
        await this.#matterEndpoint.set({
            relativeHumidityMeasurement: {
                measuredValue: typeof value === 'number' ? this.convertHumidityValue(value) : null,
            },
        });

        await initializeMaintenanceStateHandlers(this.#matterEndpoint, this.#ioBrokerDevice);
    }
}
