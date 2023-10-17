import GenericDevice, { DetectedDevice, DeviceStateObject, PropertyType } from "./GenericDevice";

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

class AirConditioner extends GenericDevice {
    private _setLevelState: DeviceStateObject<number> | undefined;
    private _getLevelState: DeviceStateObject<number> | undefined;
    private _powerState: DeviceStateObject<boolean|number> | undefined;
    private _getHumidityState: DeviceStateObject<number> | undefined;
    private _SpeedState: DeviceStateObject<AirConditionerSpeed> | undefined;
    private _BoostState: DeviceStateObject<boolean|number> | undefined;
    private _SwingState: DeviceStateObject<AirConditionerSwing> | undefined;
    private _modeState: DeviceStateObject<AirConditionerMode> | undefined;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter) {
        super(detectedDevice, adapter);

        this.addDeviceStates([
            {name: 'SET', type: PropertyType.Level, callback: state => this._setLevelState = state},
            {name: 'ACTUAL', type: PropertyType.Level, callback: state => this._getLevelState = state || this._setLevelState},
            {name: 'POWER', type: PropertyType.Power, callback: state => this._powerState = state},
            {name: 'HUMIDITY', type: PropertyType.Humidity, callback: state => this._getHumidityState = state},
            {name: 'SPEED', type: PropertyType.Speed, callback: state => this._SpeedState = state, isEnum: true},
            {name: 'BOOST', type: PropertyType.Boost, callback: state => this._BoostState = state, isEnum: true},
            {name: 'SWING', type: PropertyType.Swing, callback: state => this._SwingState = state},
            {name: 'MODE', type: PropertyType.Mode, callback: state => this._modeState = state, isEnum: true},
        ]);
    }

    getLevel(): number | undefined {
        if (!this._getLevelState) {
            throw new Error('Level state not found');
        }
        return this._getLevelState.value;
    }

    async setLevel(value: number) {
        if (!this._setLevelState?.state?.id) {
            throw new Error('Level state not found');
        }
        return this._adapter.setStateAsync(this._setLevelState.state.id, value);
    }

    getPower(): boolean|number | undefined {
        if (!this._powerState) {
            throw new Error('Power state not found');
        }
        return this._powerState.value;
    }

    async setPower(value: boolean|number) {
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

    getBoost(): boolean|number | undefined {
        if (!this._BoostState) {
            throw new Error('Boost state not found');
        }
        return this._BoostState.value;
    }

    async setBoost(value: boolean|number) {
        if (!this._BoostState) {
            throw new Error('Boost state not found');
        }
        return this._BoostState.setValue(value);
    }

    getSpeed(): AirConditionerSpeed | undefined {
        if (!this._SpeedState) {
            throw new Error('Speed state not found');
        }
        return this._SpeedState.value;
    }

    setSpeed(value: AirConditionerSpeed) {
        if (!this._SpeedState) {
            throw new Error('Speed state not found');
        }
        return this._SpeedState.setValue(value);
    }

    getSpeedModes(): Promise<AirConditionerSpeed[]> {
        if (!this._SpeedState) {
            throw new Error('Speed state not found');
        }
        return this._SpeedState.getModes();
    }

    getSwing(): AirConditionerSwing | undefined {
        if (!this._SwingState) {
            throw new Error('Swing state not found');
        }
        return this._SwingState.value;
    }

    async setSwing(value: AirConditionerSwing) {
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

    async setMode(mode: AirConditionerMode) {
        if (!this._modeState) {
            throw new Error('Mode state not found');
        }
        return this._modeState.setValue(mode);
    }

    getModes(): Promise<AirConditionerMode[]> {
        if (!this._modeState) {
            throw new Error('Mode state not found');
        }
        return this._modeState.getModes();
    }
}

export default AirConditioner;