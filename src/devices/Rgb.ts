import Ct from "./Ct";
import GenericDevice, { DetectedDevice, DeviceStateObject, PropertyType } from "./GenericDevice";

class Rgb extends Ct {
    protected _red: DeviceStateObject<number> | undefined;
    protected _green: DeviceStateObject<number> | undefined;
    protected _blue: DeviceStateObject<number> | undefined;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter) {
        super(detectedDevice, adapter);

        this.addDeviceStates([
            {name: 'RED', type: PropertyType.Red, callback: state => this._red = state},
            {name: 'GREEN', type: PropertyType.Green, callback: state => this._green = state},
            {name: 'BLUE', type: PropertyType.Blue, callback: state => this._blue = state},
        ]);
    }

    getRed(): number | undefined { 
        if (!this._red) {
            throw new Error('Red state not found');
        }
        return this._red.value;
    }

    getGreen(): number | undefined { 
        if (!this._green) {
            throw new Error('Green state not found');
        }
        return this._green.value;
    }

    getBlue(): number | undefined { 
        if (!this._blue) {
            throw new Error('Blue state not found');
        }
        return this._blue.value;
    }
}

export default Rgb;