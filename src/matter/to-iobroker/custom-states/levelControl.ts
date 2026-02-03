import { ValueType } from '../../../lib/devices/DeviceStateObject';
import { StateAccessType } from '../../../lib/devices/GenericDevice';
import type { CustomStateDefinition } from './types';

/**
 * Custom state definitions for LevelControl cluster.
 */
export const LevelControlCustomStates = {
    /**
     * StartUp Current Level - Defines the level when the device starts up
     * LevelControl cluster, startUpCurrentLevel attribute (optional, writable, nullable)
     *
     * Values (in ioBroker as percentage, converted to 0-254 for Matter):
     * - 0: Set level to minimum
     * - 1-100: Set level to this percentage (clamped to device min/max)
     * - null: Restore previous level
     */
    startUpCurrentLevel: {
        name: 'startUpCurrentLevel',
        valueType: ValueType.Number,
        accessType: StateAccessType.ReadWrite,
        common: {
            type: 'number',
            role: 'level.setting.dimmer',
            unit: '%',
            min: 0,
            max: 100,
        },
    },
} as const satisfies Record<string, CustomStateDefinition>;

/** Type for LevelControl custom states */
export type LevelControlCustomStatesType = typeof LevelControlCustomStates;
