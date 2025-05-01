import { type DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import { GenericDevice, type DetectedDevice, type DeviceOptions, StateAccessType } from './GenericDevice';

export enum LockMovementDirections {
    None = 'None',
    Unlock = 'Unlock',
    Lock = 'Lock',
    Open = 'Open',
    Unknown = 'Unknown',
}

export enum LockMovementDirectionsNumbers {
    None = 0,
    Unlock = 1,
    Lock = 2,
    Open = 3,
    Unknown = 4,
}

export class Lock extends GenericDevice {
    #setLockState?: DeviceStateObject<boolean>;
    #getLockState?: DeviceStateObject<boolean>;
    #setOpenState?: DeviceStateObject<boolean>;
    #directionEnumState?: DeviceStateObject<LockMovementDirections>;
    #doorState?: DeviceStateObject<boolean>;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._construction.push(
            this.addDeviceStates([
                // actual value first, as it will be read first
                {
                    name: 'ACTUAL',
                    valueType: ValueType.Boolean,
                    accessType: StateAccessType.Read,
                    type: PropertyType.LockStateActual,
                    callback: state => (this.#getLockState = state),
                },
                {
                    name: 'SET',
                    valueType: ValueType.Boolean,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.LockState,
                    callback: state => (this.#setLockState = state),
                },
                {
                    name: 'OPEN',
                    valueType: ValueType.Button,
                    accessType: StateAccessType.Write,
                    type: PropertyType.Open,
                    callback: state => (this.#setOpenState = state),
                },
                {
                    name: 'DOOR_STATE',
                    valueType: ValueType.Boolean,
                    accessType: StateAccessType.Read,
                    type: PropertyType.DoorState,
                    callback: state => (this.#doorState = state),
                },
            ]),
        );
    }

    getLockState(): boolean | undefined {
        if (!this.#getLockState && !this.#setLockState) {
            throw new Error('Level state not found');
        }
        return (this.#getLockState || this.#setLockState)?.value;
    }

    setLockState(value: boolean): Promise<void> {
        if (!this.#setLockState) {
            throw new Error('Level state not found');
        }
        return this.#setLockState.setValue(value);
    }

    async updateLockState(value: boolean): Promise<void> {
        if (!this.#getLockState && !this.#setLockState) {
            throw new Error('Level state not found');
        }
        await this.#getLockState?.updateValue(value);
        await this.#setLockState?.updateValue(value);
    }

    getLockStateActual(): boolean | undefined {
        if (!this.#getLockState) {
            throw new Error('Level state not found');
        }
        return this.#getLockState.value;
    }

    async updateLockStateActual(value: boolean): Promise<void> {
        if (!this.#getLockState) {
            throw new Error('Level state not found');
        }
        await this.#getLockState.updateValue(value);
        await this.#setLockState?.updateValue(value);
    }

    setOpen(): Promise<void> {
        if (!this.#setOpenState) {
            throw new Error('Open state not found');
        }
        return this.#setOpenState.setValue(true);
    }

    hasOpen(): boolean {
        return !!this.#setOpenState;
    }

    getDirectionEnum(): LockMovementDirections | undefined {
        if (!this.#directionEnumState) {
            throw new Error('Direction state not found');
        }
        return this.#directionEnumState.value;
    }

    setDirectionENum(value: LockMovementDirections): Promise<void> {
        if (!this.#directionEnumState) {
            throw new Error('Direction state not found');
        }
        return this.#directionEnumState.setValue(value);
    }

    updateDirectionEnum(value: LockMovementDirections): Promise<void> {
        if (!this.#directionEnumState) {
            throw new Error('Direction state not found');
        }
        return this.#directionEnumState.updateValue(value);
    }

    hasDirectionEnum(): boolean {
        return !!this.#directionEnumState;
    }

    getDoorState(): boolean | undefined {
        if (!this.#doorState) {
            throw new Error('Door state not found');
        }
        return this.#doorState.value;
    }

    async updateDoorState(value: boolean): Promise<void> {
        if (!this.#doorState) {
            throw new Error('Door state not found');
        }
        await this.#doorState.updateValue(value);
    }

    setDoorState(value: boolean): Promise<void> {
        if (!this.#doorState) {
            throw new Error('Door state not found');
        }
        return this.#doorState.setValue(value);
    }

    hasDoorState(): boolean {
        return !!this.#doorState;
    }
}
