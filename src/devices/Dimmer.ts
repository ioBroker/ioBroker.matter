import GenericDevice, { PropertyType, DetectedDevice, DeviceStateObject } from './GenericDevice';

class Dimmer extends GenericDevice {
    private _setLevelState: DeviceStateObject<number> | undefined;
    private _getLevelState: DeviceStateObject<number> | undefined;
    private _setPowerState: DeviceStateObject<boolean> | undefined;
    private _getPowerState: DeviceStateObject<boolean> | undefined;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter) {
        super(detectedDevice, adapter);

        this.addDeviceStates([
            { name: 'SET', type: PropertyType.Level, callback: state => this._setLevelState = state },
            { name: 'ACTUAL', type: PropertyType.Level, callback: state => this._getLevelState = state || this._setLevelState },
            { name: 'ON_SET', type: PropertyType.Power, callback: state => this._setPowerState = state },
            { name: 'ON_ACTUAL', type: PropertyType.Power, callback: state => this._getPowerState = state || this._setPowerState },
        ]);
    }

    getLevel(): number | undefined {
        if (!this._getLevelState) {
            throw new Error('Level state not found');
        }
        return this._getLevelState.value;
    }

    async setLevel(value: number): Promise<void> {
        if (!this._setLevelState) {
            throw new Error('Level state not found');
        }
        return this._setLevelState.setValue(value);
    }

    getPower(): boolean | undefined {
        if (!this._getPowerState) {
            throw new Error('Power state not found');
        }
        return this._getPowerState.value;
    }

    async setPower(value: boolean): Promise<void> {
        if (!this._setPowerState) {
            throw new Error('Power state not found');
        }
        return this._setPowerState.setValue(value);
    }
}

export default Dimmer;