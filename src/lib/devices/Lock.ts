import { type DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import { GenericDevice, type DetectedDevice, type DeviceOptions, StateAccessType } from './GenericDevice';
import type { CustomStatesRecord } from '../../matter/to-iobroker/custom-states';

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
    #lockDirectionState?: DeviceStateObject<LockMovementDirections>;
    #doorState?: DeviceStateObject<boolean>;

    constructor(
        detectedDevice: DetectedDevice,
        adapter: ioBroker.Adapter,
        options?: DeviceOptions,
        customStateDefinitions?: CustomStatesRecord,
    ) {
        super(detectedDevice, adapter, options, customStateDefinitions);

        // Newer type-detector versions expose the enum movement direction as DIRECTION_ENUM to
        // avoid clashing with the boolean DIRECTION indicator; older versions still name it DIRECTION.
        const directionEnumName = detectedDevice.states.some(state => state.name === 'DIRECTION_ENUM')
            ? 'DIRECTION_ENUM'
            : 'DIRECTION';

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
                {
                    name: directionEnumName,
                    valueType: ValueType.Enum,
                    accessType: StateAccessType.Read,
                    type: PropertyType.LockDirection,
                    callback: state => (this.#lockDirectionState = state),
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

    getLockDirection(): LockMovementDirections | undefined {
        if (!this.#lockDirectionState) {
            throw new Error('Direction state not found');
        }
        return this.#lockDirectionState.value;
    }

    setLockDirection(value: LockMovementDirections): Promise<void> {
        if (!this.#lockDirectionState) {
            throw new Error('Direction state not found');
        }
        return this.#lockDirectionState.setValue(value);
    }

    updateLockDirection(value: LockMovementDirections): Promise<void> {
        if (!this.#lockDirectionState) {
            throw new Error('Direction state not found');
        }
        return this.#lockDirectionState.updateValue(value);
    }

    hasLockDirection(): boolean {
        return !!this.#lockDirectionState;
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
