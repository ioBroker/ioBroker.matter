import GenericDevice, {PropertyType, DetectedDevice, DeviceStateObject} from './GenericDevice';

class LevelSlider extends GenericDevice {
    private _setLevelState: DeviceStateObject<number> | undefined;
    private _getLevelState: DeviceStateObject<number> | undefined;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter) {
        super(detectedDevice, adapter);

        this.addDeviceStates([
            {name: 'SET', type: PropertyType.Level, callback: state => this._setLevelState = state},
            {name: 'ACTUAL', type: PropertyType.Level, callback: state => this._getLevelState = state || this._setLevelState},
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
        return this._setLevelState.setValue(value);
    }
}

export default LevelSlider;