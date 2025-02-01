import { type DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import { GenericDevice, type DetectedDevice, type DeviceOptions, StateAccessType } from './GenericDevice';
import { BlindDirections, BlindDirectionsNumbers } from './Blind';

export type GateDirections = BlindDirections;
export const GateDirections = BlindDirections;
export type GateDirectionsNumbers = BlindDirectionsNumbers;
export const GateDirectionsNumbers = BlindDirectionsNumbers;

export class Gate extends GenericDevice {
    #setLevelState?: DeviceStateObject<number>;
    #getLevelState?: DeviceStateObject<number>;
    #setStopState?: DeviceStateObject<boolean>;
    #directionEnumState?: DeviceStateObject<GateDirections>;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._construction.push(
            this.addDeviceStates([
                // actual value first, as it will be read first
                {
                    name: 'ACTUAL',
                    valueType: ValueType.NumberPercent,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Level,
                    callback: state => (this.#getLevelState = state),
                },
                {
                    name: 'SET',
                    valueType: ValueType.NumberPercent,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.Level,
                    callback: state => (this.#setLevelState = state),
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

    getLevel(): number | undefined {
        if (!this.#getLevelState && !this.#setLevelState) {
            throw new Error('Level state not found');
        }
        return (this.#getLevelState || this.#setLevelState)?.value;
    }

    setLevel(value: number): Promise<void> {
        if (!this.#setLevelState) {
            throw new Error('Level state not found');
        }
        return this.#setLevelState.setValue(value);
    }

    setStop(): Promise<void> {
        if (!this.#setStopState) {
            throw new Error('Stop state not found');
        }
        return this.#setStopState.setValue(true);
    }

    getDirectionEnum(): BlindDirections | undefined {
        if (!this.#directionEnumState) {
            throw new Error('Direction state not found');
        }
        return this.#directionEnumState.value;
    }

    setDirectionENum(value: BlindDirections): Promise<void> {
        if (!this.#directionEnumState) {
            throw new Error('Direction state not found');
        }
        return this.#directionEnumState.setValue(value);
    }

    updateDirectionEnum(value: BlindDirections): Promise<void> {
        if (!this.#directionEnumState) {
            throw new Error('Direction state not found');
        }
        return this.#directionEnumState.updateValue(value);
    }

    hasDirectionEnum(): boolean {
        return !!this.#directionEnumState;
    }
}
