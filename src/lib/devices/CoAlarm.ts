import { type DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import { GenericDevice, type DetectedDevice, type DeviceOptions, StateAccessType } from './GenericDevice';
import { FireAlarmSeverity, FireAlarmSeverityNumbers } from './FireAlarm';

export type CoAlarmSeverity = FireAlarmSeverity;
export const CoAlarmSeverity = FireAlarmSeverity;
export type CoAlarmSeverityNumbers = FireAlarmSeverityNumbers;
export const CoAlarmSeverityNumbers = FireAlarmSeverityNumbers;

export class CoAlarm extends GenericDevice {
    #getValueState?: DeviceStateObject<boolean>;
    #severityState?: DeviceStateObject<CoAlarmSeverity>;
    #mutedState?: DeviceStateObject<boolean>;
    #testState?: DeviceStateObject<boolean>;

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
                    callback: state => (this.#mutedState = state),
                },
                {
                    name: 'TEST',
                    valueType: ValueType.Boolean,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Test,
                    callback: state => (this.#testState = state),
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

    hasSeverity(): boolean {
        return !!this.#severityState;
    }

    getSeverity(): CoAlarmSeverity | undefined {
        if (!this.#severityState) {
            throw new Error('Severity state not found');
        }
        return this.#severityState.value;
    }

    updateSeverity(value: CoAlarmSeverity): Promise<void> {
        if (!this.#severityState) {
            throw new Error('Severity state not found');
        }
        return this.#severityState.updateValue(value);
    }

    getSeverityModes(): CoAlarmSeverity[] {
        if (!this.#severityState) {
            throw new Error('Severity state not found');
        }
        return this.#severityState.getModes();
    }

    updateSeverityModes(modes: { [key: string]: CoAlarmSeverity }): Promise<void> {
        if (!this.#severityState) {
            throw new Error('Severity state not found');
        }
        return this.#severityState.updateModes(modes);
    }

    hasMuted(): boolean {
        return !!this.#mutedState;
    }

    getMuted(): boolean | undefined {
        if (!this.#mutedState) {
            throw new Error('Muted state not found');
        }
        return this.#mutedState.value;
    }

    updateMuted(value: boolean): Promise<void> {
        if (!this.#mutedState) {
            throw new Error('Muted state not found');
        }
        return this.#mutedState.updateValue(value);
    }

    hasTest(): boolean {
        return !!this.#testState;
    }

    getTest(): boolean | undefined {
        if (!this.#testState) {
            throw new Error('Test state not found');
        }
        return this.#testState.value;
    }

    updateTest(value: boolean): Promise<void> {
        if (!this.#testState) {
            throw new Error('Test state not found');
        }
        return this.#testState.updateValue(value);
    }
}
