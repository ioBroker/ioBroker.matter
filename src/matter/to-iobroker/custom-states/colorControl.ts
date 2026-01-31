import { ValueType } from '../../../lib/devices/DeviceStateObject';
import { StateAccessType } from '../../../lib/devices/GenericDevice';
import type { CustomStateDefinition } from './types';

/**
 * Custom state definitions for the ColorControl cluster.
 */
export const ColorControlCustomStates = {
    /**
     * StartUp Color Temperature - Defines the color temperature when the device starts up
     * ColorControl cluster, startUpColorTemperatureMireds attribute (optional, writable, nullable)
     *
     * Values (in ioBroker as Kelvin, converted to Mireds for Matter):
     * - Kelvin value within device's min/max range
     * - null: Restore previous color temperature
     */
    startUpColorTemperatureMireds: {
        name: 'startUpColorTemperatureMireds',
        valueType: ValueType.Number,
        accessType: StateAccessType.ReadWrite,
        common: {
            type: 'number',
            role: 'level.setting.color.temperature',
            unit: 'K',
            // min/max will be set dynamically based on device capabilities
        },
    },
} as const satisfies Record<string, CustomStateDefinition>;

/** Type for ColorControl custom states */
export type ColorControlCustomStatesType = typeof ColorControlCustomStates;
