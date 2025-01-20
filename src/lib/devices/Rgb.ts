import { Ct } from './Ct';
import { type DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import { type DetectedDevice, type DeviceOptions, StateAccessType } from './GenericDevice';

export class Rgb extends Ct {
    #redState?: DeviceStateObject<number>;
    #greenState?: DeviceStateObject<number>;
    #blueState?: DeviceStateObject<number>;
    #whiteState?: DeviceStateObject<number>;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._construction.push(
            this.addDeviceStates([
                {
                    name: 'RED',
                    valueType: ValueType.NumberPercent,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.Red,
                    callback: state => (this.#redState = state),
                },
                {
                    name: 'GREEN',
                    valueType: ValueType.NumberPercent,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.Green,
                    callback: state => (this.#greenState = state),
                },
                {
                    name: 'BLUE',
                    valueType: ValueType.NumberPercent,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.Blue,
                    callback: state => (this.#blueState = state),
                },
                {
                    name: 'WHITE',
                    valueType: ValueType.NumberPercent,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.White,
                    callback: state => (this.#whiteState = state),
                },
            ]),
        );
    }

    getRed(): number | undefined {
        if (!this.#redState) {
            throw new Error('Red state not found');
        }
        return this.#redState.value;
    }

    setRed(value: number): Promise<void> {
        if (!this.#redState) {
            throw new Error('Red state not found');
        }
        return this.#redState.setValue(value);
    }

    updateRed(value: number): Promise<void> {
        if (!this.#redState) {
            throw new Error('Red state not found');
        }
        return this.#redState.updateValue(value);
    }

    getGreen(): number | undefined {
        if (!this.#greenState) {
            throw new Error('Green state not found');
        }
        return this.#greenState.value;
    }

    setGreen(value: number): Promise<void> {
        if (!this.#greenState) {
            throw new Error('Red state not found');
        }
        return this.#greenState.setValue(value);
    }

    updateGreen(value: number): Promise<void> {
        if (!this.#greenState) {
            throw new Error('Green state not found');
        }
        return this.#greenState.updateValue(value);
    }

    getBlue(): number | undefined {
        if (!this.#blueState) {
            throw new Error('Blue state not found');
        }
        return this.#blueState.value;
    }

    setBlue(value: number): Promise<void> {
        if (!this.#blueState) {
            throw new Error('Red state not found');
        }
        return this.#blueState.setValue(value);
    }

    updateBlue(value: number): Promise<void> {
        if (!this.#blueState) {
            throw new Error('Blue state not found');
        }
        return this.#blueState.updateValue(value);
    }

    getWhite(): number | undefined {
        if (!this.#whiteState) {
            throw new Error('Blue state not found');
        }
        return this.#whiteState.value;
    }

    setWhite(value: number): Promise<void> {
        if (!this.#whiteState) {
            throw new Error('Red state not found');
        }
        return this.#whiteState.setValue(value);
    }

    updateWhite(value: number): Promise<void> {
        if (!this.#whiteState) {
            throw new Error('White state not found');
        }
        return this.#whiteState.updateValue(value);
    }

    getRgb(): string | undefined {
        if (!this.#redState || !this.#greenState || !this.#blueState) {
            throw new Error('RGB states not found');
        }
        const red = Math.round(((this.#redState.value ?? 0) / 100) * 255);
        const green = Math.round(((this.#greenState.value ?? 0) / 100) * 255);
        const blue = Math.round(((this.#blueState.value ?? 0) / 100) * 255);

        return `#${red.toString(16).padStart(2, '0')}${green.toString(16).padStart(2, '0')}${blue.toString(16).padStart(2, '0')}`;
    }

    async setRgb(value: string): Promise<void> {
        if (!this.#redState || !this.#greenState || !this.#blueState) {
            throw new Error('RGB state not found');
        }
        const match = value.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
        if (!match) {
            throw new Error('Invalid RGB value');
        }
        await this.#redState.setValue(Math.round((parseInt(match[1], 16) / 255) * 100));
        await this.#greenState.setValue(Math.round((parseInt(match[2], 16) / 255) * 100));
        await this.#blueState.setValue(Math.round((parseInt(match[3], 16) / 255) * 100));
    }

    async updateRgb(value: string): Promise<void> {
        if (!this.#redState || !this.#greenState || !this.#blueState) {
            throw new Error('RGB state not found');
        }
        const match = value.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
        if (!match) {
            throw new Error('Invalid RGB value');
        }
        await this.#redState.updateValue(Math.round((parseInt(match[1], 16) / 255) * 100));
        await this.#greenState.updateValue(Math.round((parseInt(match[2], 16) / 255) * 100));
        await this.#blueState.updateValue(Math.round((parseInt(match[3], 16) / 255) * 100));
    }

    getRgbw(): string | undefined {
        if (!this.#redState || !this.#greenState || !this.#blueState || !this.#whiteState) {
            throw new Error('RGBW states not found');
        }
        const red = Math.round(((this.#redState.value ?? 0) / 100) * 255);
        const green = Math.round(((this.#greenState.value ?? 0) / 100) * 255);
        const blue = Math.round(((this.#blueState.value ?? 0) / 100) * 255);
        const white = Math.round(((this.#whiteState.value ?? 0) / 100) * 255);

        return `#${red.toString(16).padStart(2, '0')}${green.toString(16).padStart(2, '0')}${blue.toString(16).padStart(2, '0')}${white.toString(16).padStart(2, '0')}`;
    }

    async setRgbw(value: string): Promise<void> {
        if (!this.#redState || !this.#greenState || !this.#blueState || !this.#whiteState) {
            throw new Error('RGBW state not found');
        }
        const match = value.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
        if (!match) {
            throw new Error('Invalid RGBW value');
        }
        await this.#redState.setValue(Math.round((parseInt(match[1], 16) / 255) * 100));
        await this.#greenState.setValue(Math.round((parseInt(match[2], 16) / 255) * 100));
        await this.#blueState.setValue(Math.round((parseInt(match[3], 16) / 255) * 100));
        await this.#whiteState.setValue(Math.round((parseInt(match[4], 16) / 255) * 100));
    }

    async updateRgbw(value: string): Promise<void> {
        if (!this.#redState || !this.#greenState || !this.#blueState || !this.#whiteState) {
            throw new Error('RGBW state not found');
        }
        const match = value.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
        if (!match) {
            throw new Error('Invalid RGBW value');
        }
        await this.#redState.updateValue(Math.round((parseInt(match[1], 16) / 255) * 100));
        await this.#greenState.updateValue(Math.round((parseInt(match[2], 16) / 255) * 100));
        await this.#blueState.updateValue(Math.round((parseInt(match[3], 16) / 255) * 100));
        await this.#whiteState.updateValue(Math.round((parseInt(match[4], 16) / 255) * 100));
    }

    isRgbw(): boolean {
        return !!(this.#redState && this.#redState && this.#blueState && this.#whiteState);
    }

    getRgbComponents(): { red: number; green: number; blue: number } {
        if (!this.#redState || !this.#greenState || !this.#blueState) {
            throw new Error('RGBW states not found');
        }
        return {
            red: Math.round(((this.#redState.value ?? 0) / 100) * 255),
            green: Math.round(((this.#greenState.value ?? 0) / 100) * 255),
            blue: Math.round(((this.#blueState.value ?? 0) / 100) * 255),
        };
    }

    getRgbwComponents(): { red: number; green: number; blue: number; white: number } {
        if (!this.#redState || !this.#greenState || !this.#blueState || !this.#whiteState) {
            throw new Error('RGBW states not found');
        }
        return {
            red: Math.round(((this.#redState.value ?? 0) / 100) * 255),
            green: Math.round(((this.#greenState.value ?? 0) / 100) * 255),
            blue: Math.round(((this.#blueState.value ?? 0) / 100) * 255),
            white: Math.round(((this.#whiteState.value ?? 0) / 100) * 255),
        };
    }
}
