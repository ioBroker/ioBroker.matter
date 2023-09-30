import GenericDevice, {PropertyType, DetectedDevice, DeviceState} from './GenericDevice';

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
    private readonly _setLevelState: DeviceState | undefined;
    private _getLevelState: DeviceState | undefined;

    private _setPowerState: DeviceState | undefined;
    private readonly _modeState: DeviceState | undefined;

    private _modes: Promise<{[key: string]: ThermostatMode}>;

    private _value: number;
    private _power: boolean;
    private _mode: ThermostatMode;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter) {
        super(detectedDevice, adapter);

        this._setLevelState = this.getDeviceState('SET');
        this._getLevelState = this.getDeviceState('ACTUAL') || this._setLevelState;

        this._setPowerState = this.getDeviceState('POWER');
        this._modeState = this.getDeviceState('MODE');

        this._properties.push(PropertyType.Level);
        if (this._modeState) {
            this._properties.push(PropertyType.Mode);
            this._modes = this._adapter.getObjectAsync(this._modeState.id)
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
        if (this._setPowerState) {
            this._properties.push(PropertyType.Power);
        }
        if (this._getLevelState) {
            this._subscribeIDs.push(this._getLevelState.id);
        }
        if (this._setPowerState) {
            this._subscribeIDs.push(this._setPowerState.id);
        }
        if (this._modeState) {
            this._subscribeIDs.push(this._modeState.id);
        }

        this._subscribeIDs = this._subscribeIDs.filter(w => w);

        this._doSubsribe();
    }

    getModes(): Promise<ThermostatMode[]> {
        return this._modes
            .then(modes => Object.keys(modes).map(key => modes[key]));
    }

    async setMode(mode: ThermostatMode) {
        if (!this._modeState) {
            throw new Error('Mode state not found');
        }
        return this._adapter.setStateAsync(this._modeState.id, mode);
    }

    getMode(): ThermostatMode {
        return this._mode;
    }

    getLevel(): number {
        return this._value;
    }

    async setLevel(value: number) {
        if (!this._setLevelState) {
            throw new Error('Level state not found');
        }
        return this._adapter.setStateAsync(this._setLevelState.id, value);
    }

    getPower(): boolean {
        if (!this._setPowerState) {
            throw new Error('Power state not found');
        }
        return this._power;
    }

    async setPower(value: boolean) {
        if (!this._setPowerState) {
            throw new Error('Power state not found');
        }
        return this._adapter.setStateAsync(this._setPowerState.id, value);
    }
}

export default Thermostat;