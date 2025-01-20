import { type DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import { GenericDevice, type DetectedDevice, type DeviceOptions, StateAccessType } from './GenericDevice';

export class FloodAlarm extends GenericDevice {
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

    updateValue(value: boolean): Promise<void> {
        if (!this.#getValueState) {
            throw new Error('Value state not found');
        }
        return this.#getValueState.updateValue(value);
    }
}
