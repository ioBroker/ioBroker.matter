import { ClimateControlDevice } from './ClimateControlDevice';
import { type DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import { type DetectedDevice, type DeviceOptions, StateAccessType } from './GenericDevice';
import { ThermostatMode } from './Thermostat';

export enum AirConditionerMode {
    Auto = ThermostatMode.Auto,
    Cool = ThermostatMode.Cool,
    Dry = ThermostatMode.Dry,
    Eco = ThermostatMode.Eco,
    FanOnly = ThermostatMode.FanOnly,
    Heat = ThermostatMode.Heat,
    Off = ThermostatMode.Off,
}

export enum AirConditionerModeNumbers {
    AUTO = 0,
    COOL = 3,
    DRY = 4,
    ECO = 5,
    FAN_ONLY = 6,
    HEAT = 7,
    OFF = 8,
}

export enum AirConditionerSpeed {
    Auto = 'AUTO',
    High = 'HIGH',
    Low = 'LOW',
    Medium = 'MEDIUM',
    Quiet = 'QUIET',
    Turbo = 'TURBO',
}

export enum AirConditionerSpeedNumbers {
    AUTO = 0,
    HIGH = 1,
    LOW = 2,
    MEDIUM = 3,
    QUIET = 4,
    TURBO = 5,
}

export enum AirConditionerSwing {
    Auto = 'AUTO',
    Horizontal = 'HORIZONTAL',
    Stationary = 'STATIONARY',
    Vertical = 'VERTICAL',
}

export enum AirConditionerSwingNumbers {
    AUTO = 0,
    HORIZONTAL = 1,
    STATIONARY = 2,
    VERTICAL = 3,
}

export enum AirConditionerWorkingMode {
    Idle = 'IDLE',
    Heat = 'HEAT',
    Cool = 'COOL',
}

export enum AirConditionerWorkingModeNumbers {
    IDLE = 0,
    HEAT = 1,
    COOL = 2,
}

export enum AirConditionerAirflowDirection {
    Forward = 'FORWARD',
    Reverse = 'REVERSE',
}

export enum AirConditionerAirflowDirectionNumbers {
    FORWARD = 0,
    REVERSE = 1,
}

export class AirCondition extends ClimateControlDevice<AirConditionerMode, AirConditionerWorkingMode> {
    #getTemperatureState?: DeviceStateObject<number>;
    #powerState?: DeviceStateObject<boolean | number>;
    #getHumidityState?: DeviceStateObject<number>;
    #speedState?: DeviceStateObject<AirConditionerSpeed>;
    #boostState?: DeviceStateObject<boolean | number>;
    #SwingState?: DeviceStateObject<AirConditionerSwing>;
    #speedLevelState?: DeviceStateObject<number>;
    #airflowDirectionState?: DeviceStateObject<AirConditionerAirflowDirection>;
    #filterConditionState?: DeviceStateObject<number>;
    #filterConditionCarbonState?: DeviceStateObject<number>;
    #filterChangeState?: DeviceStateObject<boolean>;

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
                    name: 'POWER',
                    valueType: ValueType.Boolean,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.Power,
                    callback: state => (this.#powerState = state),
                },
                {
                    name: 'HUMIDITY',
                    valueType: ValueType.NumberPercent,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Humidity,
                    callback: state => (this.#getHumidityState = state),
                },
                {
                    name: 'SPEED',
                    valueType: ValueType.Enum,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.Speed,
                    callback: state => (this.#speedState = state),
                },
                {
                    name: 'BOOST',
                    valueType: ValueType.Boolean,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.Boost,
                    callback: state => (this.#boostState = state),
                },
                {
                    name: 'SWING',
                    valueType: ValueType.Enum,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.Swing,
                    callback: state => (this.#SwingState = state),
                },
                {
                    name: 'SPEED_LEVEL',
                    valueType: ValueType.NumberPercent,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.SpeedLevel,
                    callback: state => (this.#speedLevelState = state),
                },
                {
                    name: 'AIRFLOW_DIRECTION',
                    valueType: ValueType.Enum,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.AirflowDirection,
                    callback: state => (this.#airflowDirectionState = state),
                },
                {
                    name: 'FILTER_CONDITION',
                    valueType: ValueType.NumberPercent,
                    accessType: StateAccessType.Read,
                    type: PropertyType.FilterCondition,
                    callback: state => (this.#filterConditionState = state),
                },
                {
                    name: 'FILTER_CONDITION_CARBON',
                    valueType: ValueType.NumberPercent,
                    accessType: StateAccessType.Read,
                    type: PropertyType.FilterConditionCarbon,
                    callback: state => (this.#filterConditionCarbonState = state),
                },
                {
                    name: 'FILTER_CHANGE',
                    valueType: ValueType.Boolean,
                    accessType: StateAccessType.Read,
                    type: PropertyType.FilterChange,
                    callback: state => (this.#filterChangeState = state),
                },
            ]),
        );
    }

    getTemperature(): number | undefined {
        if (!this.#getTemperatureState) {
            throw new Error('Temperature state not found');
        }
        return this.#getTemperatureState.value;
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

    getHumidity(): number | undefined {
        if (!this.#getHumidityState) {
            throw new Error('Humidity state not found');
        }
        return this.#getHumidityState.value;
    }

    getBoost(): boolean | number | undefined {
        if (!this.#boostState) {
            throw new Error('Boost state not found');
        }
        return this.#boostState.value;
    }

    setBoost(value: boolean | number): Promise<void> {
        if (!this.#boostState) {
            throw new Error('Boost state not found');
        }
        return this.#boostState.setValue(value);
    }

    getSpeed(): AirConditionerSpeed | undefined {
        if (!this.#speedState) {
            throw new Error('Speed state not found');
        }
        return this.#speedState.value;
    }

    setSpeed(value: AirConditionerSpeed): Promise<void> {
        if (!this.#speedState) {
            throw new Error('Speed state not found');
        }
        return this.#speedState.setValue(value);
    }

    getSpeedModes(): AirConditionerSpeed[] {
        if (!this.#speedState) {
            throw new Error('Speed state not found');
        }
        return this.#speedState.getModes();
    }

    getSwing(): AirConditionerSwing | undefined {
        if (!this.#SwingState) {
            throw new Error('Swing state not found');
        }
        return this.#SwingState.value;
    }

    setSwing(value: AirConditionerSwing): Promise<void> {
        if (!this.#SwingState) {
            throw new Error('Swing state not found');
        }
        return this.#SwingState.setValue(value);
    }

    getSwingModes(): AirConditionerSwing[] {
        if (!this.#SwingState) {
            throw new Error('Swing state not found');
        }
        return this.#SwingState.getModes();
    }

    hasTemperature(): boolean {
        return !!this.#getTemperatureState;
    }

    updateTemperature(value: number): Promise<void> {
        if (!this.#getTemperatureState) {
            throw new Error('Temperature state not found');
        }
        return this.#getTemperatureState.updateValue(value);
    }

    hasPower(): boolean {
        return !!this.#powerState;
    }

    hasHumidity(): boolean {
        return !!this.#getHumidityState;
    }

    updateHumidity(value: number): Promise<void> {
        if (!this.#getHumidityState) {
            throw new Error('Humidity state not found');
        }
        return this.#getHumidityState.updateValue(value);
    }

    hasBoost(): boolean {
        return !!this.#boostState;
    }

    updateBoost(value: boolean | number): Promise<void> {
        if (!this.#boostState) {
            throw new Error('Boost state not found');
        }
        return this.#boostState.updateValue(value);
    }

    hasSpeed(): boolean {
        return !!this.#speedState;
    }

    updateSpeed(value: AirConditionerSpeed): Promise<void> {
        if (!this.#speedState) {
            throw new Error('Speed state not found');
        }
        return this.#speedState.updateValue(value);
    }

    updateSpeedModes(modes: { [key: string]: AirConditionerSpeed }): Promise<void> {
        if (!this.#speedState) {
            throw new Error('Speed state not found');
        }
        return this.#speedState.updateModes(modes);
    }

    hasSwing(): boolean {
        return !!this.#SwingState;
    }

    updateSwing(value: AirConditionerSwing): Promise<void> {
        if (!this.#SwingState) {
            throw new Error('Swing state not found');
        }
        return this.#SwingState.updateValue(value);
    }

    updateSwingModes(modes: { [key: string]: AirConditionerSwing }): Promise<void> {
        if (!this.#SwingState) {
            throw new Error('Swing state not found');
        }
        return this.#SwingState.updateModes(modes);
    }

    getSpeedLevel(): number | undefined {
        if (!this.#speedLevelState) {
            throw new Error('Speed level state not found');
        }
        return this.#speedLevelState.value;
    }

    setSpeedLevel(value: number): Promise<void> {
        if (!this.#speedLevelState) {
            throw new Error('Speed level state not found');
        }
        return this.#speedLevelState.setValue(value);
    }

    updateSpeedLevel(value: number): Promise<void> {
        if (!this.#speedLevelState) {
            throw new Error('Speed level state not found');
        }
        return this.#speedLevelState.updateValue(value);
    }

    hasSpeedLevel(): boolean {
        return !!this.#speedLevelState;
    }

    getAirflowDirection(): AirConditionerAirflowDirection | undefined {
        if (!this.#airflowDirectionState) {
            throw new Error('Airflow direction state not found');
        }
        return this.#airflowDirectionState.value;
    }

    setAirflowDirection(value: AirConditionerAirflowDirection): Promise<void> {
        if (!this.#airflowDirectionState) {
            throw new Error('Airflow direction state not found');
        }
        return this.#airflowDirectionState.setValue(value);
    }

    updateAirflowDirection(value: AirConditionerAirflowDirection): Promise<void> {
        if (!this.#airflowDirectionState) {
            throw new Error('Airflow direction state not found');
        }
        return this.#airflowDirectionState.updateValue(value);
    }

    getAirflowDirectionModes(): AirConditionerAirflowDirection[] {
        if (!this.#airflowDirectionState) {
            throw new Error('Airflow direction state not found');
        }
        return this.#airflowDirectionState.getModes();
    }

    updateAirflowDirectionModes(modes: { [key: string]: AirConditionerAirflowDirection }): Promise<void> {
        if (!this.#airflowDirectionState) {
            throw new Error('Airflow direction state not found');
        }
        return this.#airflowDirectionState.updateModes(modes);
    }

    hasAirflowDirection(): boolean {
        return !!this.#airflowDirectionState;
    }

    getFilterCondition(): number | undefined {
        if (!this.#filterConditionState) {
            throw new Error('Filter condition state not found');
        }
        return this.#filterConditionState.value;
    }

    updateFilterCondition(value: number): Promise<void> {
        if (!this.#filterConditionState) {
            throw new Error('Filter condition state not found');
        }
        return this.#filterConditionState.updateValue(value);
    }

    hasFilterCondition(): boolean {
        return !!this.#filterConditionState;
    }

    getFilterConditionCarbon(): number | undefined {
        if (!this.#filterConditionCarbonState) {
            throw new Error('Carbon filter condition state not found');
        }
        return this.#filterConditionCarbonState.value;
    }

    updateFilterConditionCarbon(value: number): Promise<void> {
        if (!this.#filterConditionCarbonState) {
            throw new Error('Carbon filter condition state not found');
        }
        return this.#filterConditionCarbonState.updateValue(value);
    }

    hasFilterConditionCarbon(): boolean {
        return !!this.#filterConditionCarbonState;
    }

    getFilterChange(): boolean | undefined {
        if (!this.#filterChangeState) {
            throw new Error('Filter change state not found');
        }
        return this.#filterChangeState.value;
    }

    updateFilterChange(value: boolean): Promise<void> {
        if (!this.#filterChangeState) {
            throw new Error('Filter change state not found');
        }
        return this.#filterChangeState.updateValue(value);
    }

    hasFilterChange(): boolean {
        return !!this.#filterChangeState;
    }
}
