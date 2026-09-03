import { type DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import { GenericDevice, type DetectedDevice, type DeviceOptions, StateAccessType } from './GenericDevice';

/** Shared by `FireAlarm` and `CoAlarm`, which are one device in Matter and differ only in what they sense. */
export enum FireAlarmSeverity {
    Normal = 'NORMAL',
    Warning = 'WARNING',
    Critical = 'CRITICAL',
}

export enum FireAlarmSeverityNumbers {
    NORMAL = 0,
    WARNING = 1,
    CRITICAL = 2,
}

export class FireAlarm extends GenericDevice {
    #getValueState?: DeviceStateObject<boolean>;
    #getCoState?: DeviceStateObject<boolean>;
    #severityState?: DeviceStateObject<FireAlarmSeverity>;
    #getMutedState?: DeviceStateObject<boolean>;
    #getTestState?: DeviceStateObject<boolean>;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._construction.push(
            this.addDeviceStates([
                {
                    name: 'ACTUAL',
                    valueType: ValueType.Boolean,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Value,
                    callback: state => (this.#getValueState = state),
                },
                {
                    name: 'CO',
                    valueType: ValueType.Boolean,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Co,
                    callback: state => (this.#getCoState = state),
                },
                {
                    name: 'SEVERITY',
                    valueType: ValueType.Enum,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Severity,
                    callback: state => (this.#severityState = state),
                },
                {
                    name: 'MUTED',
                    valueType: ValueType.Boolean,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Muted,
                    callback: state => (this.#getMutedState = state),
                },
                {
                    name: 'TEST',
                    valueType: ValueType.Boolean,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Test,
                    callback: state => (this.#getTestState = state),
                },
            ]),
        );
    }

    getValue(): boolean | undefined {
        if (!this.#getValueState) {
            throw new Error('Value state not found');
        }
        return this.#getValueState.value;
    }

    updateValue(value: boolean): Promise<void> {
        if (!this.#getValueState) {
            throw new Error('Value state not found');
        }
        return this.#getValueState.updateValue(value);
    }

    getCo(): boolean | undefined {
        if (!this.#getCoState) {
            throw new Error('Co state not found');
        }
        return this.#getCoState.value;
    }

    updateCo(value: boolean): Promise<void> {
        if (!this.#getCoState) {
            throw new Error('Co state not found');
        }
        return this.#getCoState.updateValue(value);
    }

    hasCo(): boolean {
        return !!this.#getCoState;
    }

    getSeverity(): FireAlarmSeverity | undefined {
        if (!this.#severityState) {
            throw new Error('Severity state not found');
        }
        return this.#severityState.value;
    }

    getSeverityModes(): FireAlarmSeverity[] {
        if (!this.#severityState) {
            throw new Error('Severity state not found');
        }
        return this.#severityState.getModes();
    }

    updateSeverity(value: FireAlarmSeverity): Promise<void> {
        if (!this.#severityState) {
            throw new Error('Severity state not found');
        }
        return this.#severityState.updateValue(value);
    }

    hasSeverity(): boolean {
        return !!this.#severityState;
    }

    getMuted(): boolean | undefined {
        if (!this.#getMutedState) {
            throw new Error('Muted state not found');
        }
        return this.#getMutedState.value;
    }

    updateMuted(value: boolean): Promise<void> {
        if (!this.#getMutedState) {
            throw new Error('Muted state not found');
        }
        return this.#getMutedState.updateValue(value);
    }

    hasMuted(): boolean {
        return !!this.#getMutedState;
    }

    getTest(): boolean | undefined {
        if (!this.#getTestState) {
            throw new Error('Test state not found');
        }
        return this.#getTestState.value;
    }

    updateTest(value: boolean): Promise<void> {
        if (!this.#getTestState) {
            throw new Error('Test state not found');
        }
        return this.#getTestState.updateValue(value);
    }

    hasTest(): boolean {
        return !!this.#getTestState;
    }
}
