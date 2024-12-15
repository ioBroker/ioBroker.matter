import { type DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import ElectricityDataDevice from './ElectricityDataDevice';
import { type DetectedDevice, type DeviceOptions, StateAccessType } from './GenericDevice';

class Ct extends ElectricityDataDevice {
    #dimmer?: DeviceStateObject<number>;
    #brightness?: DeviceStateObject<number>;
    #saturation?: DeviceStateObject<number>;
    #temperature?: DeviceStateObject<number>;
    #setPower?: DeviceStateObject<boolean>;
    #getPower?: DeviceStateObject<boolean>;
    #transitionTime?: DeviceStateObject<number>;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._construction.push(
            this.addDeviceStates([
                {
                    name: 'DIMMER',
                    valueType: ValueType.NumberPercent,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.Dimmer,
                    callback: state => (this.#dimmer = state),
                },
                {
                    name: 'BRIGHTNESS',
                    valueType: ValueType.NumberPercent,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.Brightness,
                    callback: state => (this.#brightness = state),
                },
                {
                    name: 'SATURATION',
                    valueType: ValueType.NumberPercent,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.Saturation,
                    callback: state => (this.#saturation = state),
                },
                {
                    name: 'TEMPERATURE',
                    valueType: ValueType.NumberMinMax,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.Temperature,
                    callback: state => (this.#temperature = state),
                    unitConversionMap: {
                        mireds: value => Math.round(1_000_000 / value),
                    },
                },
                // actual value first, as it will be read first
                {
                    name: 'ON_ACTUAL',
                    valueType: ValueType.Boolean,
                    accessType: StateAccessType.Read,
                    type: PropertyType.PowerActual,
                    callback: state => (this.#getPower = state),
                },
                {
                    name: 'ON',
                    valueType: ValueType.Boolean,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.Power,
                    callback: state => (this.#setPower = state),
                },
                {
                    name: 'TRANSITION_TIME',
                    valueType: ValueType.Number,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.TransitionTime,
                    callback: state => (this.#transitionTime = state),
                },
            ]),
        );
    }

    getDimmer(): number | undefined {
        if (!this.#dimmer) {
            if (!this.#brightness) {
                throw new Error('Dimmer state not found');
            }
            return this.#brightness.value;
        }
        return this.#dimmer.value;
    }

    async updateDimmer(value: number): Promise<void> {
        if (!this.#dimmer) {
            if (!this.#brightness) {
                throw new Error('Dimmer state not found');
            }
            return this.#brightness.updateValue(value);
        }
        await this.#dimmer.updateValue(value);
    }

    async setDimmer(value: number): Promise<void> {
        if (!this.#dimmer) {
            if (!this.#brightness) {
                throw new Error('Dimmer state not found');
            }
            return this.#brightness.setValue(value);
        }
        return this.#dimmer.setValue(value);
    }

    hasDimmer(): boolean {
        return this.propertyNames.includes(PropertyType.Dimmer) || this.propertyNames.includes(PropertyType.Brightness);
    }

    getBrightness(): number | undefined {
        if (!this.#brightness) {
            throw new Error('Brightness state not found');
        }
        return this.#brightness.value;
    }

    async updateBrightness(value: number): Promise<void> {
        if (!this.#brightness) {
            throw new Error('Brightness state not found');
        }
        await this.#brightness.updateValue(value);
    }

    async setBrightness(value: number): Promise<void> {
        if (!this.#brightness) {
            throw new Error('Brightness state not found');
        }
        return this.#brightness.setValue(value);
    }

    getSaturation(): number | undefined {
        if (!this.#saturation) {
            throw new Error('Saturation state not found');
        }
        return this.#saturation.value;
    }

    async setSaturation(value: number): Promise<void> {
        if (!this.#saturation) {
            throw new Error('Saturation state not found');
        }
        return this.#saturation.setValue(value);
    }

    getTemperature(): number | undefined {
        if (!this.#temperature) {
            throw new Error('Temperature state not found');
        }
        return this.#temperature.value;
    }

    getTemperatureMinMax(): { min: number; max: number } | null {
        if (!this.#temperature) {
            throw new Error('Temperature state not found');
        }
        return this.#temperature.getMinMax();
    }

    async updateTemperature(value: number): Promise<void> {
        if (!this.#temperature) {
            throw new Error('Temperature state not found');
        }
        await this.#temperature.updateValue(value);
    }

    async setTemperature(value: number): Promise<void> {
        if (!this.#temperature) {
            throw new Error('Temperature state not found');
        }
        return this.#temperature.setValue(value);
    }

    getPower(): boolean | undefined {
        if (!this.#getPower && !this.#setPower) {
            throw new Error('On state not found');
        }
        return (this.#getPower || this.#setPower)?.value;
    }

    async setPower(value: boolean): Promise<void> {
        if (!this.#setPower) {
            throw new Error('On state not found');
        }
        return this.#setPower.setValue(value);
    }

    async updatePower(value: boolean): Promise<void> {
        if (!this.#getPower && !this.#setPower) {
            throw new Error('Power state not found');
        }
        if (this.#getPower) {
            await this.#getPower.updateValue(value);
        }
        if (this.#setPower) {
            await this.#setPower.updateValue(value);
        }
    }

    hasPower(): boolean {
        return this.propertyNames.includes(PropertyType.Power);
    }

    getPowerActual(): boolean | undefined {
        if (!this.#getPower) {
            throw new Error('PowerActual state not found');
        }
        return this.#getPower.value;
    }

    async updatePowerActual(value: boolean): Promise<void> {
        if (!this.#getPower) {
            throw new Error('PowerActual state not found');
        }
        await this.#getPower.updateValue(value);
    }

    hasTransitionTime(): boolean {
        return this.propertyNames.includes(PropertyType.TransitionTime);
    }

    getTransitionTime(): number | undefined {
        if (!this.#transitionTime) {
            throw new Error('TransitionTime state not found');
        }
        return this.#transitionTime.value;
    }

    setTransitionTime(value: number): Promise<void> {
        if (!this.#transitionTime) {
            throw new Error('TransitionTime state not found');
        }
        return this.#transitionTime.setValue(value);
    }

    updateTransitionTime(value: number): Promise<void> {
        if (!this.#transitionTime) {
            throw new Error('TransitionTime state not found');
        }
        return this.#transitionTime.updateValue(value);
    }
}

export default Ct;
