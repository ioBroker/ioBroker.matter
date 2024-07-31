import { DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import GenericDevice, { DetectedDevice, DeviceOptions, StateAccessType } from './GenericDevice';

class ButtonSensor extends GenericDevice {
    #setPressState?: DeviceStateObject<boolean>;
    #setPressLongState?: DeviceStateObject<boolean>;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._construction.push(
            this.addDeviceStates([
                {
                    name: 'PRESS',
                    valueType: ValueType.Button,
                    accessType: StateAccessType.Write,
                    type: PropertyType.Press,
                    callback: state => (this.#setPressState = state),
                },
                {
                    name: 'PRESS_LONG',
                    valueType: ValueType.Button,
                    accessType: StateAccessType.Write,
                    type: PropertyType.PressLong,
                    callback: state => (this.#setPressLongState = state),
                },
            ]),
        );
    }

    async setPress(): Promise<void> {
        if (!this.#setPressState) {
            throw new Error('Press state not found');
        }
        await this.#setPressState.setValue(true);
    }

    async setPressLong(): Promise<void> {
        if (!this.#setPressLongState) {
            throw new Error('PressLong state not found');
        }
        await this.#setPressLongState.setValue(true);
    }
}

export default ButtonSensor;
