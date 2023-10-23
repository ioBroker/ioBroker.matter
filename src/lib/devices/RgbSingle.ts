import Ct from './Ct';
import {
    PropertyType,
    DetectedDevice,
    DeviceStateObject,
    StateAccessType,
    ValueType,
    DeviceOptions,
} from './GenericDevice';

class RgbSingle extends Ct {
    protected _rgb: DeviceStateObject<string> | undefined;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._ready.push(this.addDeviceStates([
            { name: 'RGB', valueType: ValueType.String, accessType: StateAccessType.ReadWrite, type: PropertyType.Rgb, callback: state => this._rgb = state },
        ]));
    }

    getRgb(): string | undefined {
        if (!this._rgb) {
            throw new Error('RGB state not found');
        }
        return this._rgb.value;
    }

    async setRgb(value: string): Promise<void> {
        if (!this._rgb) {
            throw new Error('RGB state not found');
        }
        return this._rgb.setValue(value);
    }
}

export default RgbSingle;