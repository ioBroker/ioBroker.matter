import Ct from './Ct';
import {
    PropertyType,
    DetectedDevice,
    DeviceStateObject,
    StateAccessType,
    ValueType,
    DeviceOptions,
} from './GenericDevice';

class Rgb extends Ct {
    protected _red: DeviceStateObject<number> | undefined;
    protected _green: DeviceStateObject<number> | undefined;
    protected _blue: DeviceStateObject<number> | undefined;
    protected _white: DeviceStateObject<number> | undefined;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._ready.push(this.addDeviceStates([
            { name: 'RED', valueType: ValueType.NumberPercent, accessType: StateAccessType.ReadWrite, type: PropertyType.Red, callback: state => this._red = state },
            { name: 'GREEN', valueType: ValueType.NumberPercent, accessType: StateAccessType.ReadWrite, type: PropertyType.Green, callback: state => this._green = state },
            { name: 'BLUE', valueType: ValueType.NumberPercent, accessType: StateAccessType.ReadWrite, type: PropertyType.Blue, callback: state => this._blue = state },
            { name: 'WHITE', valueType: ValueType.NumberPercent, accessType: StateAccessType.ReadWrite, type: PropertyType.White, callback: state => this._white = state },
        ]));
    }

    getRed(): number | undefined {
        if (!this._red) {
            throw new Error('Red state not found');
        }
        return this._red.value;
    }

    async setRed(value: number): Promise<void> {
        if (!this._red) {
            throw new Error('Red state not found');
        }
        await this._red.setValue(value);
    }

    getGreen(): number | undefined {
        if (!this._green) {
            throw new Error('Green state not found');
        }
        return this._green.value;
    }

    async setGreen(value: number): Promise<void> {
        if (!this._green) {
            throw new Error('Red state not found');
        }
        await this._green.setValue(value);
    }

    getBlue(): number | undefined {
        if (!this._blue) {
            throw new Error('Blue state not found');
        }
        return this._blue.value;
    }

    async setBlue(value: number): Promise<void> {
        if (!this._blue) {
            throw new Error('Red state not found');
        }
        await this._blue.setValue(value);
    }

    getWhite(): number | undefined {
        if (!this._white) {
            throw new Error('Blue state not found');
        }
        return this._white.value;
    }

    async setWhite(value: number): Promise<void> {
        if (!this._white) {
            throw new Error('Red state not found');
        }
        await this._white.setValue(value);
    }
}

export default Rgb;