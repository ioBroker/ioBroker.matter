import GenericDevice, { DetectedDevice, DeviceStateObject, PropertyType } from "./GenericDevice";

class Image extends GenericDevice {
    _getUrlState: DeviceStateObject<string> | undefined;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter) {
        super(detectedDevice, adapter);

        this.addDeviceStates([
            {name: 'URL', type: PropertyType.Url, callback: state => this._getUrlState = state},
        ]);
    }

    getUrl(): string {
        if (!this._getUrlState) {
            throw new Error('Url state not found');
        }
        return this._getUrlState.value;
    }
}

export default Image;