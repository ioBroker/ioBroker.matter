import GenericDevice, {
    DetectedDevice,
    DeviceStateObject,
    PropertyType,
    StateAccessType,
    ValueType
} from './GenericDevice';

class Motion extends GenericDevice {
    _getValueState: DeviceStateObject<boolean> | undefined;
    _getBrightnessState: DeviceStateObject<number> | undefined;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter) {
        super(detectedDevice, adapter);

        this._ready.push(this.addDeviceStates([
            { name: 'ACTUAL', valueType: ValueType.Boolean, accessType: StateAccessType.Read, type: PropertyType.Value, callback: state => this._getValueState = state },
            { name: 'SECOND', valueType: ValueType.NumberPercent, accessType: StateAccessType.Read, type: PropertyType.Brightness, callback: state => this._getBrightnessState = state },
        ]));
    }

    getValue(): boolean | undefined {
        if (!this._getValueState) {
            throw new Error('Value state not found');
        }
        return this._getValueState.value;
    }

    getBrightness(): number | undefined {
        if (!this._getBrightnessState) {
            throw new Error('Brightness state not found');
        }
        return this._getBrightnessState.value;
    }
}

export default Motion;