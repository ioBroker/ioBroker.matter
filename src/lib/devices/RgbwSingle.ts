import Ct from './Ct';
import {
    PropertyType,
    DetectedDevice,
    DeviceStateObject,
    StateAccessType,
    ValueType,
    DeviceOptions,
} from './GenericDevice';

class RgbwSingle extends Ct {
    protected _rgbw: DeviceStateObject<string> | undefined;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._ready.push(this.addDeviceStates([
            { name: 'RGBW', valueType: ValueType.String, accessType: StateAccessType.ReadWrite, type: PropertyType.Rgbw, callback: state => this._rgbw = state },
        ]));
    }

    getRgbw(): string | undefined {
        if (!this._rgbw) {
            throw new Error('RGBW state not found');
        }
        return this._rgbw.value;
    }

    async setRgbw(value: string): Promise<void> {
        if (!this._rgbw) {
            throw new Error('RGBW state not found');
        }
        return this._rgbw.setValue(value);
    }

}

export default RgbwSingle;