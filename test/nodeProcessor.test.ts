import { expect } from 'chai';
import { Millis, Time } from '@matter/main';
import { FabricIndex, NodeId } from '@matter/main/types';
import { PeerAddress } from '@matter/main/protocol';
import { NodeProcessor } from '../src/matter/timeSync/NodeProcessor';

const PEER = PeerAddress({ nodeId: NodeId(1n), fabricIndex: FabricIndex(1) });
const PEER_2 = PeerAddress({ nodeId: NodeId(2n), fabricIndex: FabricIndex(1) });
const LIT_PEER = PeerAddress({ nodeId: NodeId(11n), fabricIndex: FabricIndex(1) });
const LIT_PEER_2 = PeerAddress({ nodeId: NodeId(12n), fabricIndex: FabricIndex(1) });

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

/** Processor exercising the long idle time (LIT) deferred-batch behaviour. */
class LitTestProcessor extends NodeProcessor {
    readonly started = new Array<string>();
    cycles = 0;
    /** While set, processNode blocks on a LIT peer until release() is called for it. */
    gate = false;
    readonly #connected = new Set<string>();
    readonly #releases = new Map<string, () => void>();

    constructor(initialDelayMs = 1, targetIntervalMs = 20) {
        super(`lit-test-processor-${Time.nowMs}-${Math.random()}`, initialDelayMs, targetIntervalMs);
    }

    add(peer: PeerAddress, longIdleTime = false): void {
        this.registerPeer(peer, longIdleTime);
        this.#connected.add(peer.nodeId.toString());
        this.scheduleIfNeeded();
    }

    remove(peer: PeerAddress): void {
        this.unregisterPeer(peer);
        this.#connected.delete(peer.nodeId.toString());
    }

    get inFlight(): number {
        return this.#releases.size;
    }

    release(peer: PeerAddress): void {
        const resolve = this.#releases.get(peer.nodeId.toString());
        this.#releases.delete(peer.nodeId.toString());
        resolve?.();
    }

    protected shouldProcess(peer: PeerAddress): boolean {
        return this.#connected.has(peer.nodeId.toString());
    }

    protected async processNode(peer: PeerAddress): Promise<void> {
        this.started.push(peer.nodeId.toString());
        if (this.gate && this.isLongIdleTime(peer)) {
            await new Promise<void>(resolve => this.#releases.set(peer.nodeId.toString(), resolve));
        }
    }

    protected override onCycleComplete(): void {
        this.cycles++;
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

    describe('long idle time peers', () => {
        it('holds a long idle time peer out of the serial loop and runs it after', async () => {
            const processor = new LitTestProcessor();
            processor.add(PEER);
            processor.add(LIT_PEER, true);

            // A regression that puts LIT_PEER back in the serial loop needs its 2 s inter-node delay
            // to reach it; a short deadline turns that into a clean assertion failure below rather
            // than racing mocha's own per-test timeout.
            await waitFor(() => processor.started.includes(LIT_PEER.nodeId.toString()), 500);
            await processor.stop();

            expect(processor.started[0], 'the serial peer must not stall behind the LIT peer').to.equal(
                PEER.nodeId.toString(),
            );
            expect(processor.started).to.include(LIT_PEER.nodeId.toString());
        });

        it('runs long idle time peers concurrently in the deferred batch', async () => {
            const processor = new LitTestProcessor();
            processor.gate = true;
            processor.add(LIT_PEER, true);
            processor.add(LIT_PEER_2, true);

            await waitFor(() => processor.inFlight >= 2, 500);
            expect(processor.started, 'both must start together, not spaced apart').to.have.members([
                LIT_PEER.nodeId.toString(),
                LIT_PEER_2.nodeId.toString(),
            ]);

            processor.release(LIT_PEER);
            processor.release(LIT_PEER_2);
            await processor.stop();
        });

        it('skips its own long idle time peers while a previous batch is still running', async () => {
            const processor = new LitTestProcessor();
            processor.gate = true;
            processor.add(LIT_PEER, true);

            await waitFor(() => processor.inFlight >= 1, 500);
            const afterFirstBatch = processor.started.length;

            // Let a second cycle complete while the first batch is still gated open.
            await waitFor(() => processor.cycles >= 2, 1000);
            expect(processor.started.length, 'a stacked batch would start the peer a second time').to.equal(
                afterFirstBatch,
            );

            processor.release(LIT_PEER);
            await waitFor(() => processor.started.length > afterFirstBatch, 500);
            // The second batch is gated open too; release it before stop(), or its processNode promise
            // (and the Promise.allSettled awaiting it) never settles.
            processor.release(LIT_PEER);
            await processor.stop();

            expect(processor.started.length, 'a new batch must start once the previous one cleared').to.equal(
                afterFirstBatch + 1,
            );
        });

        it('does not await an in-flight long idle time batch on stop()', async () => {
            const processor = new LitTestProcessor();
            processor.gate = true;
            processor.add(LIT_PEER, true);

            await waitFor(() => processor.inFlight >= 1, 500);
            await processor.stop();

            expect(processor.inFlight, 'stop() must return while the batch is still running').to.equal(1);
            processor.release(LIT_PEER);
        });

        it('resets the timer to the initial delay when the last peer unregisters', async () => {
            const processor = new LitTestProcessor(2, 300);
            processor.add(PEER);

            await waitFor(() => processor.cycles >= 1);
            processor.remove(PEER);
            processor.add(PEER_2);

            // A timer left at the 300 ms target interval could not fire within this window.
            await waitFor(() => processor.started.includes(PEER_2.nodeId.toString()), 100);
            await processor.stop();

            expect(processor.started).to.include(PEER_2.nodeId.toString());
        });
    });
});
