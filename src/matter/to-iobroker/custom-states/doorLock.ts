import { ValueType } from '../../../lib/devices/DeviceStateObject';
import { StateAccessType } from '../../../lib/devices/GenericDevice';
import type { CustomStateDefinition } from './types';

/**
 * Custom state definitions for DoorLock devices.
 * These states provide access to DoorLock cluster attributes
 * that are not part of the standard ioBroker type-detector patterns.
 */
export const DoorLockCustomStates = {
    /**
     * Auto Relock Time - The time in seconds before the lock automatically relocks
     * DoorLock cluster, autoRelockTime attribute (optional, writable)
     */
    autoRelockTime: {
        name: 'autoRelockTime',
        valueType: ValueType.Number,
        accessType: StateAccessType.ReadWrite,
        common: {
            role: 'level.setting.interval',
            unit: 's',
            min: 0,
        },
    },
} as const satisfies Record<string, CustomStateDefinition>;

/** Type for DoorLock custom states */
export type DoorLockCustomStatesType = typeof DoorLockCustomStates;
