import { DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import GenericDevice, { DetectedDevice, DeviceOptions, StateAccessType } from './GenericDevice';

class Button extends GenericDevice {
    #setPressState?: DeviceStateObject<boolean>;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._construction.push(
            this.addDeviceStates([
                {
                    name: 'SET',
                    valueType: ValueType.Button,
                    accessType: StateAccessType.Write,
                    type: PropertyType.Press,
                    callback: state => (this.#setPressState = state),
                },
            ]),
        );
    }

    async setPress(): Promise<void> {
        if (!this.#setPressState) {
            throw new Error('Press state not found');
        }
        return this.#setPressState.setValue(true);
    }
}

export default Button;
