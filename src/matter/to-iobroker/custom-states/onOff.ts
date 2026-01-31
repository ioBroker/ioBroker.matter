import { ValueType } from '../../../lib/devices/DeviceStateObject';
import { StateAccessType } from '../../../lib/devices/GenericDevice';
import type { CustomStateDefinition } from './types';

/**
 * Custom state definitions for OnOff cluster.
 */
export const OnOffCustomStates = {
    /**
     * StartUp On/Off - Defines the behavior when the device starts up
     * OnOff cluster, startUpOnOff attribute (optional, writable, nullable)
     *
     * Values:
     * - 0: Off - Set the OnOff attribute to FALSE
     * - 1: On - Set the OnOff attribute to TRUE
     * - 2: Toggle - Toggle the OnOff attribute from its previous value
     * - null: Previous - Restore the previous value of the OnOff attribute
     */
    startUpOnOff: {
        name: 'startUpOnOff',
        valueType: ValueType.Enum,
        accessType: StateAccessType.ReadWrite,
        common: {
            type: 'number',
            role: 'level.setting.mode',
            states: {
                0: 'Off',
                1: 'On',
                2: 'Toggle',
            },
        },
    },
} as const satisfies Record<string, CustomStateDefinition>;

/** Type for OnOff custom states */
export type OnOffCustomStatesType = typeof OnOffCustomStates;
