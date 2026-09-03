import { ClimateControlDevice } from './ClimateControlDevice';
import { type DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import { type DetectedDevice, type DeviceOptions, StateAccessType } from './GenericDevice';
import type { CustomStatesRecord } from '../../matter/to-iobroker/custom-states';

export enum ThermostatMode {
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

export enum ThermostatModeNumbers {
    AUTO = 0,
    MANUAL = 1,
    VACATION = 2,
    COOL = 3,
    DRY = 4,
    ECO = 5,
    FAN_ONLY = 6,
    HEAT = 7,
    OFF = 8,
}

export enum ThermostatWorkingMode {
    Off = 'OFF',
    Heat = 'HEAT',
    Cool = 'COOL',
}

export enum ThermostatWorkingModeNumbers {
    OFF = 0,
    HEAT = 1,
    COOL = 2,
}

export class Thermostat extends ClimateControlDevice<ThermostatMode, ThermostatWorkingMode> {
    #getTemperatureState?: DeviceStateObject<number>;
    #powerState?: DeviceStateObject<boolean | number>;
    #getHumidityState?: DeviceStateObject<number>;
    #boostState?: DeviceStateObject<boolean | number>;
    #partyState?: DeviceStateObject<boolean | number>;
    #valveState?: DeviceStateObject<number>;
    #windowState?: DeviceStateObject<boolean>;

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
                    name: 'ACTUAL',
                    valueType: ValueType.Number,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Temperature,
                    unitConversionMap: {
                        '°F': (value, toDefaultUnit) => (toDefaultUnit ? (value - 32) / 1.8 : value * 1.8 + 32),
                    },
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
                    name: 'BOOST',
                    valueType: ValueType.Boolean,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.Boost,
                    callback: state => (this.#boostState = state),
                },
                {
                    name: 'PARTY',
                    valueType: ValueType.Boolean,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.Party,
                    callback: state => (this.#partyState = state),
                },
                {
                    name: 'VALVE',
                    valueType: ValueType.NumberPercent,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Valve,
                    callback: state => (this.#valveState = state),
                },
                {
                    name: 'WINDOW',
                    valueType: ValueType.Boolean,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Window,
                    callback: state => (this.#windowState = state),
                },
            ]),
        );
    }

    getValve(): number | undefined {
        if (!this.#valveState) {
            throw new Error('Valve state not found');
        }
        return this.#valveState.value;
    }

    updateValve(value: number): Promise<void> {
        if (!this.#valveState) {
            throw new Error('Valve state not found');
        }
        return this.#valveState.updateValue(value);
    }

    hasValve(): boolean {
        return !!this.#valveState;
    }

    getWindow(): boolean | undefined {
        if (!this.#windowState) {
            throw new Error('Window state not found');
        }
        return this.#windowState.value;
    }

    updateWindow(value: boolean): Promise<void> {
        if (!this.#windowState) {
            throw new Error('Window state not found');
        }
        return this.#windowState.updateValue(value);
    }

    hasWindow(): boolean {
        return !!this.#windowState;
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

    hasTemperature(): boolean {
        return !!this.#getTemperatureState;
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

    hasPower(): boolean {
        return !!this.#powerState;
    }

    getHumidity(): number | undefined {
        if (!this.#getHumidityState) {
            throw new Error('Humidity state not found');
        }
        return this.#getHumidityState.value;
    }

    updateHumidity(value: number): Promise<void> {
        if (!this.#getHumidityState) {
            throw new Error('Humidity state not found');
        }
        return this.#getHumidityState.updateValue(value);
    }

    hasHumidity(): boolean {
        return !!this.#getHumidityState;
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

    hasBoost(): boolean {
        return !!this.#boostState;
    }

    getParty(): boolean | number | undefined {
        if (!this.#partyState) {
            throw new Error('Party state not found');
        }
        return this.#partyState.value;
    }

    setParty(value: boolean | number): Promise<void> {
        if (!this.#partyState) {
            throw new Error('Party state not found');
        }
        return this.#partyState.setValue(value);
    }

    hasParty(): boolean {
        return !!this.#partyState;
    }
}
