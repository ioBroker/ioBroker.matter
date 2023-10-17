import GenericDevice, { DetectedDevice, DeviceStateObject, PropertyType } from './GenericDevice';

class Ct extends GenericDevice {
    protected _dimmer: DeviceStateObject<number> | undefined;
    protected _brightness: DeviceStateObject<number> | undefined;
    protected _saturation: DeviceStateObject<number> | undefined;
    protected _temperature: DeviceStateObject<number> | undefined;
    protected _setPower: DeviceStateObject<boolean> | undefined;
    protected _getPower: DeviceStateObject<boolean> | undefined;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter) {
        super(detectedDevice, adapter);

        this.addDeviceStates([
            {name: 'DIMMER', type: PropertyType.Dimmer, callback: state => this._dimmer = state},
            {name: 'BRIGHTNESS', type: PropertyType.Brightness, callback: state => this._brightness = state},
            {name: 'SATURATION', type: PropertyType.Saturation, callback: state => this._saturation = state},
            {name: 'TEMPERATURE', type: PropertyType.Temperature, callback: state => this._temperature = state},
            {name: 'ON', type: PropertyType.Power, callback: state => this._setPower = state},
            {name: 'ON_ACTUAL', type: PropertyType.Power, callback: state => this._getPower = state || this._setPower},
        ]);
    }

    getDimmer(): number | undefined {
        if (!this._dimmer) {
            throw new Error('Dimmer state not found');
        }
        return this._dimmer.value;
    }

    async setDimmer(value: number) {
        if (!this._dimmer) {
            throw new Error('Dimmer state not found');
        }
        return this._dimmer.setValue(value);
    }

    getBrightness(): number | undefined {
        if (!this._brightness) {
            throw new Error('Brightness state not found');
        }
        return this._brightness.value;
    }

    async setBrightness(value: number) {
        if (!this._brightness) {
            throw new Error('Brightness state not found');
        }
        return this._brightness.setValue(value);
    }

    getSaturation(): number | undefined {
        if (!this._saturation) {
            throw new Error('Saturation state not found');
        }
        return this._saturation.value;
    }

    async setSaturation(value: number) {
        if (!this._saturation) {
            throw new Error('Saturation state not found');
        }
        return this._saturation.setValue(value);
    }

    getTemperature(): number | undefined {
        if (!this._temperature) {
            throw new Error('Temperature state not found');
        }
        return this._temperature.value;
    }

    async setTemperature(value: number) {
        if (!this._temperature) {
            throw new Error('Temperature state not found');
        }
        return this._temperature.setValue(value);
    }

    getPower(): boolean | undefined {
        if (!this._getPower) {
            throw new Error('On state not found');
        }
        return this._getPower.value;
    }

    async setPower(value: boolean) {
        if (!this._setPower) {
            throw new Error('On state not found');
        }
        return this._setPower.setValue(value);
    }

}

export default Ct;