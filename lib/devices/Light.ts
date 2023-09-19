import GenericDevice, { PropertyType, DetectedDevice } from './GenericDevice';

class Light extends GenericDevice {
    constructor(detectedDevice: DetectedDevice) {
        super(detectedDevice);

        const setState = detectedDevice.states.find(state => state.name === 'SET');
        this._getState = detectedDevice.states.find(state => state.name === 'ACTUAL') || setState;

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
