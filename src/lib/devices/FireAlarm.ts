import { DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import GenericDevice, { DetectedDevice, DeviceOptions, StateAccessType } from './GenericDevice';

class FireAlarm extends GenericDevice {
    #getValueState?: DeviceStateObject<boolean>;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._construction.push(
            this.addDeviceStates([
                {
                    name: 'ACTUAL',
                    valueType: ValueType.Boolean,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Value,
                    callback: state => (this.#getValueState = state),
                },
            ]),
        );
    }

    getValue(): boolean | undefined {
        if (!this.#getValueState) {
            throw new Error('Value state not found');
        }
        return this.#getValueState.value;
    }
}

export default FireAlarm;
