import { Endpoint } from '@matter/main';
import { ContactSensorDevice } from '@matter/main/devices';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { Contact } from '../../lib/devices/Contact';
import { GenericDeviceToMatter } from './GenericDeviceToMatter';
import { IoIdentifyServer } from '../behaviors/IdentifyServer';
import { IoBrokerContext } from '../behaviors/IoBrokerContext';

/** Mapping Logic to map a ioBroker Contact device to a Matter ContactSensorDevice. */
export class ContactToMatter extends GenericDeviceToMatter {
    readonly #ioBrokerDevice: Contact;
    readonly #matterEndpoint: Endpoint<ContactSensorDevice>;

    constructor(ioBrokerDevice: Contact, name: string, uuid: string) {
        super(name, uuid);
        this.#matterEndpoint = new Endpoint(ContactSensorDevice.with(IoIdentifyServer, IoBrokerContext), {
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

    get ioBrokerDevice(): Contact {
        return this.#ioBrokerDevice;
    }

    convertContactValue(value?: boolean): boolean {
        // ioBroker sensor.contact: closed = true, open = false.
        // Matter BooleanState for a Contact Sensor: TRUE = closed/contact, FALSE = open/no contact.
        // Same polarity, so no inversion (unlike Window/Door, whose ioBroker roles report open = true).
        return value === true;
    }

    async registerHandlersAndInitialize(): Promise<void> {
        await super.registerHandlersAndInitialize();

        await this.#matterEndpoint.set({
            booleanState: {
                stateValue: this.convertContactValue(this.#ioBrokerDevice.getContact()),
            },
        });

        this.#ioBrokerDevice.onChange(async event => {
            switch (event.property) {
                case PropertyType.Contact:
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
