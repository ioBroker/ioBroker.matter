import GenericDevice, { DetectedDevice, DeviceStateObject, PropertyType } from './GenericDevice';

class Button extends GenericDevice {

    _setLevelState: DeviceStateObject<boolean> | undefined;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter) {
        super(detectedDevice, adapter);

        this.addDeviceStates([
            {name: 'SET', type: PropertyType.Level, callback: state => this._setLevelState = state},
        ]);
    }

    async setLevel(value: boolean) {
        if (!this._setLevelState) {
            throw new Error('Level state not found');
        }
        return this._setLevelState.setValue(value);
    }

}

export default Button;