import { DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import GenericDevice, { DetectedDevice, DeviceOptions, StateAccessType } from './GenericDevice';

class Motion extends GenericDevice {
    #getValueState?: DeviceStateObject<boolean>;
    #getBrightnessState?: DeviceStateObject<number>;

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
                {
                    name: 'SECOND',
                    valueType: ValueType.NumberPercent,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Brightness,
                    callback: state => (this.#getBrightnessState = state),
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

    getBrightness(): number | undefined {
        if (!this.#getBrightnessState) {
            throw new Error('Brightness state not found');
        }
        return this.#getBrightnessState.value;
    }
}

export default Motion;
