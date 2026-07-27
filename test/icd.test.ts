import { deepStrictEqual, strictEqual } from 'node:assert';
import { deriveIcdMode, formatDuration, otherFabricClientCount, wakeInstruction } from '../src/matter/icdUtils';

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
    it('prefers the device instruction when the custom bit is set', () => {
        deepStrictEqual(wakeInstruction(0b100, 'Hold the pairing button'), {
            kind: 'custom',
            text: 'Hold the pairing button',
        });
    });

    it('falls back to a mapped hint when the custom bit is set without an instruction', () => {
        deepStrictEqual(wakeInstruction(0b101, undefined), { kind: 'mapped', text: 'ICD wake hint power cycle' });
    });

    it('maps the settings-menu bit', () => {
        deepStrictEqual(wakeInstruction(1 << 1, undefined), { kind: 'mapped', text: 'ICD wake hint settings menu' });
    });

    it('maps the actuate-sensor bit', () => {
        deepStrictEqual(wakeInstruction(1 << 4, undefined), { kind: 'mapped', text: 'ICD wake hint actuate sensor' });
    });

    it('maps the reset-button bit', () => {
        deepStrictEqual(wakeInstruction(1 << 8, undefined), { kind: 'mapped', text: 'ICD wake hint reset button' });
    });

    it('maps the setup-button bit', () => {
        deepStrictEqual(wakeInstruction(1 << 12, undefined), { kind: 'mapped', text: 'ICD wake hint setup button' });
    });

    it('maps the app-defined-button bit', () => {
        deepStrictEqual(wakeInstruction(1 << 16, undefined), {
            kind: 'mapped',
            text: 'ICD wake hint app defined button',
        });
    });

    it('returns the manual fallback for an unknown hint', () => {
        deepStrictEqual(wakeInstruction(1 << 20, undefined), { kind: 'manual', text: 'ICD wake hint see manual' });
    });

    it('returns the manual fallback without a hint', () => {
        deepStrictEqual(wakeInstruction(undefined, 'ignored'), { kind: 'manual', text: 'ICD wake hint see manual' });
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
