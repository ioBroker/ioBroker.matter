import GenericDevice, {
    PropertyType,
    DetectedDevice,
    DeviceStateObject,
    StateAccessType,
    ValueType
} from './GenericDevice';

class Gate extends GenericDevice {
    private _setLevelState: DeviceStateObject<number> | undefined;
    private _getLevelState: DeviceStateObject<number> | undefined;
    private _setStopState: DeviceStateObject<boolean> | undefined;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter) {
        super(detectedDevice, adapter);

        this._ready.push(this.addDeviceStates([
            // actual value first, as it will be read first
            { name: 'ACTUAL', valueType: ValueType.NumberPercent, accessType: StateAccessType.Read, type: PropertyType.Level, callback: state => this._getLevelState = state },
            { name: 'SET', valueType: ValueType.NumberPercent, accessType: StateAccessType.ReadWrite, type: PropertyType.Level, callback: state => this._setLevelState = state },
            { name: 'STOP', valueType: ValueType.Button, accessType: StateAccessType.Write, type: PropertyType.Stop, callback: state => this._setStopState = state },
        ]));
    }

    getLevel(): number | undefined {
        if (!this._getLevelState && !this._setLevelState) {
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

    async setStop(): Promise<void> {
        if (!this._setStopState) {
            throw new Error('Stop state not found');
        }
        return this._setStopState.setValue(true);
    }
}

export default Gate;