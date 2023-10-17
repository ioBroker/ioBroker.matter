import Ct from './Ct';
import { DetectedDevice, DeviceStateObject, PropertyType } from './GenericDevice';

class RgbwSingle extends Ct {
    protected _rgbw: DeviceStateObject<string> | undefined;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter) {
        super(detectedDevice, adapter);

        this.addDeviceStates([
            {name: 'RGBW', type: PropertyType.Rgbw, callback: state => this._rgbw = state},
        ]);
    }

    getRgbs(): string | undefined {
        if (!this._rgbw) {
            throw new Error('RGBW state not found');
        }
        return this._rgbw.value;
    }

    async setRgbw(value: string) {
        if (!this._rgbw) {
            throw new Error('RGBW state not found');
        }
        return this._rgbw.setValue(value);
    }

}

export default RgbwSingle;