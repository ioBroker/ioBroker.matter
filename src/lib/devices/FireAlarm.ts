import GenericDevice, {
    DetectedDevice,
    DeviceStateObject,
    PropertyType,
    StateAccessType,
    ValueType
} from './GenericDevice';

class FireAlarm extends GenericDevice {
    _getValueState: DeviceStateObject<boolean> | undefined;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter) {
        super(detectedDevice, adapter);

        this._ready.push(this.addDeviceStates([
            { name: 'ACTUAL', valueType: ValueType.Boolean, accessType: StateAccessType.Read, type: PropertyType.Value, callback: state => this._getValueState = state },
        ]));
    }

    getValue(): boolean | undefined {
        if (!this._getValueState) {
            throw new Error('Value state not found');
        }
        return this._getValueState.value;
    }
}

export default FireAlarm;