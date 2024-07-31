import Ct from './Ct';
import { DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import { DetectedDevice, DeviceOptions, StateAccessType } from './GenericDevice';

class Cie extends Ct {
    #hue?: DeviceStateObject<number>;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._construction.push(
            this.addDeviceStates([
                {
                    name: 'HUE',
                    valueType: ValueType.String,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.Hue,
                    callback: state => (this.#hue = state),
                },
            ]),
        );
    }

    getHue(): number | undefined {
        if (!this.#hue) {
            throw new Error('HUE state not found');
        }
        return this.#hue.value;
    }

    async setHue(value: number): Promise<void> {
        if (!this.#hue) {
            throw new Error('HUE state not found');
        }
        return this.#hue.setValue(value);
    }
}

export default Cie;
