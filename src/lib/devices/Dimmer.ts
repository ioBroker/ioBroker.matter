import GenericDevice, {
    PropertyType,
    DetectedDevice,
    DeviceStateObject,
    StateAccessType,
    ValueType
} from './GenericDevice';

class Dimmer extends GenericDevice {
    private _setLevelState: DeviceStateObject<number> | undefined;
    private _getLevelState: DeviceStateObject<number> | undefined;
    private _setPowerState: DeviceStateObject<boolean> | undefined;
    private _getPowerState: DeviceStateObject<boolean> | undefined;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter) {
        super(detectedDevice, adapter);

        this._ready.push(this.addDeviceStates([
            // actual value first, as it will be read first
            { name: 'ACTUAL', valueType: ValueType.NumberPercent, accessType: StateAccessType.Read, type: PropertyType.Level, callback: state => this._getLevelState = state },
            { name: 'SET', valueType: ValueType.NumberPercent, accessType: StateAccessType.ReadWrite, type: PropertyType.Level, callback: state => this._setLevelState = state },
            // actual value first, as it will be read first
            { name: 'ON_ACTUAL', valueType: ValueType.Boolean, accessType: StateAccessType.Read, type: PropertyType.Power, callback: state => this._getPowerState = state },
            { name: 'ON_SET', valueType: ValueType.Boolean, accessType: StateAccessType.ReadWrite, type: PropertyType.Power, callback: state => this._setPowerState = state },
        ]));
    }

    getLevel(): number | undefined {
        if (!this._setLevelState && !this._getLevelState) {
            throw new Error('Level state not found');
        }
        return (this._getLevelState || this._setLevelState)?.value;
    }

    async setLevel(value: number): Promise<void> {
        if (!this._setLevelState) {
            throw new Error('Level state not found');
        }
        return this._setLevelState.setValue(value);
    }

    getPower(): boolean | undefined {
        if (!this._getPowerState && !this._setPowerState) {
            throw new Error('Power state not found');
        }
        return (this._getPowerState || this._setPowerState)?.value;
    }

    async setPower(value: boolean): Promise<void> {
        if (!this._setPowerState) {
            throw new Error('Power state not found');
        }
        return this._setPowerState.setValue(value);
    }
}

export default Dimmer;