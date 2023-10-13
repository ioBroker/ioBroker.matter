import GenericDevice, {PropertyType, DetectedDevice, DeviceState, DeviceStateObject} from './GenericDevice';

enum ThermostatMode {
    // MANUAL, VACATION, COOL, DRY, ECO, FAN_ONLY, HEAT, OFF
    Auto = 'AUTO',
    Manual = 'MANUAL',
    Vacation = 'VACATION',
    Cool = 'COOL',
    Dry = 'DRY',
    Eco = 'ECO',
    FanOnly = 'FAN_ONLY',
    Heat = 'HEAT',
    Off = 'OFF',
}

class Thermostat extends GenericDevice {
    private _setLevelState: DeviceStateObject<number> | undefined;
    private _getLevelState: DeviceStateObject<number> | undefined;

    private _setPowerState: DeviceStateObject<boolean|number> | undefined;
    private _modeState: DeviceStateObject<ThermostatMode> | undefined;

    private _modes: Promise<{[key: string]: ThermostatMode}>;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter) {
        super(detectedDevice, adapter);

        this.addDeviceStates([
            {name: 'SET', type: PropertyType.Level, callback: state => this._setLevelState = state},
            {name: 'ACTUAL', type: PropertyType.Level, callback: state => this._getLevelState = state || this._setLevelState},
            {name: 'POWER', type: PropertyType.Power, callback: state => this._setPowerState = state},
            {name: 'MODE', type: PropertyType.Mode, callback: state => this._modeState = state},
        ]);

        if (this._modeState) {
            this._modes = this._adapter.getObjectAsync(this._modeState.state.id)
                .then(obj => {
                    // {'MODE_VALUE': 'MODE_TEXT'}
                    let modes: {[key: string]: ThermostatMode} = obj?.common?.states;
                    if (modes) {
                        // convert ['Auto'] => {'Auto': 'AUTO'}
                        if (Array.isArray(modes)) {
                            const _m: {[key: string]: ThermostatMode} = {};
                            modes.forEach((mode: ThermostatMode) => _m[mode] = mode.toUpperCase() as ThermostatMode);
                            modes = _m;
                        }
                        return modes;
                    } else {
                        return {};
                    }
                });
        }
    }

    getModes(): Promise<ThermostatMode[]> {
        return this._modes
            .then(modes => Object.keys(modes).map(key => modes[key]));
    }

    async setMode(mode: ThermostatMode) {
        if (!this._modeState) {
            throw new Error('Mode state not found');
        }
        return this._modeState.setValue(mode);
    }

    getMode(): ThermostatMode {
        if (!this._modeState) {
            throw new Error('Mode state not found');
        }
        return this._modeState.value
    }

    getLevel(): number {
        if (!this._getLevelState) {
            throw new Error('Level state not found');
        }
        return this._getLevelState.value;
    }

    async setLevel(value: number) {
        if (!this._setLevelState) {
            throw new Error('Level state not found');
        }
        return this._adapter.setStateAsync(this._setLevelState.state.id, value);
    }

    getPower(): boolean|number {
        if (!this._setPowerState) {
            throw new Error('Power state not found');
        }
        return this._setPowerState.value;
    }

    async setPower(value: boolean) {
        if (!this._setPowerState) {
            throw new Error('Power state not found');
        }
        return this._adapter.setStateAsync(this._setPowerState.state.id, value);
    }
}

export default Thermostat;