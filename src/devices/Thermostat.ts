import GenericDevice, {PropertyType, DetectedDevice, DeviceStateObject} from './GenericDevice';

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

    private _getPowerState: DeviceStateObject<boolean|number> | undefined;
    private _getHumidityState: DeviceStateObject<number> | undefined;
    private _BoostState: DeviceStateObject<number> | undefined;
    private _PartyState: DeviceStateObject<boolean|number> | undefined;
    private _modeState: DeviceStateObject<ThermostatMode> | undefined;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter) {
        super(detectedDevice, adapter);

        this.addDeviceStates([
            {name: 'SET', type: PropertyType.Level, callback: state => this._setLevelState = state},
            {name: 'ACTUAL', type: PropertyType.Level, callback: state => this._getLevelState = state || this._setLevelState},
            {name: 'POWER', type: PropertyType.Power, callback: state => this._getPowerState = state},
            {name: 'HUMIDITY', type: PropertyType.Humidity, callback: state => this._getHumidityState = state},
            {name: 'BOOST', type: PropertyType.Boost, callback: state => this._BoostState = state},
            {name: 'PARTY', type: PropertyType.Party, callback: state => this._PartyState = state},
            {name: 'MODE', type: PropertyType.Mode, callback: state => this._modeState = state, isEnum: true},
        ]);
    }

    getModes(): Promise<ThermostatMode[]> {
        if (!this._modeState) {
            throw new Error('Mode state not found');
        }
        return this._modeState.getModes();
    }

    async setMode(mode: ThermostatMode) {
        if (!this._modeState) {
            throw new Error('Mode state not found');
        }
        return this._modeState.setValue(mode);
    }

    getMode(): ThermostatMode | undefined {
        if (!this._modeState) {
            throw new Error('Mode state not found');
        }
        return this._modeState.value
    }

    getLevel(): number | undefined {
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

    getPower(): boolean|number | undefined {
        if (!this._getPowerState) {
            throw new Error('Power state not found');
        }
        return this._getPowerState.value;
    }

    getHumidity(): number | undefined {
        if (!this._getHumidityState) {
            throw new Error('Humidity state not found');
        }
        return this._getHumidityState.value;
    }

    getBoost(): number | undefined {
        if (!this._BoostState) {
            throw new Error('Boost state not found');
        }
        return this._BoostState.value;
    }

    setBoost(value: number) {
        if (!this._BoostState) {
            throw new Error('Boost state not found');
        }
        return this._BoostState.setValue(value);
    }

    getParty(): boolean|number | undefined {
        if (!this._PartyState) {
            throw new Error('Party state not found');
        }
        return this._PartyState.value;
    }

    setParty(value: boolean|number) {
        if (!this._PartyState) {
            throw new Error('Party state not found');
        }
        return this._PartyState.setValue(value);
    }
}

export default Thermostat;