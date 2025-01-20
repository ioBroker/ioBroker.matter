import { type DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import { GenericDevice, type DetectedDevice, type DeviceOptions, StateAccessType } from './GenericDevice';

export class Illuminance extends GenericDevice {
    #getBrightnessState?: DeviceStateObject<number>;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._construction.push(
            this.addDeviceStates([
                {
                    name: 'ACTUAL',
                    valueType: ValueType.NumberPercent,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Brightness,
                    callback: state => (this.#getBrightnessState = state),
                },
            ]),
        );
    }

    getBrightness(): number | undefined {
        if (!this.#getBrightnessState) {
            throw new Error('Brightness state not found');
        }
        return this.#getBrightnessState.value;
    }

    updateBrightness(value: number): Promise<void> {
        if (!this.#getBrightnessState) {
            throw new Error('Brightness state not found');
        }
        return this.#getBrightnessState.updateValue(value);
    }
}
