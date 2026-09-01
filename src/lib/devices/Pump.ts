import { type DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import { ElectricityDataDevice } from './ElectricityDataDevice';
import { type DetectedDevice, type DeviceOptions, StateAccessType } from './GenericDevice';
import type { CustomStatesRecord } from '../../matter/to-iobroker/custom-states';
import { FLOW_CONVERSION_MAP, FLOW_UNIT, PRESSURE_CONVERSION_MAP, PRESSURE_UNIT } from './unitConversions';

export class Pump extends ElectricityDataDevice {
    #powerState?: DeviceStateObject<boolean | number>;
    #levelState?: DeviceStateObject<number>;
    #getTemperatureState?: DeviceStateObject<number>;
    #getPressureState?: DeviceStateObject<number>;
    #getFlowState?: DeviceStateObject<number>;

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
                    name: 'POWER',
                    valueType: ValueType.Boolean,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.Power,
                    callback: state => (this.#powerState = state),
                },
                {
                    name: 'LEVEL',
                    valueType: ValueType.NumberPercent,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.Level,
                    callback: state => (this.#levelState = state),
                },
                {
                    name: 'TEMPERATURE',
                    valueType: ValueType.Number,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Temperature,
                    callback: state => (this.#getTemperatureState = state),
                    unitConversionMap: {
                        '°F': (value, toDefaultUnit) => (toDefaultUnit ? (value - 32) / 1.8 : value * 1.8 + 32),
                    },
                },
                {
                    name: 'PRESSURE',
                    valueType: ValueType.Number,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Pressure,
                    unit: PRESSURE_UNIT,
                    unitConversionMap: PRESSURE_CONVERSION_MAP,
                    callback: state => (this.#getPressureState = state),
                },
                {
                    name: 'FLOW',
                    valueType: ValueType.Number,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Flow,
                    unit: FLOW_UNIT,
                    unitConversionMap: FLOW_CONVERSION_MAP,
                    callback: state => (this.#getFlowState = state),
                },
            ]),
        );
    }

    getPower(): boolean | undefined {
        if (!this.#powerState) {
            throw new Error('Power state not found');
        }
        const value = this.#powerState.value;
        return typeof value === 'number' ? value !== 0 : value;
    }

    setPower(value: boolean): Promise<void> {
        if (!this.#powerState) {
            throw new Error('Power state not found');
        }
        return this.#powerState.setValue(value);
    }

    updatePower(value: boolean | number): Promise<void> {
        if (!this.#powerState) {
            throw new Error('Power state not found');
        }
        return this.#powerState.updateValue(value);
    }

    hasLevel(): boolean {
        return !!this.#levelState;
    }

    getLevel(): number | undefined {
        if (!this.#levelState) {
            throw new Error('Level state not found');
        }
        return this.#levelState.value;
    }

    setLevel(value: number): Promise<void> {
        if (!this.#levelState) {
            throw new Error('Level state not found');
        }
        return this.#levelState.setValue(value);
    }

    updateLevel(value: number): Promise<void> {
        if (!this.#levelState) {
            throw new Error('Level state not found');
        }
        return this.#levelState.updateValue(value);
    }

    hasTemperature(): boolean {
        return !!this.#getTemperatureState;
    }

    getTemperature(): number | undefined {
        if (!this.#getTemperatureState) {
            throw new Error('Temperature state not found');
        }
        return this.#getTemperatureState.value;
    }

    updateTemperature(value: number): Promise<void> {
        if (!this.#getTemperatureState) {
            throw new Error('Temperature state not found');
        }
        return this.#getTemperatureState.updateValue(value);
    }

    hasPressure(): boolean {
        return !!this.#getPressureState;
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

    hasFlow(): boolean {
        return !!this.#getFlowState;
    }

    getFlow(): number | undefined {
        if (!this.#getFlowState) {
            throw new Error('Flow state not found');
        }
        return this.#getFlowState.value;
    }

    updateFlow(value: number): Promise<void> {
        if (!this.#getFlowState) {
            throw new Error('Flow state not found');
        }
        return this.#getFlowState.updateValue(value);
    }
}
