import GenericDevice, {
    PropertyType,
    DetectedDevice,
    DeviceStateObject,
    StateAccessType,
    ValueType,
    DeviceOptions,
} from './GenericDevice';

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
    private _levelState: DeviceStateObject<number> | undefined;
    private _getTemperatureState: DeviceStateObject<number> | undefined;

    private _powerState: DeviceStateObject<boolean | number> | undefined;
    private _getHumidityState: DeviceStateObject<number> | undefined;
    private _boostState: DeviceStateObject<number> | undefined;
    private _partyState: DeviceStateObject<boolean | number> | undefined;
    private _modeState: DeviceStateObject<ThermostatMode> | undefined;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._ready.push(this.addDeviceStates([
            { name: 'SET', valueType: ValueType.NumberMinMax, accessType: StateAccessType.ReadWrite, type: PropertyType.Level, callback: state => this._levelState = state },
            { name: 'ACTUAL', valueType: ValueType.Number, accessType: StateAccessType.Read, type: PropertyType.Temperature, callback: state => this._getTemperatureState = state },
            { name: 'POWER', valueType: ValueType.Boolean, accessType: StateAccessType.ReadWrite, type: PropertyType.Power, callback: state => this._powerState = state },
            { name: 'HUMIDITY', valueType: ValueType.NumberPercent, accessType: StateAccessType.Read, type: PropertyType.Humidity, callback: state => this._getHumidityState = state },
            { name: 'BOOST', valueType: ValueType.Boolean, accessType: StateAccessType.ReadWrite, type: PropertyType.Boost, callback: state => this._boostState = state },
            { name: 'PARTY', valueType: ValueType.Boolean, accessType: StateAccessType.ReadWrite, type: PropertyType.Party, callback: state => this._partyState = state },
            { name: 'MODE', valueType: ValueType.Enum, accessType: StateAccessType.ReadWrite, type: PropertyType.Mode, callback: state => this._modeState = state },
        ]));
    }

    getModes(): Promise<ThermostatMode[]> {
        if (!this._modeState) {
            throw new Error('Mode state not found');
        }
        return this._modeState.getModes();
    }

    async setMode(mode: ThermostatMode): Promise<void> {
        if (!this._modeState) {
            throw new Error('Mode state not found');
        }
        return this._modeState.setValue(mode);
    }

    getMode(): ThermostatMode | undefined {
        if (!this._modeState) {
            throw new Error('Mode state not found');
        }
        return this._modeState.value;
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

    getPower(): boolean | number | undefined {
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

    getBoost(): number | undefined {
        if (!this._boostState) {
            throw new Error('Boost state not found');
        }
        return this._boostState.value;
    }

    async setBoost(value: number): Promise<void> {
        if (!this._boostState) {
            throw new Error('Boost state not found');
        }
        return this._boostState.setValue(value);
    }

    getParty(): boolean | number | undefined {
        if (!this._partyState) {
            throw new Error('Party state not found');
        }
        return this._partyState.value;
    }

    async setParty(value: boolean | number): Promise<void> {
        if (!this._partyState) {
            throw new Error('Party state not found');
        }
        return this._partyState.setValue(value);
    }
}

export default Thermostat;