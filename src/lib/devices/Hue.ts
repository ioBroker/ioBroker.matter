import Ct from './Ct';
import { type DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import { type DetectedDevice, type DeviceOptions, StateAccessType } from './GenericDevice';

class Hue extends Ct {
    #hue?: DeviceStateObject<number>;
    #saturationState?: DeviceStateObject<number>; //Makes no sense!

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
                {
                    name: 'SATURATION',
                    valueType: ValueType.NumberPercent,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.Saturation,
                    callback: state => (this.#saturationState = state),
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

    async updateHue(value: number): Promise<void> {
        if (!this.#hue) {
            throw new Error('HUE state not found');
        }
        return this.#hue.updateValue(value);
    }

    getSaturation(): number | undefined {
        if (!this.#saturationState) {
            throw new Error('Saturation state not found');
        }
        return this.#saturationState.value;
    }

    async setSaturation(value: number): Promise<void> {
        if (!this.#saturationState) {
            throw new Error('Saturation state not found');
        }
        return this.#saturationState.setValue(value);
    }

    async updateSaturation(value: number): Promise<void> {
        if (!this.#saturationState) {
            throw new Error('Saturation state not found');
        }
        return this.#saturationState.updateValue(value);
    }
}

export default Hue;
