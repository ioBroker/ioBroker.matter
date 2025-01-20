import { Ct } from './Ct';
import { type DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import { type DetectedDevice, type DeviceOptions, StateAccessType } from './GenericDevice';

export class Cie extends Ct {
    #cieState?: DeviceStateObject<string>;

    // CIE has form lab(29.2345% 39.3825 20.0664);
    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._construction.push(
            this.addDeviceStates([
                {
                    name: 'CIE',
                    valueType: ValueType.String,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.Cie,
                    callback: state => (this.#cieState = state),
                },
            ]),
        );
    }

    getCie(): string | undefined {
        if (!this.#cieState) {
            throw new Error('CIE state not found');
        }
        return this.#cieState.value;
    }

    parseCieValue(value: string | undefined): { x: number; y: number } | undefined {
        if (value?.startsWith('[') && value?.endsWith(']')) {
            try {
                // JUst get it out of the string for performance reasons
                const xy = value
                    .replaceAll(/\s/g, '') // Remove whitespaces to get the pure json data
                    .substring(1, value.length - 1)
                    .split(',');
                return { x: parseFloat(xy[0]), y: parseFloat(xy[1]) };
            } catch {
                // Do nothing
            }
        }
        this.adapter.log.info(`${this.uuid} Invalid CIE value: ${value}`);
    }

    getXy(): { x: number; y: number } | undefined {
        if (!this.#cieState) {
            throw new Error('CIE state not found');
        }
        return this.parseCieValue(this.#cieState.value);
    }

    setCie(value: string): Promise<void> {
        if (!this.#cieState) {
            throw new Error('CIE state not found');
        }
        return this.#cieState.setValue(value);
    }

    setXy(x: number, y: number): Promise<void> {
        if (!this.#cieState) {
            throw new Error('CIE state not found');
        }
        return this.#cieState.setValue(`[${x},${y}]`);
    }

    setX(x: number): Promise<void> {
        if (!this.#cieState) {
            throw new Error('CIE state not found');
        }
        return this.#cieState.setValue(`[${x},${this.getXy()?.y}]`);
    }

    setY(y: number): Promise<void> {
        if (!this.#cieState) {
            throw new Error('CIE state not found');
        }
        return this.#cieState.setValue(`[${this.getXy()?.x},${y}]`);
    }

    updateCie(value: string): Promise<void> {
        if (!this.#cieState) {
            throw new Error('CIE state not found');
        }
        return this.#cieState.updateValue(value);
    }

    updateXy(x: number, y: number): Promise<void> {
        if (!this.#cieState) {
            throw new Error('CIE state not found');
        }
        return this.#cieState.updateValue(`[${x},${y}]`);
    }

    updateX(x: number): Promise<void> {
        if (!this.#cieState) {
            throw new Error('CIE state not found');
        }
        return this.#cieState.updateValue(`[${x},${this.getXy()?.y}]`);
    }

    updateY(y: number): Promise<void> {
        if (!this.#cieState) {
            throw new Error('CIE state not found');
        }
        return this.#cieState.updateValue(`[${this.getXy()?.x},${y}]`);
    }
}
