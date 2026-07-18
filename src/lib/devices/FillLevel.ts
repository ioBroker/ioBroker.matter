import { type DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import { GenericDevice, type DetectedDevice, type DeviceOptions, StateAccessType } from './GenericDevice';

export class FillLevel extends GenericDevice {
    #getFillLevelState?: DeviceStateObject<number>;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._construction.push(
            this.addDeviceStates([
                {
                    name: 'ACTUAL',
                    valueType: ValueType.Number,
                    accessType: StateAccessType.Read,
                    type: PropertyType.FillLevel,
                    callback: state => (this.#getFillLevelState = state),
                },
            ]),
        );
    }

    getFillLevel(): number | undefined {
        if (!this.#getFillLevelState) {
            throw new Error('Value state not found');
        }
        return this.#getFillLevelState.value;
    }

    updateFillLevel(value: number): Promise<void> {
        if (!this.#getFillLevelState) {
            throw new Error('Value state not found');
        }
        return this.#getFillLevelState.updateValue(value);
    }
}
