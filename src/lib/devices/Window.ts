import GenericDevice, {
    PropertyType,
    DetectedDevice,
    DeviceStateObject,
    StateAccessType,
    ValueType,
    DeviceOptions,
} from './GenericDevice';

class Window extends GenericDevice {
    _getValueState: DeviceStateObject<boolean> | undefined;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

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

export default Window;