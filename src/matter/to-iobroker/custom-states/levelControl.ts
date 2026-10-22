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
     * Values (in ioBroker as percentage; Level Control 1.6.6.15):
     * - 0: Matter value 0, the device sets its minimum level
     * - 1-100: Matter level 1-254 (the Lighting scale)
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
