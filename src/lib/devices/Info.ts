import { DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import GenericDevice, { DetectedDevice, DeviceOptions, StateAccessType } from './GenericDevice';

class Info extends GenericDevice {
    #getValueState?: DeviceStateObject<string>;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._construction.push(
            this.addDeviceStates([
                {
                    name: 'ACTUAL',
                    valueType: ValueType.String,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Value,
                    callback: state => (this.#getValueState = state),
                },
            ]),
        );
    }

    getValue(): string | undefined {
        if (!this.#getValueState) {
            throw new Error('Level state not found');
        }
        if (this.#getValueState.value === undefined || this.#getValueState.value === null) {
            return '';
        }
        return this.#getValueState.value.toString();
    }
}

export default Info;
