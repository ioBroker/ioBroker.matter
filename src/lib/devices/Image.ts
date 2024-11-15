import { type DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import GenericDevice, { type DetectedDevice, type DeviceOptions, StateAccessType } from './GenericDevice';

class Image extends GenericDevice {
    #getUrlState?: DeviceStateObject<string>;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._construction.push(
            this.addDeviceStates([
                {
                    name: 'URL',
                    valueType: ValueType.String,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Url,
                    callback: state => (this.#getUrlState = state),
                },
            ]),
        );
    }

    getUrl(): string | undefined {
        if (!this.#getUrlState) {
            throw new Error('Url state not found');
        }
        return this.#getUrlState.value;
    }
}

export default Image;
