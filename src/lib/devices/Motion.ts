import { DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import GenericDevice, { DetectedDevice, DeviceOptions, StateAccessType } from './GenericDevice';

class Motion extends GenericDevice {
    #getMotionState?: DeviceStateObject<boolean>;
    #getBrightnessState?: DeviceStateObject<number>;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._construction.push(
            this.addDeviceStates([
                {
                    name: 'ACTUAL',
                    valueType: ValueType.Boolean,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Motion,
                    callback: state => (this.#getMotionState = state),
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

    getMotion(): boolean | undefined {
        if (!this.#getMotionState) {
            throw new Error('Value state not found');
        }
        return this.#getMotionState.value;
    }

    hasBrightness(): boolean {
        return this.propertyNames.includes(PropertyType.Brightness);
    }

    getBrightness(): number | undefined {
        if (!this.#getBrightnessState) {
            throw new Error('Brightness state not found');
        }
        return this.#getBrightnessState.value;
    }
}

export default Motion;
