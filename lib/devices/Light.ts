import GenericDevice, { PropertyType, DetectedDevice, DeviceState } from './GenericDevice';

class Light extends GenericDevice {
    private readonly _getState: DeviceState | undefined;
    private _setState: DeviceState | undefined;
    
    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter) {
        super(detectedDevice, adapter);

        const setState = this.getDeviceState('SET');
        this._getState = this.getDeviceState('ACTUAL') || setState;

        this._properties.push(PropertyType.Level);
    }

    // example:
    getModes() {

    }

    // тип будет перегружен в потомке
    getValue(): any {

    }

    getLevel() {
        return this.getValue();
    }

    setLevel() {

    }
}

export default Light;
