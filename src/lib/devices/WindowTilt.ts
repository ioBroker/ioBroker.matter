import { DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import GenericDevice, { DetectedDevice, DeviceOptions, StateAccessType } from './GenericDevice';

class WindowTilt extends GenericDevice {
    #getValueState?: DeviceStateObject<number>;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._construction.push(
            this.addDeviceStates([
                {
                    name: 'ACTUAL',
                    valueType: ValueType.Enum,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Value,
                    callback: state => (this.#getValueState = state),
                },
            ]),
        );
    }

    getValue(): number | undefined {
        if (!this.#getValueState) {
            throw new Error('Value state not found');
        }
        return this.#getValueState.value;
    }
}

export default WindowTilt;
