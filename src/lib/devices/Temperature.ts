import { DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import GenericDevice, { DetectedDevice, DeviceOptions, StateAccessType } from './GenericDevice';

class Temperature extends GenericDevice {
    #getTemperatureState?: DeviceStateObject<number>;
    #getHumidityState?: DeviceStateObject<number>;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._construction.push(
            this.addDeviceStates([
                {
                    name: 'ACTUAL',
                    valueType: ValueType.Number,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Temperature,
                    callback: state => (this.#getTemperatureState = state),
                },
                {
                    name: 'SECOND',
                    valueType: ValueType.NumberPercent,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Humidity,
                    callback: state => (this.#getHumidityState = state),
                },
            ]),
        );
    }

    hasHumidity(): boolean {
        return this.getPropertyNames().includes(PropertyType.Humidity);
    }

    getTemperature(): number | undefined {
        if (!this.#getTemperatureState) {
            throw new Error('Value state not found');
        }
        return this.#getTemperatureState.value;
    }

    getHumidity(): number | undefined {
        if (!this.#getHumidityState) {
            throw new Error('Humidity state not found');
        }
        return this.#getHumidityState.value;
    }
}

export default Temperature;
