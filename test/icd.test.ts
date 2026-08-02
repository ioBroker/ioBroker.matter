import { deepStrictEqual, strictEqual } from 'node:assert';
import {
    deriveIcdMode,
    formatDuration,
    icdWaitingLabel,
    icdWakeInstructionText,
    otherFabricClientCount,
    wakeInstruction,
    type Translate,
} from '../src/matter/icdUtils';

/** Identity translator: returns the key unchanged, so assertions can check exact wiring without an i18n table. */
const t: Translate = key => key;

describe('deriveIcdMode', () => {
    it('returns an empty mode for a node that is not LIT-capable', () => {
        strictEqual(deriveIcdMode({ litCapable: false, operatingMode: 1, available: true }), '');
    });

    it('returns an empty mode when the operating mode is unknown', () => {
        strictEqual(deriveIcdMode({ litCapable: true, operatingMode: undefined, available: true }), '');
    });

    it('returns "sit" for a LIT-capable node running in standard mode', () => {
        strictEqual(deriveIcdMode({ litCapable: true, operatingMode: 0, available: true }), 'sit');
    });

    it('returns "sit" for standard mode even while the node is unavailable', () => {
        // A SIT node that is simply offline is not an ICD problem, so it must not turn red.
        strictEqual(deriveIcdMode({ litCapable: true, operatingMode: 0, available: false }), 'sit');
    });

    it('returns "lit" for a reachable battery saver node', () => {
        strictEqual(deriveIcdMode({ litCapable: true, operatingMode: 1, available: true }), 'lit');
    });

    it('returns "litOffline" for a battery saver node past its check-in window', () => {
        strictEqual(deriveIcdMode({ litCapable: true, operatingMode: 1, available: false }), 'litOffline');
    });
});

describe('formatDuration', () => {
    it('formats seconds only', () => {
        strictEqual(formatDuration(45), '45 s');
    });

    it('formats minutes and seconds', () => {
        strictEqual(formatDuration(125), '2 min 5 s');
    });

    it('drops the seconds when they are zero', () => {
        strictEqual(formatDuration(120), '2 min');
    });

    it('formats hours and minutes', () => {
        strictEqual(formatDuration(3900), '1 h 5 min');
    });

    it('drops the minutes when they are zero', () => {
        strictEqual(formatDuration(7200), '2 h');
    });

    it('never shows three units', () => {
        strictEqual(formatDuration(3661), '1 h 1 min');
    });
});

describe('wakeInstruction', () => {
    it('prefers the device instruction when the custom flag is set', () => {
        deepStrictEqual(wakeInstruction({ customInstruction: true }, 'Hold the pairing button'), {
            kind: 'custom',
            text: 'Hold the pairing button',
        });
    });

    it('falls back to a mapped hint when the custom flag is set without an instruction', () => {
        deepStrictEqual(wakeInstruction({ customInstruction: true, powerCycle: true }, undefined), {
            kind: 'mapped',
            text: 'ICD wake hint power cycle',
        });
    });

    it('maps the settings-menu flag', () => {
        deepStrictEqual(wakeInstruction({ settingsMenu: true }, undefined), {
            kind: 'mapped',
            text: 'ICD wake hint settings menu',
        });
    });

    it('maps the actuate-sensor flag', () => {
        deepStrictEqual(wakeInstruction({ actuateSensor: true }, undefined), {
            kind: 'mapped',
            text: 'ICD wake hint actuate sensor',
        });
    });

    it('maps the reset-button flag', () => {
        deepStrictEqual(wakeInstruction({ resetButton: true }, undefined), {
            kind: 'mapped',
            text: 'ICD wake hint reset button',
        });
    });

    it('maps the setup-button flag', () => {
        deepStrictEqual(wakeInstruction({ setupButton: true }, undefined), {
            kind: 'mapped',
            text: 'ICD wake hint setup button',
        });
    });

    it('maps the app-defined-button flag', () => {
        deepStrictEqual(wakeInstruction({ appDefinedButton: true }, undefined), {
            kind: 'mapped',
            text: 'ICD wake hint app defined button',
        });
    });

    it('returns the manual fallback for an unmapped flag', () => {
        deepStrictEqual(wakeInstruction({ deviceManual: true }, undefined), {
            kind: 'manual',
            text: 'ICD wake hint see manual',
        });
    });

    it('returns the manual fallback without a hint', () => {
        deepStrictEqual(wakeInstruction(undefined, 'ignored'), { kind: 'manual', text: 'ICD wake hint see manual' });
    });
});

describe('icdWakeInstructionText', () => {
    it("quotes the peer device's own instruction for a custom hint", () => {
        strictEqual(
            icdWakeInstructionText(t, { customInstruction: true }, 'Hold the pairing button'),
            'To wake the device immediately, follow the device instructions: "Hold the pairing button"',
        );
    });

    it('passes a custom instruction through verbatim, including HTML-like characters', () => {
        // Sanitizing for an HTML-rendering sink (if the caller's sink needs it) is the caller's job -
        // the progress-dialog label sink this text is equally used for renders it as plain text.
        strictEqual(
            icdWakeInstructionText(t, { customInstruction: true }, 'Press <b>the button</b>'),
            'To wake the device immediately, follow the device instructions: "Press <b>the button</b>"',
        );
    });

    it('maps a wake hint flag to its short instruction', () => {
        strictEqual(
            icdWakeInstructionText(t, { powerCycle: true }, undefined),
            'To wake the device immediately: ICD wake hint power cycle',
        );
    });

    it('falls back to the manual instruction when no hint is set', () => {
        strictEqual(
            icdWakeInstructionText(t, undefined, undefined),
            'To wake the device immediately: ICD wake hint see manual',
        );
    });
});

describe('icdWaitingLabel', () => {
    it('reaches the wake instruction when the peer advertises a user active mode trigger', () => {
        strictEqual(
            icdWaitingLabel(t, true, { settingsMenu: true }, undefined),
            'To wake the device immediately: ICD wake hint settings menu',
        );
    });

    it('falls back to a wait explanation when no user active mode trigger is advertised', () => {
        strictEqual(
            icdWaitingLabel(t, false, undefined, undefined),
            'The device will respond once it wakes up on its own.',
        );
    });

    it('ignores a leftover hint when the trigger feature itself is not advertised', () => {
        strictEqual(
            icdWaitingLabel(t, false, { powerCycle: true }, undefined),
            'The device will respond once it wakes up on its own.',
        );
    });
});

describe('otherFabricClientCount', () => {
    it('counts every client when our fabric index is unknown', () => {
        strictEqual(otherFabricClientCount([{ fabricIndex: 1 }, { fabricIndex: 2 }], undefined), 2);
    });

    it('excludes clients on our own fabric', () => {
        strictEqual(otherFabricClientCount([{ fabricIndex: 1 }, { fabricIndex: 2 }], 1), 1);
    });

    it('returns zero when only our own fabric is registered', () => {
        strictEqual(otherFabricClientCount([{ fabricIndex: 3 }], 3), 0);
    });

    it('returns zero for an empty list', () => {
        strictEqual(otherFabricClientCount([], 1), 0);
    });
});
