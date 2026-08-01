import { expect } from 'chai';
import { Millis, Time } from '@matter/main';
import { FabricIndex, NodeId } from '@matter/main/types';
import { PeerAddress } from '@matter/main/protocol';
import { NodeProcessor } from '../src/matter/timeSync/NodeProcessor';

const PEER = PeerAddress({ nodeId: NodeId(1n), fabricIndex: FabricIndex(1) });

class TestProcessor extends NodeProcessor {
    processed = 0;
    delayError?: Error;

    constructor() {
        super(`test-processor-${Time.nowMs}`, 1, Millis(20));
    }

    add(peer: PeerAddress): void {
        this.registerPeer(peer);
        this.scheduleIfNeeded();
    }

    protected shouldProcess(): boolean {
        return true;
    }

    protected async processNode(): Promise<void> {
        this.processed++;
    }

    protected override nextCycleDelay(): ReturnType<NodeProcessor['nextCycleDelay']> {
        if (this.delayError !== undefined) {
            throw this.delayError;
        }
        return Millis(20);
    }
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
    const deadline = Time.nowMs + timeoutMs;
    while (!predicate() && Time.nowMs < deadline) {
        await Time.sleep('test-poll', Millis(5));
    }
}

describe('NodeProcessor', () => {
    it('keeps cycling after nextCycleDelay throws', async () => {
        // The timer is one-shot; only the finally in #processAll re-arms it. A throw while
        // computing the next delay used to skip that and stop the processor for good.
        const processor = new TestProcessor();
        processor.delayError = new RangeError('Invalid time zone specified: Etc/Unknown');
        processor.add(PEER);

        await waitFor(() => processor.processed >= 2);
        await processor.stop();

        expect(processor.processed).to.be.greaterThan(1);
    });

    it('runs cycles normally when nextCycleDelay succeeds', async () => {
        const processor = new TestProcessor();
        processor.add(PEER);

        await waitFor(() => processor.processed >= 2);
        await processor.stop();

        expect(processor.processed).to.be.greaterThan(1);
    });
});
