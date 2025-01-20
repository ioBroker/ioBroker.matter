import { Ct } from './Ct';
import { type DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import { type DetectedDevice, type DeviceOptions, StateAccessType } from './GenericDevice';

export class RgbSingle extends Ct {
    #rgbState?: DeviceStateObject<string>;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._construction.push(
            this.addDeviceStates([
                {
                    name: 'RGB',
                    valueType: ValueType.String,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.Rgb,
                    callback: state => (this.#rgbState = state),
                },
            ]),
        );
    }

    getRgb(): string | undefined {
        if (!this.#rgbState) {
            throw new Error('RGB state not found');
        }
        return this.#rgbState.value;
    }

    setRgb(value: string): Promise<void> {
        if (!this.#rgbState) {
            throw new Error('RGB state not found');
        }
        return this.#rgbState.setValue(value);
    }

    updateRgb(value: string): Promise<void> {
        if (!this.#rgbState) {
            throw new Error('RGB state not found');
        }
        return this.#rgbState.updateValue(value);
    }

    isRgbw(): boolean {
        return false;
    }

    getRgbComponents(): { red: number; green: number; blue: number } {
        if (!this.#rgbState) {
            throw new Error('RGB state not found');
        }
        const rgb = this.#rgbState.value ?? '#000000';
        const match = rgb.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
        if (!match) {
            throw new Error(`Invalid RGB value: ${rgb}`);
        }
        return {
            red: parseInt(match[1], 16),
            green: parseInt(match[2], 16),
            blue: parseInt(match[3], 16),
        };
    }

    getRgbwComponents(): { red: number; green: number; blue: number; white: number } {
        throw new Error('No RGBW device');
    }
}
