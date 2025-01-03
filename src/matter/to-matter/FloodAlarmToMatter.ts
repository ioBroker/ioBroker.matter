import { Endpoint } from '@matter/main';
import { WaterLeakDetectorDevice } from '@matter/main/devices';
import type { GenericDevice } from '../../lib';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type FloodAlarm from '../../lib/devices/FloodAlarm';
import { GenericDeviceToMatter, type IdentifyOptions } from './GenericDeviceToMatter';

/** Mapping Logic to map a ioBroker Temperature device to a Matter TemperatureSensorDevice. */
export class FloodAlarmToMatter extends GenericDeviceToMatter {
    readonly #ioBrokerDevice: FloodAlarm;
    readonly #matterEndpoint: Endpoint<WaterLeakDetectorDevice>;

    constructor(ioBrokerDevice: GenericDevice, name: string, uuid: string) {
        super(name, uuid);
        this.#matterEndpoint = new Endpoint(WaterLeakDetectorDevice, {
            id: uuid,
            booleanState: {
                stateValue: false, // Will be corrected in registerIoBrokerHandlersAndInitialize
            },
        });
        this.#ioBrokerDevice = ioBrokerDevice as FloodAlarm;
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

    convertContactValue(value?: boolean): boolean {
        // True Water leak detected
        // False No water leak detected
        return !!value;
    }

    async registerIoBrokerHandlersAndInitialize(): Promise<void> {
        // install ioBroker listeners
        // here we react on changes from the ioBroker side for onOff and current lamp level
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

        const value = this.#ioBrokerDevice.getValue();
        // init current state from ioBroker side
        await this.#matterEndpoint.set({
            booleanState: {
                stateValue: this.convertContactValue(value),
            },
        });
    }
}
