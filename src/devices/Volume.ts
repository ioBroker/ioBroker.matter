import GenericDevice, { PropertyType, DetectedDevice, DeviceStateObject } from './GenericDevice';

class Volume extends GenericDevice {
    private _setLevelState: DeviceStateObject<number> | undefined;
    private _getLevelState: DeviceStateObject<number> | undefined;
    private _MuteState: DeviceStateObject<boolean> | undefined;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter) {
        super(detectedDevice, adapter);

        this.addDeviceStates([
            { name: 'SET', type: PropertyType.Level, callback: state => this._setLevelState = state },
            { name: 'ACTUAL', type: PropertyType.Level, callback: state => this._getLevelState = state || this._setLevelState },
            { name: 'MUTE', type: PropertyType.Mute, callback: state => this._MuteState = state },
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