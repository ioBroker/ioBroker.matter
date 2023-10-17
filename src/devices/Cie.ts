import Ct from './Ct';
import { DetectedDevice, DeviceStateObject, PropertyType } from './GenericDevice';

class Cie extends Ct {
    protected _cie: DeviceStateObject<string> | undefined;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter) {
        super(detectedDevice, adapter);

        this.addDeviceStates([
            {name: 'CIE', type: PropertyType.Cie, callback: state => this._cie = state},
        ]);
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