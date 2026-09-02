import { Ct } from './Ct';
import { type DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import { type DetectedDevice, type DeviceOptions, StateAccessType } from './GenericDevice';

export class RgbwSingle extends Ct {
    #rgbwState?: DeviceStateObject<string>;
    /** A device stuck on an unreadable colour reports it on every change; log it once per value. */
    #lastInvalidValue?: string;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._construction.push(
            this.addDeviceStates([
                {
                    name: 'RGBW',
                    valueType: ValueType.String,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.Rgbw,
                    callback: state => (this.#rgbwState = state),
                },
            ]),
        );
    }

    getRgbw(): string | undefined {
        if (!this.#rgbwState) {
            throw new Error('RGBW state not found');
        }
        return this.#rgbwState.value;
    }

    setRgbw(value: string): Promise<void> {
        if (!this.#rgbwState) {
            throw new Error('RGBW state not found');
        }
        return this.#rgbwState.setValue(value);
    }

    updateRgbw(value: string): Promise<void> {
        if (!this.#rgbwState) {
            throw new Error('RGBW state not found');
        }
        return this.#rgbwState.updateValue(value);
    }

    isRgbw(): boolean {
        return !!this.#rgbwState;
    }

    getRgbwComponents(): { red: number; green: number; blue: number; white: number } {
        if (!this.#rgbwState) {
            throw new Error('RGBW state not found');
        }
        const rgbw = this.#rgbwState.value ?? '#00000000';
        const match = rgbw.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
        if (!match) {
            // Anything can write this state, and a value that is not a hex colour is not exceptional;
            // refusing the whole device over one unreadable colour would drop it out of the bridge.
            if (this.#lastInvalidValue !== rgbw) {
                this.#lastInvalidValue = rgbw;
                this.adapter.log.info(`${this.uuid} Invalid RGBW value: ${rgbw}`);
            }
            return { red: 0, green: 0, blue: 0, white: 0 };
        }
        return {
            red: parseInt(match[1], 16),
            green: parseInt(match[2], 16),
            blue: parseInt(match[3], 16),
            white: parseInt(match[4], 16),
        };
    }

    getRgbComponents(): { red: number; green: number; blue: number } {
        const { red, green, blue } = this.getRgbwComponents();
        return {
            red,
            green,
            blue,
        };
    }
}
