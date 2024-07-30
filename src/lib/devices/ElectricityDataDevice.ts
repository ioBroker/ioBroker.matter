import { DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import GenericDevice, { DetectedDevice, DeviceOptions, StateAccessType } from './GenericDevice';

class ElectricityDataDevice extends GenericDevice {
    #getElectricPowerState?: DeviceStateObject<number>;
    #getCurrentState?: DeviceStateObject<number>;
    #getVoltageState?: DeviceStateObject<number>;
    #getConsumptionState?: DeviceStateObject<number>;
    #getFrequencyState?: DeviceStateObject<number>;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._construction.push(
            this.addDeviceStates([
                {
                    name: 'ELECTRIC_POWER',
                    valueType: ValueType.Number,
                    unit: 'W',
                    accessType: StateAccessType.Read,
                    type: PropertyType.ElectricPower,
                    callback: state => (this.#getElectricPowerState = state),
                },
                {
                    name: 'CURRENT',
                    valueType: ValueType.Number,
                    unit: 'A',
                    accessType: StateAccessType.Read,
                    type: PropertyType.Current,
                    callback: state => (this.#getCurrentState = state),
                },
                {
                    name: 'VOLTAGE',
                    valueType: ValueType.Number,
                    unit: 'V',
                    accessType: StateAccessType.Read,
                    type: PropertyType.Voltage,
                    callback: state => (this.#getVoltageState = state),
                },
                {
                    name: 'CONSUMPTION',
                    valueType: ValueType.Number,
                    unit: 'Wh',
                    accessType: StateAccessType.Read,
                    type: PropertyType.Consumption,
                    callback: state => (this.#getConsumptionState = state),
                },
                {
                    name: 'FREQUENCY',
                    valueType: ValueType.Number,
                    unit: 'Hz',
                    accessType: StateAccessType.Read,
                    type: PropertyType.Frequency,
                    callback: state => (this.#getFrequencyState = state),
                },
            ]),
        );
    }

    getElectricPower(): number | undefined {
        if (!this.#getElectricPowerState) {
            throw new Error('Power state not found');
        }
        return this.#getElectricPowerState.value;
    }

    getCurrent(): number | undefined {
        if (!this.#getCurrentState) {
            throw new Error('Current state not found');
        }
        return this.#getCurrentState.value;
    }

    getVoltage(): number | undefined {
        if (!this.#getVoltageState) {
            throw new Error('Voltage state not found');
        }
        return this.#getVoltageState.value;
    }

    getConsumption(): number | undefined {
        if (!this.#getConsumptionState) {
            throw new Error('Consumption state not found');
        }
        return this.#getConsumptionState.value;
    }

    getFrequency(): number | undefined {
        if (!this.#getFrequencyState) {
            throw new Error('Frequency state not found');
        }
        return this.#getFrequencyState.value;
    }
}

export default ElectricityDataDevice;
