import GenericDevice, {
    DetectedDevice,
    DeviceStateObject,
    PropertyType,
    StateAccessType,
    ValueType,
    DeviceOptions,
} from './GenericDevice';

class Button extends GenericDevice {
    _setPressState: DeviceStateObject<boolean> | undefined;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._ready.push(this.addDeviceStates([
            { name: 'SET', valueType: ValueType.Button, accessType: StateAccessType.Write, type: PropertyType.Press, callback: state => this._setPressState = state },
        ]));
    }

    async setPress(): Promise<void> {
        if (!this._setPressState) {
            throw new Error('Press state not found');
        }
        return this._setPressState.setValue(true);
    }
}

export default Button;