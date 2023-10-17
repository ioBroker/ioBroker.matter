import GenericDevice, { DetectedDevice, DeviceStateObject, PropertyType } from "./GenericDevice";

class ButtonSensor extends GenericDevice {

    _getPressState: DeviceStateObject<boolean> | undefined;
    _getPressLongState: DeviceStateObject<boolean> | undefined;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter) {
        super(detectedDevice, adapter);

        this.addDeviceStates([
            {name: 'PRESS', type: PropertyType.Press, callback: state => this._getPressState = state},
            {name: 'PRESS_LONG', type: PropertyType.PressLong, callback: state => this._getPressLongState = state},
        ]);
    }

    getPress(): boolean | undefined {
        if (!this._getPressState) {
            throw new Error('Press state not found');
        }
        return this._getPressState.value;
    }

    getPressLong(): boolean | undefined {
        if (!this._getPressLongState) {
            throw new Error('PressLong state not found');
        }
        return this._getPressLongState.value;
    }

}

export default ButtonSensor