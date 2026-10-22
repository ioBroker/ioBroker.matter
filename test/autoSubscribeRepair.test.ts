import { expect } from 'chai';
import { enableAutoSubscribe, type AutoSubscribeTarget } from '../src/matter/autoSubscribeRepair';

function target(
    name: string,
    autoSubscribe: boolean | undefined,
    enabled: string[],
    fail = false,
): AutoSubscribeTarget {
    return {
        name,
        autoSubscribe,
        enable: async () => {
            if (fail) {
                throw new Error(`cannot enable ${name}`);
            }
            enabled.push(name);
        },
    };
}

describe('enableAutoSubscribe', () => {
    it('turns subscriptions on only for peers that have them off', async () => {
        const enabled = new Array<string>();
        const count = await enableAutoSubscribe(
            [target('off', false, enabled), target('on', true, enabled), target('none', undefined, enabled)],
            () => undefined,
        );
        expect(enabled).to.deep.equal(['off']);
        expect(count).to.equal(1);
    });

    it('keeps repairing the other peers when one fails and reports the failure', async () => {
        const enabled = new Array<string>();
        const failures = new Array<string>();
        const count = await enableAutoSubscribe(
            [target('broken', false, enabled, true), target('fine', false, enabled)],
            (name, error) => failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`),
        );
        expect(enabled).to.deep.equal(['fine']);
        expect(count).to.equal(1);
        expect(failures).to.deep.equal(['broken: cannot enable broken']);
    });
});
