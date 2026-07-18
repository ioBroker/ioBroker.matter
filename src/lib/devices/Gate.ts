import { type DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import { GenericDevice, type DetectedDevice, type DeviceOptions, StateAccessType } from './GenericDevice';
import { BlindDirections, BlindDirectionsNumbers } from './Blind';

export type GateDirections = BlindDirections;
export const GateDirections = BlindDirections;
export type GateDirectionsNumbers = BlindDirectionsNumbers;
export const GateDirectionsNumbers = BlindDirectionsNumbers;

export class Gate extends GenericDevice {
    #getLevelState?: DeviceStateObject<number>;
    #powerState?: DeviceStateObject<boolean>;
    #setStopState?: DeviceStateObject<boolean>;
    #directionEnumState?: DeviceStateObject<GateDirections>;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._construction.push(
            this.addDeviceStates([
                {
                    name: 'ACTUAL',
                    valueType: ValueType.NumberPercent,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Level,
                    callback: state => (this.#getLevelState = state),
                },
                {
                    name: 'SET',
                    valueType: ValueType.Boolean,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.Power,
                    callback: state => (this.#powerState = state),
                },
                {
                    name: 'STOP',
                    valueType: ValueType.Button,
                    accessType: StateAccessType.Write,
                    type: PropertyType.Stop,
                    callback: state => (this.#setStopState = state),
                },
                {
                    name: 'DIRECTION',
                    valueType: ValueType.Enum,
                    accessType: StateAccessType.Read,
                    type: PropertyType.DirectionEnum,
                    callback: state => (this.#directionEnumState = state),
                },
            ]),
        );
    }

    getPower(): boolean | undefined {
        if (!this.#powerState) {
            throw new Error('Power state not found');
        }
        return this.#powerState.value;
    }

    setPower(value: boolean): Promise<void> {
        if (!this.#powerState) {
            throw new Error('Power state not found');
        }
        return this.#powerState.setValue(value);
    }

    updatePower(value: boolean): Promise<void> {
        if (!this.#powerState) {
            throw new Error('Power state not found');
        }
        return this.#powerState.updateValue(value);
    }

    getLevel(): number | undefined {
        if (!this.#getLevelState) {
            throw new Error('Level state not found');
        }
        return this.#getLevelState.value;
    }

    updateLevel(value: number): Promise<void> {
        if (!this.#getLevelState) {
            throw new Error('Level state not found');
        }
        return this.#getLevelState.updateValue(value);
    }

    hasLevel(): boolean {
        return !!this.#getLevelState;
    }

    setStop(): Promise<void> {
        if (!this.#setStopState) {
            throw new Error('Stop state not found');
        }
        return this.#setStopState.setValue(true);
    }

    getDirectionEnum(): GateDirections | undefined {
        if (!this.#directionEnumState) {
            throw new Error('Direction state not found');
        }
        return this.#directionEnumState.value;
    }

    setDirectionEnum(value: GateDirections): Promise<void> {
        if (!this.#directionEnumState) {
            throw new Error('Direction state not found');
        }
        return this.#directionEnumState.setValue(value);
    }

    updateDirectionEnum(value: GateDirections): Promise<void> {
        if (!this.#directionEnumState) {
            throw new Error('Direction state not found');
        }
        return this.#directionEnumState.updateValue(value);
    }

    hasDirectionEnum(): boolean {
        return !!this.#directionEnumState;
    }
}
