import GenericDevice, {
    DetectedDevice,
    DeviceOptions,
    DeviceStateObject,
    PropertyType,
    StateAccessType,
    ValueType,
} from './GenericDevice';

class Info extends GenericDevice {
    _getValueState: DeviceStateObject<string> | undefined;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._ready.push(
            this.addDeviceStates([
                {
                    name: 'ACTUAL',
                    valueType: ValueType.String,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Value,
                    callback: state => (this._getValueState = state),
                },
            ]),
        );
    }

    getValue(): string | undefined {
        if (!this._getValueState) {
            throw new Error('Level state not found');
        }
        if (this._getValueState.value === undefined || this._getValueState.value === null) {
            return '';
        }
        return this._getValueState.value.toString();
    }
}

export default Info;
