import { Endpoint } from '@matter/main';
import { WaterLeakDetectorDevice } from '@matter/main/devices';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { FloodAlarm } from '../../lib/devices/FloodAlarm';
import { GenericDeviceToMatter } from './GenericDeviceToMatter';
import { IoIdentifyServer } from '../behaviors/IdentifyServer';
import { IoBrokerContext } from '../behaviors/IoBrokerContext';

/** Mapping Logic to map a ioBroker Temperature device to a Matter TemperatureSensorDevice. */
export class FloodAlarmToMatter extends GenericDeviceToMatter {
    readonly #ioBrokerDevice: FloodAlarm;
    readonly #matterEndpoint: Endpoint<WaterLeakDetectorDevice>;

    constructor(ioBrokerDevice: FloodAlarm, name: string, uuid: string) {
        super(name, uuid);
        this.#matterEndpoint = new Endpoint(WaterLeakDetectorDevice.with(IoIdentifyServer, IoBrokerContext), {
            id: uuid,
            ioBrokerContext: {
                device: ioBrokerDevice,
                adapter: ioBrokerDevice.adapter,
            },
            booleanState: {
                stateValue: false, // Will be corrected in registerHandlersAndInitialize
            },
        });
        this.#ioBrokerDevice = ioBrokerDevice;
    }

    get matterEndpoints(): Endpoint[] {
        return [this.#matterEndpoint];
    }

    get ioBrokerDevice(): FloodAlarm {
        return this.#ioBrokerDevice;
    }

    convertContactValue(value?: boolean): boolean {
        // True Water leak detected
        // False No water leak detected
        return !!value;
    }

    async registerHandlersAndInitialize(): Promise<void> {
        await super.registerHandlersAndInitialize();

        await this.#matterEndpoint.set({
            booleanState: {
                stateValue: this.convertContactValue(this.#ioBrokerDevice.getValue()),
            },
        });

        this.#ioBrokerDevice.onChange(async event => {
            switch (event.property) {
                case PropertyType.Value:
                    await this.#matterEndpoint.set({
                        booleanState: {
                            stateValue: this.convertContactValue(event.value as boolean),
                        },
                    });
                    break;
            }
        });
    }
}
