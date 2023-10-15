import GenericDevice, { DetectedDevice, DeviceStateObject, PropertyType } from "./GenericDevice";

class Motion extends GenericDevice {
    _getValueState: DeviceStateObject<boolean> | undefined;
    _getBrightnessState: DeviceStateObject<number> | undefined;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter) {
        super(detectedDevice, adapter);

        this.addDeviceStates([
            {name: 'ACTUAL', type: PropertyType.Value, callback: state => this._getValueState = state},
            {name: 'SECOND', type: PropertyType.Brightness, callback: state => this._getBrightnessState = state},
        ]);
    }

    getValue(): boolean {
        if (!this._getValueState) {
            throw new Error('Value state not found');
        }
        return this._getValueState.value;
    }

    getBrightness(): number {
        if (!this._getBrightnessState) {
            throw new Error('Brightness state not found');
        }
        return this._getBrightnessState.value;
    }
}

export default Motion;