import { type DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import { GenericDevice, type DetectedDevice, type DeviceOptions, StateAccessType } from './GenericDevice';

export class Contact extends GenericDevice {
    #getContactState?: DeviceStateObject<boolean>;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._construction.push(
            this.addDeviceStates([
                {
                    name: 'ACTUAL',
                    valueType: ValueType.Boolean,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Contact,
                    callback: state => (this.#getContactState = state),
                },
            ]),
        );
    }

    getContact(): boolean | undefined {
        if (!this.#getContactState) {
            throw new Error('Contact state not found');
        }
        return this.#getContactState.value;
    }

    updateContact(value: boolean): Promise<void> {
        if (!this.#getContactState) {
            throw new Error('Contact state not found');
        }
        return this.#getContactState.updateValue(value);
    }
}
