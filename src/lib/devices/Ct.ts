import GenericDevice, {
    DetectedDevice,
    DeviceStateObject,
    PropertyType,
    StateAccessType,
    ValueType,
    DeviceOptions,
} from './GenericDevice';

class Ct extends GenericDevice {
    protected _dimmer: DeviceStateObject<number> | undefined;
    protected _brightness: DeviceStateObject<number> | undefined;
    protected _saturation: DeviceStateObject<number> | undefined;
    protected _temperature: DeviceStateObject<number> | undefined;
    protected _setPower: DeviceStateObject<boolean> | undefined;
    protected _getPower: DeviceStateObject<boolean> | undefined;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._ready.push(this.addDeviceStates([
            { name: 'DIMMER', valueType: ValueType.NumberPercent, accessType: StateAccessType.ReadWrite, type: PropertyType.Dimmer, callback: state => this._dimmer = state },
            { name: 'BRIGHTNESS', valueType: ValueType.NumberPercent, accessType: StateAccessType.ReadWrite, type: PropertyType.Brightness, callback: state => this._brightness = state },
            { name: 'SATURATION', valueType: ValueType.NumberPercent, accessType: StateAccessType.ReadWrite, type: PropertyType.Saturation, callback: state => this._saturation = state },
            { name: 'TEMPERATURE', valueType: ValueType.NumberMinMax, accessType: StateAccessType.ReadWrite, type: PropertyType.Temperature, callback: state => this._temperature = state },
            // actual value first, as it will be read first
            { name: 'ON_ACTUAL', valueType: ValueType.Boolean, accessType: StateAccessType.Read, type: PropertyType.Power, callback: state => this._getPower = state },
            { name: 'ON', valueType: ValueType.Boolean, accessType: StateAccessType.ReadWrite, type: PropertyType.Power, callback: state => this._setPower = state },
        ]));
    }

    getDimmer(): number | undefined {
        if (!this._dimmer) {
            throw new Error('Dimmer state not found');
        }
        return this._dimmer.value;
    }

    async setDimmer(value: number): Promise<void> {
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

    async setBrightness(value: number): Promise<void> {
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

    async setSaturation(value: number): Promise<void> {
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

    async setTemperature(value: number): Promise<void> {
        if (!this._temperature) {
            throw new Error('Temperature state not found');
        }
        return this._temperature.setValue(value);
    }

    getPower(): boolean | undefined {
        if (!this._getPower && !this._setPower) {
            throw new Error('On state not found');
        }
        return (this._getPower || this._setPower)?.value;
    }

    async setPower(value: boolean): Promise<void> {
        if (!this._setPower) {
            throw new Error('On state not found');
        }
        return this._setPower.setValue(value);
    }
}

export default Ct;