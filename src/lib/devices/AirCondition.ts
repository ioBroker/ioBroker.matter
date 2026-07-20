import { type DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import { ElectricityDataDevice } from './ElectricityDataDevice';
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

export class AirCondition extends ElectricityDataDevice {
    #levelState?: DeviceStateObject<number>;
    #getTemperatureState?: DeviceStateObject<number>;
    #powerState?: DeviceStateObject<boolean | number>;
    #getHumidityState?: DeviceStateObject<number>;
    #speedState?: DeviceStateObject<AirConditionerSpeed>;
    #boostState?: DeviceStateObject<boolean | number>;
    #SwingState?: DeviceStateObject<AirConditionerSwing>;
    #modeState?: DeviceStateObject<AirConditionerMode>;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._construction.push(
            this.addDeviceStates([
                {
                    name: 'SET',
                    valueType: ValueType.NumberMinMax,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.Level,
                    callback: state => (this.#levelState = state),
                },

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
                    name: 'MODE',
                    valueType: ValueType.Enum,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.Mode,
                    callback: state => (this.#modeState = state),
                },
            ]),
        );
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

    getMode(): AirConditionerMode | undefined {
        if (!this.#modeState) {
            throw new Error('Mode state not found');
        }
        return this.#modeState.value;
    }

    setMode(mode: AirConditionerMode): Promise<void> {
        if (!this.#modeState) {
            throw new Error('Mode state not found');
        }
        return this.#modeState.setValue(mode);
    }

    getModes(): AirConditionerMode[] {
        if (!this.#modeState) {
            throw new Error('Mode state not found');
        }
        return this.#modeState.getModes();
    }

    updateMode(mode: AirConditionerMode): Promise<void> {
        if (!this.#modeState) {
            throw new Error('Mode state not found');
        }
        return this.#modeState.updateValue(mode);
    }

    updateModes(modes: { [key: string]: AirConditionerMode }): Promise<void> {
        if (!this.#modeState) {
            throw new Error('Mode state not found');
        }
        return this.#modeState.updateModes(modes);
    }

    hasMode(): boolean {
        return !!this.#modeState;
    }

    hasLevel(): boolean {
        return !!this.#levelState;
    }

    updateLevel(value: number): Promise<void> {
        if (!this.#levelState) {
            throw new Error('Level state not found');
        }
        return this.#levelState.updateValue(value);
    }

    getSetpointMinMax(): { min: number; max: number } | null {
        if (!this.#levelState) {
            throw new Error('Level state not found');
        }
        return this.#levelState.getMinMax();
    }

    updateSetpointMinMax(min: number | undefined, max: number | undefined, step = 0.5): Promise<void> {
        if (!this.#levelState) {
            throw new Error('Level state not found');
        }
        return this.#levelState.updateMinMax({ min, max, step });
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
}
