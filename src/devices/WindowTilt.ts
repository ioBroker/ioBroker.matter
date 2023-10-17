import GenericDevice, { DetectedDevice, DeviceStateObject, PropertyType } from './GenericDevice';

class WindowTilt extends GenericDevice {
    _getValueState: DeviceStateObject<number> | undefined;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter) {
        super(detectedDevice, adapter);

        this.addDeviceStates([
            {name: 'ACTUAL', type: PropertyType.Value, callback: state => this._getValueState = state},
        ]);
    }

    getValue(): number | undefined {
        if (!this._getValueState) {
            throw new Error('Value state not found');
        }
        return this._getValueState.value;
    }
}

export default WindowTilt;