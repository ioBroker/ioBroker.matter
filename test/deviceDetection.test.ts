import { deepStrictEqual, strictEqual } from 'node:assert';
import { selectControlsForState } from '../src/lib/deviceDetection';

interface TestControl {
    type: string;
    states: { name: string; id?: string }[];
}

function control(type: string, states: { name: string; id?: string }[]): TestControl {
    return { type, states };
}

const CHANNEL = 'test.0.dev';

describe('selectControlsForState', () => {
    describe('a concrete state was selected (selectedId !== deviceId)', () => {
        it('returns the pattern where the selected state is the main state', () => {
            const socketS2 = control('socket', [{ name: 'SET', id: `${CHANNEL}.s2` }]);
            const result = selectControlsForState([socketS2], `${CHANNEL}.s2`, CHANNEL);
            deepStrictEqual(result, [socketS2]);
        });

        it('returns null when the selected state is in no detected pattern (#594/#730 sibling)', () => {
            // The detector built a socket around the sibling s2; the user picked s1.
            const socketS2 = control('socket', [{ name: 'SET', id: `${CHANNEL}.s2` }]);
            const result = selectControlsForState([socketS2], `${CHANNEL}.s1`, CHANNEL);
            strictEqual(result, null);
        });

        it('keeps the full multi-state pattern when the selected state is a secondary slot', () => {
            // CT device: TEMPERATURE is the main state, the selected on/off state is secondary.
            const ct = control('ct', [
                { name: 'TEMPERATURE', id: `${CHANNEL}.tmp` },
                { name: 'DIMMER', id: `${CHANNEL}.dim` },
                { name: 'ON', id: `${CHANNEL}.on` },
            ]);
            const result = selectControlsForState([ct], `${CHANNEL}.on`, CHANNEL);
            deepStrictEqual(result, [ct]);
        });

        it('prefers the pattern where the selected state is main over one where a sibling is main', () => {
            const socketAsSibling = control('socket', [
                { name: 'SET', id: `${CHANNEL}.s1` },
                { name: 'ACTUAL', id: `${CHANNEL}.s2` },
            ]);
            const socketAsMain = control('socket', [{ name: 'SET', id: `${CHANNEL}.s2` }]);
            const result = selectControlsForState([socketAsSibling, socketAsMain], `${CHANNEL}.s2`, CHANNEL);
            deepStrictEqual(result, [socketAsMain]);
        });

        it('ignores state slots without an id when determining the main state', () => {
            const dimmer = control('dimmer', [
                { name: 'SET' }, // optional slot, not matched to a real state
                { name: 'ACTUAL', id: `${CHANNEL}.actual` },
            ]);
            const result = selectControlsForState([dimmer], `${CHANNEL}.actual`, CHANNEL);
            deepStrictEqual(result, [dimmer]);
        });
    });

    describe('a whole device/channel was selected (selectedId === deviceId)', () => {
        it('keeps patterns that contain the id', () => {
            const a = control('socket', [{ name: 'SET', id: `${CHANNEL}.s1` }]);
            const b = control('light', [{ name: 'SET', id: CHANNEL }]);
            const result = selectControlsForState([a, b], CHANNEL, CHANNEL);
            deepStrictEqual(result, [b]);
        });

        it('falls back to all controls when none contains the channel id (normal auto-detect)', () => {
            const a = control('socket', [{ name: 'SET', id: `${CHANNEL}.s1` }]);
            const b = control('light', [{ name: 'SET', id: `${CHANNEL}.s2` }]);
            const result = selectControlsForState([a, b], CHANNEL, CHANNEL);
            deepStrictEqual(result, [a, b]);
        });
    });
});
