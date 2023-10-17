import GenericDevice, { PropertyType, DetectedDevice, DeviceStateObject } from './GenericDevice';

class Lock extends GenericDevice {
    private _setLevelState: DeviceStateObject<number> | undefined;
    private _getLevelState: DeviceStateObject<number> | undefined;
    private _setOpenState: DeviceStateObject<boolean> | undefined;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter) {
        super(detectedDevice, adapter);

        this.addDeviceStates([
            { name: 'SET', type: PropertyType.Level, callback: state => this._setLevelState = state },
            { name: 'ACTUAL', type: PropertyType.Level, callback: state => this._getLevelState = state || this._setLevelState },
            { name: 'OPEN', type: PropertyType.Open, callback: state => this._setOpenState = state },
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

    async open(): Promise<void> {
        if (!this._setOpenState) {
            throw new Error('Open state not found');
        }
        return this._setOpenState.setValue(true);
    }
}

export default Lock;