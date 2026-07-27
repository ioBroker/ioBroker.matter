import { IcdManagement } from '@matter/main/clusters';

/**
 * Mode shown by the ICD indicator. An empty value hides the indicator, `pending` marks a running
 * operation whose outcome is not known yet.
 */
export type IcdMode = '' | 'sit' | 'lit' | 'litOffline' | 'pending';

export function deriveIcdMode(params: {
    litCapable: boolean;
    operatingMode: number | undefined;
    available: boolean;
}): IcdMode {
    const { litCapable, operatingMode, available } = params;
    if (!litCapable || operatingMode === undefined) {
        return '';
    }
    if (operatingMode !== IcdManagement.OperatingMode.Lit) {
        return 'sit';
    }
    return available ? 'lit' : 'litOffline';
}

/** Formats a duration in seconds as a short human string, at most two units (e.g. "1 h 5 min"). */
export function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const parts = new Array<string>();
    if (hours > 0) {
        parts.push(`${hours} h`);
        if (minutes > 0) {
            parts.push(`${minutes} min`);
        }
    } else if (minutes > 0) {
        parts.push(`${minutes} min`);
        if (secs > 0) {
            parts.push(`${secs} s`);
        }
    } else {
        parts.push(`${secs} s`);
    }
    return parts.join(' ');
}

export type WakeInstructionKind = 'custom' | 'mapped' | 'manual';

/** `text` is an i18n key for `mapped`/`manual` and the device's own untranslated string for `custom`. */
export interface WakeInstruction {
    kind: WakeInstructionKind;
    text: string;
}

/** UserActiveModeTriggerHint flags per Matter 1.6 §9.17.5.2, in priority order, mapped to short user instructions. */
const WAKE_HINT_FLAGS: [flag: keyof IcdManagement.UserActiveModeTrigger, key: string][] = [
    ['powerCycle', 'ICD wake hint power cycle'],
    ['settingsMenu', 'ICD wake hint settings menu'],
    ['actuateSensor', 'ICD wake hint actuate sensor'],
    ['resetButton', 'ICD wake hint reset button'],
    ['setupButton', 'ICD wake hint setup button'],
    ['appDefinedButton', 'ICD wake hint app defined button'],
];

export function wakeInstruction(
    hint: IcdManagement.UserActiveModeTrigger | undefined,
    instruction: string | undefined,
): WakeInstruction {
    if (hint?.customInstruction === true && instruction !== undefined && instruction !== '') {
        return { kind: 'custom', text: instruction };
    }
    for (const [flag, key] of WAKE_HINT_FLAGS) {
        if (hint?.[flag] === true) {
            return { kind: 'mapped', text: key };
        }
    }
    return { kind: 'manual', text: 'ICD wake hint see manual' };
}

/** Counts check-in registrations that belong to other fabrics; they block leaving Battery Saver Mode. */
export function otherFabricClientCount(
    clients: readonly { fabricIndex: number }[],
    ourFabricIndex: number | undefined,
): number {
    if (ourFabricIndex === undefined) {
        return clients.length;
    }
    return clients.filter(client => client.fabricIndex !== ourFabricIndex).length;
}
