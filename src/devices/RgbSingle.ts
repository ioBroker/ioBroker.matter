import Ct from './Ct';
import { DetectedDevice, DeviceStateObject, PropertyType } from './GenericDevice';

class RgbSingle extends Ct {
    protected _rgb: DeviceStateObject<string> | undefined;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter) {
        super(detectedDevice, adapter);

        this.addDeviceStates([
            {name: 'RGB', type: PropertyType.Rgb, callback: state => this._rgb = state},
        ]);
    }

    getRgb(): string | undefined {
        if (!this._rgb) {
            throw new Error('RGB state not found');
        }
        return this._rgb.value;
    }

    async setRgb(value: string) {
        if (!this._rgb) {
            throw new Error('RGB state not found');
        }
        return this._rgb.setValue(value);
    }

}

export default RgbSingle;