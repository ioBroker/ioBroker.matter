import Ct from './Ct';
import { DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import { DetectedDevice, DeviceOptions, StateAccessType } from './GenericDevice';

class Rgb extends Ct {
    #red?: DeviceStateObject<number>;
    #green?: DeviceStateObject<number>;
    #blue?: DeviceStateObject<number>;
    #white?: DeviceStateObject<number>;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._construction.push(
            this.addDeviceStates([
                {
                    name: 'RED',
                    valueType: ValueType.NumberPercent,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.Red,
                    callback: state => (this.#red = state),
                },
                {
                    name: 'GREEN',
                    valueType: ValueType.NumberPercent,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.Green,
                    callback: state => (this.#green = state),
                },
                {
                    name: 'BLUE',
                    valueType: ValueType.NumberPercent,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.Blue,
                    callback: state => (this.#blue = state),
                },
                {
                    name: 'WHITE',
                    valueType: ValueType.NumberPercent,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.White,
                    callback: state => (this.#white = state),
                },
            ]),
        );
    }

    getRed(): number | undefined {
        if (!this.#red) {
            throw new Error('Red state not found');
        }
        return this.#red.value;
    }

    async setRed(value: number): Promise<void> {
        if (!this.#red) {
            throw new Error('Red state not found');
        }
        await this.#red.setValue(value);
    }

    getGreen(): number | undefined {
        if (!this.#green) {
            throw new Error('Green state not found');
        }
        return this.#green.value;
    }

    async setGreen(value: number): Promise<void> {
        if (!this.#green) {
            throw new Error('Red state not found');
        }
        await this.#green.setValue(value);
    }

    getBlue(): number | undefined {
        if (!this.#blue) {
            throw new Error('Blue state not found');
        }
        return this.#blue.value;
    }

    async setBlue(value: number): Promise<void> {
        if (!this.#blue) {
            throw new Error('Red state not found');
        }
        await this.#blue.setValue(value);
    }

    getWhite(): number | undefined {
        if (!this.#white) {
            throw new Error('Blue state not found');
        }
        return this.#white.value;
    }

    async setWhite(value: number): Promise<void> {
        if (!this.#white) {
            throw new Error('Red state not found');
        }
        await this.#white.setValue(value);
    }
}

export default Rgb;
