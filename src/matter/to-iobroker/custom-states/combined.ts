import type { CustomStateDefinition } from './types';
import { OnOffCustomStates } from './onOff';
import { LevelControlCustomStates } from './levelControl';
import { ColorControlCustomStates } from './colorControl';

/**
 * Combined custom states for Dimmable devices (OnOff + LevelControl).
 */
export const DimmableCustomStates = {
    ...OnOffCustomStates,
    ...LevelControlCustomStates,
} as const satisfies Record<string, CustomStateDefinition>;

/** Type for Dimmable custom states */
export type DimmableCustomStatesType = typeof DimmableCustomStates;

/**
 * Combined custom states for Color Light devices (OnOff + LevelControl + ColorControl).
 */
export const ColorLightCustomStates = {
    ...OnOffCustomStates,
    ...LevelControlCustomStates,
    ...ColorControlCustomStates,
} as const satisfies Record<string, CustomStateDefinition>;

/** Type for Color Light custom states */
export type ColorLightCustomStatesType = typeof ColorLightCustomStates;
