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
    protected _cie: DeviceStateObject<string> | undefined;

    // CIE has form lab(29.2345% 39.3825 20.0664);
    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._ready.push(
            this.addDeviceStates([
                {
                    name: 'CIE',
                    valueType: ValueType.String,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.Cie,
                    callback: state => (this._cie = state),
                },
            ]),
        );
    }

    getCie(): string | undefined {
        if (!this._cie) {
            throw new Error('CIE state not found');
        }
        return this._cie.value;
    }

    async setCie(value: string): Promise<void> {
        if (!this._cie) {
            throw new Error('CIE state not found');
        }
        return this._cie.setValue(value);
    }
}

export default Cie;
