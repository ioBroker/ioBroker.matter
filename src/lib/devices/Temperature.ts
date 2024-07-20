import GenericDevice, {
    DetectedDevice,
    DeviceOptions,
    DeviceStateObject,
    PropertyType,
    StateAccessType,
    ValueType,
} from './GenericDevice';

class Temperature extends GenericDevice {
    _getValueState: DeviceStateObject<boolean> | undefined;
    _getHumidityState: DeviceStateObject<number> | undefined;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._ready.push(
            this.addDeviceStates([
                {
                    name: 'ACTUAL',
                    valueType: ValueType.Number,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Value,
                    callback: state => (this._getValueState = state),
                },
                {
                    name: 'SECOND',
                    valueType: ValueType.NumberPercent,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Humidity,
                    callback: state => (this._getHumidityState = state),
                },
            ]),
        );
    }

    getValue(): boolean | undefined {
        if (!this._getValueState) {
            throw new Error('Value state not found');
        }
        return this._getValueState.value;
    }

    getHumidity(): number | undefined {
        if (!this._getHumidityState) {
            throw new Error('Humidity state not found');
        }
        return this._getHumidityState.value;
    }
}

export default Temperature;
