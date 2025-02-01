import { BlindButtons } from './BlindButtons';
import { type DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import { type DetectedDevice, type DeviceOptions, StateAccessType } from './GenericDevice';

export enum BlindDirections {
    None = 'None',
    UpOrOpen = 'Up/Open',
    DownOrClose = 'Down/Close',
    Unknown = 'Unknown',
}

export enum BlindDirectionsNumbers {
    None = 0,
    'Up/Open' = 1,
    'Down/Close' = 2,
    Unknown = 3,
}

export class Blind extends BlindButtons {
    #setLevelState?: DeviceStateObject<number>;
    #getLevelState?: DeviceStateObject<number>;
    #directionEnumState?: DeviceStateObject<BlindDirections>;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._construction.push(
            this.addDeviceStates([
                {
                    name: 'ACTUAL',
                    valueType: ValueType.NumberPercent,
                    accessType: StateAccessType.Read,
                    type: PropertyType.LevelActual,
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
        if (!this.#setLevelState && !this.#getLevelState) {
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

    async updateLevel(value: number): Promise<void> {
        if (!this.#setLevelState && !this.#getLevelState) {
            throw new Error('Level state not found');
        }
        await this.#setLevelState?.updateValue(value);
        await this.#getLevelState?.updateValue(value);
    }

    getLevelActual(): number | undefined {
        if (!this.#getLevelState) {
            throw new Error('Level state not found');
        }
        return this.#getLevelState.value;
    }

    async updateLevelActual(value: number): Promise<void> {
        if (!this.#getLevelState) {
            throw new Error('Level state not found');
        }
        await this.#getLevelState.updateValue(value);
    }

    hasLiftLevel(): boolean {
        return !!this.#setLevelState;
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
