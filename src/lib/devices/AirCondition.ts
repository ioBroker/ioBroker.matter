import GenericDevice, {
    DetectedDevice,
    DeviceStateObject,
    PropertyType,
    StateAccessType,
    ValueType
} from './GenericDevice';

enum AirConditionerMode {
    Auto = 'AUTO',
    Cool = 'COOL',
    Dry = 'DRY',
    Eco = 'ECO',
    FanOnly = 'FAN_ONLY',
    Heat = 'HEAT',
    Off = 'OFF',
}

enum AirConditionerSpeed {
    Auto = 'AUTO',
    High = 'HIGH',
    Low = 'LOW',
    Medium = 'MEDIUM',
    Quiet = 'QUIET',
    Turbo = 'TURBO',
}

enum AirConditionerSwing {
    Auto = 'AUTO',
    Horizontal = 'HORIZONTAL',
    Stationary = 'STATIONARY',
    Vertical = 'VERTICAL',
}

class AirCondition extends GenericDevice {
    private _levelState: DeviceStateObject<number> | undefined;
    private _getTemperatureState: DeviceStateObject<number> | undefined;
    private _powerState: DeviceStateObject<boolean> | undefined;
    private _getHumidityState: DeviceStateObject<number> | undefined;
    private _speedState: DeviceStateObject<AirConditionerSpeed> | undefined;
    private _boostState: DeviceStateObject<boolean | number> | undefined;
    private _SwingState: DeviceStateObject<AirConditionerSwing> | undefined;
    private _modeState: DeviceStateObject<AirConditionerMode> | undefined;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter) {
        super(detectedDevice, adapter);

        this._ready.push(this.addDeviceStates([
            { name: 'SET', valueType: ValueType.NumberMinMax, accessType: StateAccessType.ReadWrite, type: PropertyType.Level, callback: state => this._levelState = state },

            { name: 'ACTUAL', valueType: ValueType.Number, accessType: StateAccessType.Read, type: PropertyType.Temperature, callback: state => this._getTemperatureState = state },
            { name: 'POWER', valueType: ValueType.Boolean, accessType: StateAccessType.ReadWrite, type: PropertyType.Power, callback: state => this._powerState = state },
            { name: 'HUMIDITY', valueType: ValueType.NumberPercent, accessType: StateAccessType.Read, type: PropertyType.Humidity, callback: state => this._getHumidityState = state },
            { name: 'SPEED', valueType: ValueType.Enum, accessType: StateAccessType.ReadWrite, type: PropertyType.Speed, callback: state => this._speedState = state },
            { name: 'BOOST', valueType: ValueType.Boolean, accessType: StateAccessType.ReadWrite, type: PropertyType.Boost, callback: state => this._boostState = state },
            { name: 'SWING', valueType: ValueType.Boolean, accessType: StateAccessType.ReadWrite, type: PropertyType.Swing, callback: state => this._SwingState = state },
            { name: 'MODE', valueType: ValueType.Enum, accessType: StateAccessType.ReadWrite, type: PropertyType.Mode, callback: state => this._modeState = state },
        ]));
    }

    getLevel(): number | undefined {
        if (!this._levelState) {
            throw new Error('Level state not found');
        }
        return this._levelState.value;
    }

    async setLevel(value: number): Promise<void> {
        if (!this._levelState) {
            throw new Error('Level state not found');
        }
        return this._levelState.setValue(value);
    }

    getTemperature(): number | undefined {
        if (!this._getTemperatureState) {
            throw new Error('Temperature state not found');
        }
        return this._getTemperatureState.value;
    }

    getPower(): boolean | undefined {
        if (!this._powerState) {
            throw new Error('Power state not found');
        }
        return this._powerState.value;
    }

    async setPower(value: boolean): Promise<void> {
        if (!this._powerState) {
            throw new Error('Power state not found');
        }
        return this._powerState.setValue(value);
    }

    getHumidity(): number | undefined {
        if (!this._getHumidityState) {
            throw new Error('Humidity state not found');
        }
        return this._getHumidityState.value;
    }

    getBoost(): boolean | number | undefined {
        if (!this._boostState) {
            throw new Error('Boost state not found');
        }
        return this._boostState.value;
    }

    async setBoost(value: boolean | number): Promise<void> {
        if (!this._boostState) {
            throw new Error('Boost state not found');
        }
        return this._boostState.setValue(value);
    }

    getSpeed(): AirConditionerSpeed | undefined {
        if (!this._speedState) {
            throw new Error('Speed state not found');
        }
        return this._speedState.value;
    }

    async setSpeed(value: AirConditionerSpeed):Promise<void> {
        if (!this._speedState) {
            throw new Error('Speed state not found');
        }
        return this._speedState.setValue(value);
    }

    getSpeedModes(): Promise<AirConditionerSpeed[]> {
        if (!this._speedState) {
            throw new Error('Speed state not found');
        }
        return this._speedState.getModes();
    }

    getSwing(): AirConditionerSwing | undefined {
        if (!this._SwingState) {
            throw new Error('Swing state not found');
        }
        return this._SwingState.value;
    }

    async setSwing(value: AirConditionerSwing): Promise<void> {
        if (!this._SwingState) {
            throw new Error('Swing state not found');
        }
        return this._SwingState.setValue(value);
    }

    getSwingModes(): Promise<AirConditionerSwing[]> {
        if (!this._SwingState) {
            throw new Error('Swing state not found');
        }
        return this._SwingState.getModes();
    }

    getMode(): AirConditionerMode | undefined {
        if (!this._modeState) {
            throw new Error('Mode state not found');
        }
        return this._modeState.value;
    }

    async setMode(mode: AirConditionerMode): Promise<void> {
        if (!this._modeState) {
            throw new Error('Mode state not found');
        }
        await this._modeState.setValue(mode);
    }

    getModes(): Promise<AirConditionerMode[]> {
        if (!this._modeState) {
            throw new Error('Mode state not found');
        }
        return this._modeState.getModes();
    }
}

export default AirCondition;