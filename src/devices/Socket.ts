import GenericDevice, { DetectedDevice, DeviceStateObject, PropertyType } from './GenericDevice';

class Socket extends GenericDevice {
    private _setLevelState: DeviceStateObject<number> | undefined;
    private _getLevelState: DeviceStateObject<number> | undefined;

    private _getPowerState: DeviceStateObject<number> | undefined;
    private _getCurrentState: DeviceStateObject<number> | undefined;
    private _getVoltageState: DeviceStateObject<number> | undefined;
    private _getConsumptionState: DeviceStateObject<number> | undefined;
    private _getFrequencyState: DeviceStateObject<number> | undefined;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter) {
        super(detectedDevice, adapter);

        this.addDeviceStates([
            {name: 'SET', type: PropertyType.Level, callback: state => this._setLevelState = state},
            {name: 'ACTUAL', type: PropertyType.Level, callback: state => this._getLevelState = state || this._setLevelState},
            {name: 'ELECTRIC_POWER', type: PropertyType.Power, callback: state => this._getPowerState = state},
            {name: 'CURRENT', type: PropertyType.Current, callback: state => this._getCurrentState = state},
            {name: 'VOLTAGE', type: PropertyType.Voltage, callback: state => this._getVoltageState = state},
            {name: 'CONSUMPTION', type: PropertyType.Consumption, callback: state => this._getConsumptionState = state},
            {name: 'FREQUENCY', type: PropertyType.Frequency, callback: state => this._getFrequencyState = state},
        ]);
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

    getPower(): number | undefined {
        if (!this._getPowerState) {
            throw new Error('Power state not found');
        }
        return this._getPowerState.value;
    }

    getCurrent(): number | undefined {
        if (!this._getCurrentState) {
            throw new Error('Current state not found');
        }
        return this._getCurrentState.value;
    }

    getVoltage(): number | undefined {
        if (!this._getVoltageState) {
            throw new Error('Voltage state not found');
        }
        return this._getVoltageState.value;
    }

    getConsumption(): number | undefined {
        if (!this._getConsumptionState) {
            throw new Error('Consumption state not found');
        }
        return this._getConsumptionState.value;
    }

    getFrequency(): number | undefined {
        if (!this._getFrequencyState) {
            throw new Error('Frequency state not found');
        }
        return this._getFrequencyState.value;
    }
}

export default Socket;