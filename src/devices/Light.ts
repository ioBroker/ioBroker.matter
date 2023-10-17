import GenericDevice, { DetectedDevice, DeviceStateObject, PropertyType } from './GenericDevice';

class Light extends GenericDevice {
    private _setPowerState: DeviceStateObject<boolean> | undefined;
    private _getPowerState: DeviceStateObject<boolean> | undefined;

    private _getElectricPowerState: DeviceStateObject<number> | undefined;
    private _getCurrentState: DeviceStateObject<number> | undefined;
    private _getVoltageState: DeviceStateObject<number> | undefined;
    private _getConsumptionState: DeviceStateObject<number> | undefined;
    private _getFrequencyState: DeviceStateObject<number> | undefined;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter) {
        super(detectedDevice, adapter);

        this._ready.push(this.addDeviceStates([
            { name: 'SET', type: PropertyType.Power, callback: state => this._setPowerState = state },
            { name: 'ON_ACTUAL', type: PropertyType.Power, callback: state => this._getPowerState = state || this._setPowerState },

            { name: 'ELECTRIC_POWER', type: PropertyType.ElectricPower, callback: state => this._getElectricPowerState = state },
            { name: 'CURRENT', type: PropertyType.Current, callback: state => this._getCurrentState = state },
            { name: 'VOLTAGE', type: PropertyType.Voltage, callback: state => this._getVoltageState = state },
            { name: 'CONSUMPTION', type: PropertyType.Consumption, callback: state => this._getConsumptionState = state },
            { name: 'FREQUENCY', type: PropertyType.Frequency, callback: state => this._getFrequencyState = state },
        ]));
    }

    getPower(): boolean | undefined {
        if (!this._getPowerState) {
            throw new Error('Level state not found');
        }
        return this._getPowerState.value;
    }

    async setPower(value: boolean): Promise<void> {
        if (!this._setPowerState) {
            throw new Error('Level state not found');
        }
        await this._adapter.setStateAsync(this._setPowerState.state.id, value);
    }

    getElectricPower(): number | undefined {
        if (!this._getElectricPowerState) {
            throw new Error('Power state not found');
        }
        return this._getElectricPowerState.value;
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

export default Light;