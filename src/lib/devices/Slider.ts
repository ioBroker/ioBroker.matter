import GenericDevice, {
    PropertyType,
    DetectedDevice,
    DeviceStateObject,
    StateAccessType,
    ValueType,
    DeviceOptions,
} from './GenericDevice';

class Slider extends GenericDevice {
    private _setLevelState: DeviceStateObject<number> | undefined;
    private _getLevelState: DeviceStateObject<number> | undefined;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._ready.push(this.addDeviceStates([
            // actual value first, as it will be read first
            { name: 'ACTUAL', valueType: ValueType.NumberPercent, accessType: StateAccessType.Read, type: PropertyType.Level, callback: state => this._getLevelState = state },
            { name: 'SET', valueType: ValueType.NumberPercent, accessType: StateAccessType.ReadWrite, type: PropertyType.Level, callback: state => this._setLevelState = state },
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
}

export default Slider;