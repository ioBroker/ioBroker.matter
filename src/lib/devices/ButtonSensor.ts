import GenericDevice, {
    DetectedDevice,
    DeviceStateObject,
    PropertyType,
    StateAccessType,
    ValueType
} from './GenericDevice';

class ButtonSensor extends GenericDevice {
    _setPressState: DeviceStateObject<boolean> | undefined;
    _setPressLongState: DeviceStateObject<boolean> | undefined;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter) {
        super(detectedDevice, adapter);

        this._ready.push(this.addDeviceStates([
            { name: 'PRESS', valueType: ValueType.Button, accessType: StateAccessType.Write, type: PropertyType.Press, callback: state => this._setPressState = state },
            { name: 'PRESS_LONG', valueType: ValueType.Button, accessType: StateAccessType.Write, type: PropertyType.PressLong, callback: state => this._setPressLongState = state },
        ]));
    }

    async setPress(): Promise<void> {
        if (!this._setPressState) {
            throw new Error('Press state not found');
        }
        await this._setPressState.setValue(true);
    }

    async setPressLong(): Promise<void> {
        if (!this._setPressLongState) {
            throw new Error('PressLong state not found');
        }
        await this._setPressLongState.setValue(true);
    }
}

export default ButtonSensor;