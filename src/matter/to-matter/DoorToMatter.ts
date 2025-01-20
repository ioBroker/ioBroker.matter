import { Endpoint } from '@matter/main';
import { ContactSensorDevice } from '@matter/main/devices';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { Door } from '../../lib/devices/Door';
import { GenericDeviceToMatter, type IdentifyOptions } from './GenericDeviceToMatter';

/** Mapping Logic to map a ioBroker Temperature device to a Matter TemperatureSensorDevice. */
export class DoorToMatter extends GenericDeviceToMatter {
    readonly #ioBrokerDevice: Door;
    readonly #matterEndpoint: Endpoint<ContactSensorDevice>;

    constructor(ioBrokerDevice: Door, name: string, uuid: string) {
        super(name, uuid);
        this.#matterEndpoint = new Endpoint(ContactSensorDevice, {
            id: uuid,
            booleanState: {
                stateValue: false, // Will be corrected in registerHandlersAndInitialize
            },
        });
        this.#ioBrokerDevice = ioBrokerDevice;
    }

    async doIdentify(_identifyOptions: IdentifyOptions): Promise<void> {}
    async resetIdentify(_identifyOptions: IdentifyOptions): Promise<void> {}

    get matterEndpoints(): Endpoint[] {
        return [this.#matterEndpoint];
    }

    get ioBrokerDevice(): Door {
        return this.#ioBrokerDevice;
    }

    convertContactValue(value?: boolean): boolean {
        // True Closed or contact
        // False Open or no contact
        return !value;
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
