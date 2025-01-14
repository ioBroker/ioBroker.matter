import { Endpoint } from '@matter/main';
import { ContactSensorDevice } from '@matter/main/devices';
import type { GenericDevice } from '../../lib';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type Window from '../../lib/devices/Window';
import { GenericDeviceToMatter, type IdentifyOptions } from './GenericDeviceToMatter';

/** Mapping Logic to map a ioBroker Temperature device to a Matter TemperatureSensorDevice. */
export class WindowToMatter extends GenericDeviceToMatter {
    readonly #ioBrokerDevice: Window;
    readonly #matterEndpoint: Endpoint<ContactSensorDevice>;

    constructor(ioBrokerDevice: GenericDevice, name: string, uuid: string) {
        super(name, uuid);
        this.#matterEndpoint = new Endpoint(ContactSensorDevice, {
            id: uuid,
            booleanState: {
                stateValue: false, // Will be corrected in registerIoBrokerHandlersAndInitialize
            },
        });
        this.#ioBrokerDevice = ioBrokerDevice as Window;
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
        // True Closed or contact
        // False Open or no contact
        return !value;
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
