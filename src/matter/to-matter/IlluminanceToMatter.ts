import { Endpoint } from '@matter/main';
import { LightSensorDevice } from '@matter/main/devices';
import type { GenericDevice } from '../../lib';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type Illuminance from '../../lib/devices/Illuminance';
import { GenericDeviceToMatter, type IdentifyOptions } from './GenericDeviceToMatter';

/** Mapping Logic to map a ioBroker Temperature device to a Matter TemperatureSensorDevice. */
export class IlluminanceToMatter extends GenericDeviceToMatter {
    readonly #ioBrokerDevice: Illuminance;
    readonly #matterEndpoint: Endpoint<LightSensorDevice>;

    constructor(ioBrokerDevice: GenericDevice, name: string, uuid: string) {
        super(name, uuid);
        this.#ioBrokerDevice = ioBrokerDevice as Illuminance;
        this.#matterEndpoint = new Endpoint(LightSensorDevice, { id: uuid });
    }

    async doIdentify(_identifyOptions: IdentifyOptions): Promise<void> {}
    async resetIdentify(_identifyOptions: IdentifyOptions): Promise<void> {}

    get matterEndpoints(): Endpoint[] {
        return [this.#matterEndpoint];
    }

    get ioBrokerDevice(): GenericDevice {
        return this.#ioBrokerDevice;
    }

    registerMatterHandlers(): void {}

    convertBrightnessValue(value: number): number {
        return Math.round(10_000 * Math.log10(value) + 1);
    }

    async registerIoBrokerHandlersAndInitialize(): Promise<void> {
        // install ioBroker listeners
        // here we react on changes from the ioBroker side for onOff and current lamp level
        this.#ioBrokerDevice.onChange(async event => {
            switch (event.property) {
                case PropertyType.Brightness:
                    if (this.#matterEndpoint?.owner !== undefined) {
                        await this.#matterEndpoint?.set({
                            illuminanceMeasurement: {
                                measuredValue: this.convertBrightnessValue(event.value as number),
                            },
                        });
                    }
                    break;
            }
        });

        const humidity = this.#ioBrokerDevice.getBrightness();
        await this.#matterEndpoint.set({
            illuminanceMeasurement: {
                measuredValue: humidity === undefined ? null : this.convertBrightnessValue(humidity),
            },
        });
    }
}
