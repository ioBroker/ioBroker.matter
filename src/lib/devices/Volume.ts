import GenericDevice, {
    PropertyType,
    DetectedDevice,
    DeviceStateObject,
    StateAccessType,
    ValueType
} from './GenericDevice';

class Volume extends GenericDevice {
    private _setLevelState: DeviceStateObject<number> | undefined;
    private _getLevelState: DeviceStateObject<number> | undefined;
    private _MuteState: DeviceStateObject<boolean> | undefined;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter) {
        super(detectedDevice, adapter);

        this._ready.push(this.addDeviceStates([
            // actual value first, as it will be read first
            { name: 'ACTUAL', valueType: ValueType.NumberPercent, accessType: StateAccessType.Read, type: PropertyType.Level, callback: state => this._getLevelState = state },
            { name: 'SET', valueType: ValueType.NumberPercent, accessType: StateAccessType.ReadWrite, type: PropertyType.Level, callback: state => this._setLevelState = state },
            { name: 'MUTE', valueType: ValueType.Boolean, accessType: StateAccessType.ReadWrite, type: PropertyType.Mute, callback: state => this._MuteState = state },
        ]));
    }

    getLevel(): number | undefined {
        if (!this._getLevelState || !this._setLevelState) {
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

    getMute(): boolean | undefined {
        if (!this._MuteState) {
            throw new Error('Mute state not found');
        }
        return this._MuteState.value;
    }

    async setMute(value: boolean): Promise<void> {
        if (!this._MuteState) {
            throw new Error('Mute state not found');
        }
        return this._MuteState.setValue(value);
    }
}

export default Volume;