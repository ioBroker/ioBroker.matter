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

/** UserActiveModeTriggerBitmap per Matter 1.6 §9.17.5.2, mapped to short user instructions. */
const WAKE_HINTS: [mask: number, key: string][] = [
    [1 << 0, 'ICD wake hint power cycle'],
    [1 << 1, 'ICD wake hint settings menu'],
    [1 << 4, 'ICD wake hint actuate sensor'],
    [1 << 8, 'ICD wake hint reset button'],
    [1 << 12, 'ICD wake hint setup button'],
    [1 << 16, 'ICD wake hint app defined button'],
];
const CUSTOM_INSTRUCTION = 1 << 2;

export function wakeInstruction(hint: number | undefined, instruction: string | undefined): WakeInstruction {
    if (hint !== undefined && (hint & CUSTOM_INSTRUCTION) !== 0 && instruction !== undefined && instruction !== '') {
        return { kind: 'custom', text: instruction };
    }
    if (hint !== undefined) {
        for (const [mask, key] of WAKE_HINTS) {
            if ((hint & mask) !== 0) {
                return { kind: 'mapped', text: key };
            }
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
