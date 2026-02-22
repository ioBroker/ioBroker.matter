import type { ValueType } from '../../../lib/devices/DeviceStateObject';
import type { StateAccessType } from '../../../lib/devices/GenericDevice';

/**
 * Supported common properties for custom state definitions.
 * These map to ioBroker.StateCommon properties.
 */
export interface CustomStateCommon {
    /** The ioBroker common type (boolean, number, string). If not set, derived from valueType. */
    type?: ioBroker.CommonType;
    /** The role of the state (e.g., 'level', 'switch', 'indicator') */
    role?: string;
    /** Unit of the value (e.g., 's', '%', '°C') */
    unit?: string;
    /** Minimum value (for numbers) */
    min?: number;
    /** Maximum value (for numbers) */
    max?: number;
    /** Step size for value changes (for numbers) */
    step?: number;
    /** States mapping for enum values (e.g., { '0': 'Off', '1': 'On' }) */
    states?: Record<string, string>;
    /** Optional description/label for the state */
    desc?: string;
}

/**
 * Definition of a custom state that can be added to a device.
 * The customPropertyName is provided as the Record key, not in this interface.
 */
export interface CustomStateDefinition {
    /** ioBroker state name (used as suffix for state ID) */
    name: string;
    /** Value type for the state */
    valueType: ValueType;
    /** Access type (Read, Write, ReadWrite) */
    accessType: StateAccessType;
    /**
     * ioBroker common properties for the state.
     * Supported: type, role, unit, min, max, step, states, desc.
     * - type: If not set, derived from valueType (Number→'number', Boolean→'boolean', String→'string')
     * - role: Defaults to 'state' if not specified
     * - read/write: Derived from accessType, do not specify here
     */
    common?: CustomStateCommon;
}

/**
 * Record type for custom state definitions.
 * Keys are the custom property names (unique identifiers).
 */
export type CustomStatesRecord = Record<string, CustomStateDefinition>;

/**
 * Empty custom states record for classes that don't define custom states.
 * Using this type ensures enableCustomStateForAttribute cannot be called.
 */
export type EmptyCustomStates = Record<string, never>;

/**
 * Helper type to extract custom property names from a custom states record.
 */
export type CustomStateNames<C extends CustomStatesRecord> = keyof C & string;
