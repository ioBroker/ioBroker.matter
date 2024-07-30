import Ct from './Ct';
import { DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import { DetectedDevice, DeviceOptions, StateAccessType } from './GenericDevice';

class Cie extends Ct {
    #cie?: DeviceStateObject<string>;

    // CIE has form lab(29.2345% 39.3825 20.0664);
    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._construction.push(
            this.addDeviceStates([
                {
                    name: 'CIE',
                    valueType: ValueType.String,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.Cie,
                    callback: state => (this.#cie = state),
                },
            ]),
        );
    }

    getCie(): string | undefined {
        if (!this.#cie) {
            throw new Error('CIE state not found');
        }
        return this.#cie.value;
    }

    async setCie(value: string): Promise<void> {
        if (!this.#cie) {
            throw new Error('CIE state not found');
        }
        return this.#cie.setValue(value);
    }
}

export default Cie;
