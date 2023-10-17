import GenericDevice, { DetectedDevice, DeviceStateObject, PropertyType } from './GenericDevice';

class Info extends GenericDevice {
    _getValueState: DeviceStateObject<boolean> | undefined;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter) {
        super(detectedDevice, adapter);

        this.addDeviceStates([
            { name: 'ACTUAL', type: PropertyType.Value, callback: state => this._getValueState = state },
        ]);
    }

    getValue(): boolean | undefined {
        if (!this._getValueState) {
            throw new Error('Level state not found');
        }
        return this._getValueState.value;
    }
}

export default Info;