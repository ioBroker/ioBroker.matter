import { type DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import { GenericDevice, type DetectedDevice, type DeviceOptions, StateAccessType } from './GenericDevice';
import { PRESSURE_CONVERSION_MAP, PRESSURE_UNIT } from './unitConversions';

export class Pressure extends GenericDevice {
    #getPressureState?: DeviceStateObject<number>;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._construction.push(
            this.addDeviceStates([
                {
                    name: 'PRESSURE',
                    valueType: ValueType.Number,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Pressure,
                    unit: PRESSURE_UNIT,
                    unitConversionMap: PRESSURE_CONVERSION_MAP,
                    callback: state => (this.#getPressureState = state),
                },
            ]),
        );
    }

    getPressure(): number | undefined {
        if (!this.#getPressureState) {
            throw new Error('Pressure state not found');
        }
        return this.#getPressureState.value;
    }

    updatePressure(value: number): Promise<void> {
        if (!this.#getPressureState) {
            throw new Error('Pressure state not found');
        }
        return this.#getPressureState.updateValue(value);
    }
}
