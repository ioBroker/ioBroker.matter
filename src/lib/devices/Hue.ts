import Ct from './Ct';
import {
    DetectedDevice,
    DeviceOptions,
    DeviceStateObject,
    PropertyType,
    StateAccessType,
    ValueType,
} from './GenericDevice';
class Cie extends Ct {
    protected _hue: DeviceStateObject<number> | undefined;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._ready.push(
            this.addDeviceStates([
                {
                    name: 'HUE',
                    valueType: ValueType.String,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.Hue,
                    callback: state => (this._hue = state),
                },
            ]),
        );
    }

    getHue(): number | undefined {
        if (!this._hue) {
            throw new Error('HUE state not found');
        }
        return this._hue.value;
    }

    async setHue(value: number): Promise<void> {
        if (!this._hue) {
            throw new Error('HUE state not found');
        }
        return this._hue.setValue(value);
    }
}

export default Cie;
