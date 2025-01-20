import { type DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import { GenericDevice, type DetectedDevice, type DeviceOptions, StateAccessType } from './GenericDevice';

const milliConversion = (value: number, toDefaultUnit: boolean): number =>
    toDefaultUnit ? value * 0.001 : value * 1000;
const kiloConversion = (value: number, toDefaultUnit: boolean): number =>
    toDefaultUnit ? value * 1000 : value * 0.001;
const megaConversion = (value: number, toDefaultUnit: boolean): number =>
    toDefaultUnit ? value * 1000000 : value * 0.000001;

export class ElectricityDataDevice extends GenericDevice {
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
                    unitConversionMap: {
                        mW: milliConversion,
                        kW: kiloConversion,
                        MW: megaConversion,
                    },
                },
                {
                    name: 'CURRENT',
                    valueType: ValueType.Number,
                    unit: 'A',
                    accessType: StateAccessType.Read,
                    type: PropertyType.Current,
                    callback: state => (this.#getCurrentState = state),
                    unitConversionMap: {
                        mA: milliConversion,
                        kA: kiloConversion,
                        MA: megaConversion,
                    },
                },
                {
                    name: 'VOLTAGE',
                    valueType: ValueType.Number,
                    unit: 'V',
                    accessType: StateAccessType.Read,
                    type: PropertyType.Voltage,
                    callback: state => (this.#getVoltageState = state),
                    unitConversionMap: {
                        mV: milliConversion,
                        kV: kiloConversion,
                        MV: megaConversion,
                    },
                },
                {
                    name: 'CONSUMPTION',
                    valueType: ValueType.Number,
                    unit: 'Wh',
                    accessType: StateAccessType.Read,
                    type: PropertyType.Consumption,
                    callback: state => (this.#getConsumptionState = state),
                    unitConversionMap: {
                        mWh: milliConversion,
                        kWh: kiloConversion,
                        MWh: megaConversion,
                    },
                },
                {
                    name: 'FREQUENCY',
                    valueType: ValueType.Number,
                    unit: 'Hz',
                    accessType: StateAccessType.Read,
                    type: PropertyType.Frequency,
                    callback: state => (this.#getFrequencyState = state),
                    unitConversionMap: {
                        mHz: milliConversion,
                        kHz: kiloConversion,
                        MHz: megaConversion,
                    },
                },
            ]),
        );
    }

    hasElectricPower(): boolean {
        return !!this.#getElectricPowerState;
    }

    getElectricPower(): number | undefined {
        if (!this.#getElectricPowerState) {
            throw new Error('Power state not found');
        }
        return this.#getElectricPowerState.value;
    }

    updateElectricPower(value: number): Promise<void> {
        if (!this.#getElectricPowerState) {
            throw new Error('Power state not found');
        }
        return this.#getElectricPowerState.updateValue(value);
    }

    hasCurrent(): boolean {
        return !!this.#getCurrentState;
    }

    getCurrent(): number | undefined {
        if (!this.#getCurrentState) {
            throw new Error('Current state not found');
        }
        return this.#getCurrentState.value;
    }

    updateCurrent(value: number): Promise<void> {
        if (!this.#getCurrentState) {
            throw new Error('Current state not found');
        }
        return this.#getCurrentState.updateValue(value);
    }

    hasVoltage(): boolean {
        return !!this.#getVoltageState;
    }

    getVoltage(): number | undefined {
        if (!this.#getVoltageState) {
            throw new Error('Voltage state not found');
        }
        return this.#getVoltageState.value;
    }

    updateVoltage(value: number): Promise<void> {
        if (!this.#getVoltageState) {
            throw new Error('Voltage state not found');
        }
        return this.#getVoltageState.updateValue(value);
    }

    hasConsumption(): boolean {
        return !!this.#getConsumptionState;
    }

    getConsumption(): number | undefined {
        if (!this.#getConsumptionState) {
            throw new Error('Consumption state not found');
        }
        return this.#getConsumptionState.value;
    }

    updateConsumption(value: number): Promise<void> {
        if (!this.#getConsumptionState) {
            throw new Error('Consumption state not found');
        }
        return this.#getConsumptionState.updateValue(value);
    }

    hasFrequency(): boolean {
        return !!this.#getFrequencyState;
    }

    getFrequency(): number | undefined {
        if (!this.#getFrequencyState) {
            throw new Error('Frequency state not found');
        }
        return this.#getFrequencyState.value;
    }

    updateFrequency(value: number): Promise<void> {
        if (!this.#getFrequencyState) {
            throw new Error('Frequency state not found');
        }
        return this.#getFrequencyState.updateValue(value);
    }
}
