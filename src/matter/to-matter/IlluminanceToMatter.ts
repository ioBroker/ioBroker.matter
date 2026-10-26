import { Endpoint } from '@matter/main';
import { LightSensorDevice } from '@matter/main/devices';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { Illuminance } from '../../lib/devices/Illuminance';
import { GenericDeviceToMatter, luxToMatterMeasuredValue } from './GenericDeviceToMatter';
import { IoIdentifyServer } from '../behaviors/IdentifyServer';
import { IoBrokerContext } from '../behaviors/IoBrokerContext';
import { MatterConverters } from '../ConversionUtils';

/** Mapping Logic to map a ioBroker Illuminance device to a Matter LightSensorDevice. */
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

    async registerHandlersAndInitialize(): Promise<void> {
        await super.registerHandlersAndInitialize();

        const brightness = this.#ioBrokerDevice.getBrightness();
        await this.#matterEndpoint.set({
            illuminanceMeasurement: {
                measuredValue: MatterConverters.toMatterMeasurement(brightness, lux =>
                    luxToMatterMeasuredValue(this.#ioBrokerDevice, lux),
                ),
            },
        });

        this.#ioBrokerDevice.onChange(async event => {
            switch (event.property) {
                case PropertyType.Brightness:
                    if (this.#matterEndpoint?.owner !== undefined) {
                        await this.#matterEndpoint?.set({
                            illuminanceMeasurement: {
                                measuredValue: MatterConverters.toMatterMeasurement(event.value, lux =>
                                    luxToMatterMeasuredValue(this.#ioBrokerDevice, lux),
                                ),
                            },
                        });
                    }
                    break;
            }
        });
    }
}
