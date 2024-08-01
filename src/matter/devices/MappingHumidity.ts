import { HumiditySensorDevice } from '@project-chip/matter.js/devices/HumiditySensorDevice';
import { Endpoint } from '@project-chip/matter.js/endpoint';
import { GenericDevice, Humidity } from '../../lib';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import { IdentifyOptions, MappingGenericDevice } from './MappingGenericDevice';
import { initializeMaintenanceStateHandlers } from './SharedStateHandlers';

/** Mapping Logic to map a ioBroker Humidity device to a Matter HumiditySensorDevice. */
export class MappingHumidity extends MappingGenericDevice {
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

    getIoBrokerDevice(): GenericDevice {
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
                            measuredValue: this.convertHumidityValue(event.value as number),
                        },
                    });
                    break;
            }
        });

        const value = this.#ioBrokerDevice.getValue();
        // init current state from ioBroker side
        await this.#matterEndpoint.set({
            relativeHumidityMeasurement: {
                measuredValue: value === undefined ? null : this.convertHumidityValue(value),
            },
        });

        await initializeMaintenanceStateHandlers(this.#matterEndpoint, this.#ioBrokerDevice);
    }
}
