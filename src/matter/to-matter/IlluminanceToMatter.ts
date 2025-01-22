import { Endpoint } from '@matter/main';
import { LightSensorDevice } from '@matter/main/devices';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { Illuminance } from '../../lib/devices/Illuminance';
import { GenericDeviceToMatter } from './GenericDeviceToMatter';
import { IoIdentifyServer } from '../behaviors/IdentifyServer';
import { IoBrokerContext } from '../behaviors/IoBrokerContext';

/** Mapping Logic to map a ioBroker Temperature device to a Matter TemperatureSensorDevice. */
export class IlluminanceToMatter extends GenericDeviceToMatter {
    readonly #ioBrokerDevice: Illuminance;
    readonly #matterEndpoint: Endpoint<LightSensorDevice>;

    constructor(ioBrokerDevice: Illuminance, name: string, uuid: string) {
        super(name, uuid);
        this.#ioBrokerDevice = ioBrokerDevice;
        this.#matterEndpoint = new Endpoint(LightSensorDevice.with(IoIdentifyServer, IoBrokerContext), {
            id: uuid,
            ioBrokerContext: {
                device: ioBrokerDevice,
                adapter: ioBrokerDevice.adapter,
            },
        });
    }

    get matterEndpoints(): Endpoint[] {
        return [this.#matterEndpoint];
    }

    get ioBrokerDevice(): Illuminance {
        return this.#ioBrokerDevice;
    }

    convertBrightnessValue(value: number): number {
        return Math.round(10_000 * Math.log10(value) + 1);
    }

    async registerHandlersAndInitialize(): Promise<void> {
        await super.registerHandlersAndInitialize();

        const humidity = this.#ioBrokerDevice.getBrightness();
        await this.#matterEndpoint.set({
            illuminanceMeasurement: {
                measuredValue: typeof humidity === 'number' ? this.convertBrightnessValue(humidity) : null,
            },
        });

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
    }
}
