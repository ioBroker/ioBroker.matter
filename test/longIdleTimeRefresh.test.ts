import { expect } from 'chai';
import { Millis, Time } from '@matter/main';
import { refreshWithLongIdleTimeDeferral, runDedupedByKey } from '../src/matter/longIdleTimeRefresh';

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
    const deadline = Time.nowMs + timeoutMs;
    while (!predicate() && Time.nowMs < deadline) {
        await Time.sleep('test-poll', Millis(5));
    }
}

describe('refreshWithLongIdleTimeDeferral', () => {
    it('resolves once the regular nodes are read, without waiting for a LIT node', async () => {
        const reads = new Array<string>();
        let releaseLit: (() => void) | undefined;
        const litGate = new Promise<void>(resolve => {
            releaseLit = resolve;
        });

        const read = async (nodeId: string): Promise<void> => {
            if (nodeId === 'lit') {
                await litGate;
            }
            reads.push(nodeId);
        };

        let settledCount = 0;
        await refreshWithLongIdleTimeDeferral(
            ['lit', 'r1', 'r2'],
            nodeId => nodeId === 'lit',
            read,
            () => settledCount++,
        );

        // The command has resolved: the regular nodes were read, the LIT node was not (its read is
        // still parked on litGate), and its settlement callback has not fired yet.
        expect(reads, 'both regular nodes must be read').to.have.members(['r1', 'r2']);
        expect(reads, 'the LIT node must not be read before its gate opens').to.not.include('lit');
        expect(settledCount, 'the LIT settlement callback must not fire before the gate opens').to.equal(0);

        releaseLit!();
        await waitFor(() => reads.includes('lit'));
        expect(reads).to.include('lit');
        expect(settledCount, 'the LIT settlement callback must fire once the deferred read lands').to.equal(1);
    });

    it('does not let a rejecting LIT read reach the caller as an unhandled rejection', async () => {
        const read = async (nodeId: string): Promise<void> => {
            if (nodeId === 'lit') {
                throw new Error('LIT read exploded');
            }
        };

        let settled = false;
        await refreshWithLongIdleTimeDeferral(
            ['lit', 'r1'],
            nodeId => nodeId === 'lit',
            read,
            () => {
                settled = true;
            },
        );

        await waitFor(() => settled);
        expect(settled).to.equal(true);
    });
});

describe('runDedupedByKey', () => {
    it('skips a second call for a key that is still pending, then allows a third call after it settles', async () => {
        const pending = new Set<string>();
        const runs = new Array<number>();
        let releaseFirst: (() => void) | undefined;
        const gate = new Promise<void>(resolve => {
            releaseFirst = resolve;
        });

        const run = async (): Promise<void> => {
            await gate;
            runs.push(1);
        };

        const first = runDedupedByKey(pending, 'node-1', run);

        let skipped = 0;
        // A second call while the first is still in flight must not invoke run() again.
        await runDedupedByKey(pending, 'node-1', run, () => skipped++);
        expect(runs, 'the second call must not have run yet').to.have.length(0);
        expect(skipped, 'the second call must report itself as skipped').to.equal(1);

        releaseFirst!();
        await first;
        expect(runs, 'the first call must have completed').to.deep.equal([1]);

        // Now that the key is no longer pending, a third call must run again.
        let thirdRan = false;
        await runDedupedByKey(pending, 'node-1', async () => {
            thirdRan = true;
        });
        expect(thirdRan, 'a call after the pending one settled must run').to.equal(true);
    });

    it('clears the pending key even when run() rejects', async () => {
        const pending = new Set<string>();

        await runDedupedByKey(pending, 'node-1', async () => {
            throw new Error('boom');
        }).catch(() => {});

        expect(pending.has('node-1'), 'the key must not be left stuck as pending after a rejection').to.equal(false);
    });
});
