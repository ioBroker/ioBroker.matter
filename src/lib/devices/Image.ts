import GenericDevice, {
    DetectedDevice,
    DeviceStateObject,
    PropertyType,
    StateAccessType,
    ValueType
} from './GenericDevice';

class Image extends GenericDevice {
    _getUrlState: DeviceStateObject<string> | undefined;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter) {
        super(detectedDevice, adapter);

        this._ready.push(this.addDeviceStates([
            { name: 'URL', valueType: ValueType.String, accessType: StateAccessType.Read, type: PropertyType.Url, callback: state => this._getUrlState = state },
        ]));
    }

    getUrl(): string | undefined {
        if (!this._getUrlState) {
            throw new Error('Url state not found');
        }
        return this._getUrlState.value;
    }
}

export default Image;