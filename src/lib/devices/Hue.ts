import { Ct } from './Ct';
import { type DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import { type DetectedDevice, type DeviceOptions, StateAccessType } from './GenericDevice';
import type { CustomStatesRecord } from '../../matter/to-iobroker/custom-states';

export class Hue extends Ct {
    #hueState?: DeviceStateObject<number>;
    #saturationState?: DeviceStateObject<number>; //Makes no sense!

    constructor(
        detectedDevice: DetectedDevice,
        adapter: ioBroker.Adapter,
        options?: DeviceOptions,
        customStateDefinitions?: CustomStatesRecord,
    ) {
        super(detectedDevice, adapter, options, customStateDefinitions);

        this._construction.push(
            this.addDeviceStates([
                {
                    name: 'HUE',
                    valueType: ValueType.Number,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.Hue,
                    callback: state => (this.#hueState = state),
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
        if (!this.#hueState) {
            throw new Error('HUE state not found');
        }
        return this.#hueState.value;
    }

    setHue(value: number): Promise<void> {
        if (!this.#hueState) {
            throw new Error('HUE state not found');
        }
        return this.#hueState.setValue(value);
    }

    updateHue(value: number): Promise<void> {
        if (!this.#hueState) {
            throw new Error('HUE state not found');
        }
        return this.#hueState.updateValue(value);
    }

    getSaturation(): number | undefined {
        if (!this.#saturationState) {
            throw new Error('Saturation state not found');
        }
        return this.#saturationState.value;
    }

    setSaturation(value: number): Promise<void> {
        if (!this.#saturationState) {
            throw new Error('Saturation state not found');
        }
        return this.#saturationState.setValue(value);
    }

    updateSaturation(value: number): Promise<void> {
        if (!this.#saturationState) {
            throw new Error('Saturation state not found');
        }
        return this.#saturationState.updateValue(value);
    }

    hasSaturation(): boolean {
        return !!this.#saturationState;
    }
}
