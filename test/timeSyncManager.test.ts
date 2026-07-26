import { expect } from 'chai';
import { Hours, Logger, Millis, Time } from '@matter/main';
import { FabricIndex, NodeId } from '@matter/main/types';
import { PeerAddress } from '@matter/main/protocol';
import {
    resyncDelayMs,
    SyncTrigger,
    TimeSyncManager,
    type TimeSyncCapabilities,
    type TimeSyncConnector,
} from '../src/matter/timeSync/TimeSyncManager';

const PEER = PeerAddress({ nodeId: NodeId(1n), fabricIndex: FabricIndex(1) });
const PEER_2 = PeerAddress({ nodeId: NodeId(2n), fabricIndex: FabricIndex(1) });
const PEER_3 = PeerAddress({ nodeId: NodeId(3n), fabricIndex: FabricIndex(1) });
const CAPS: TimeSyncCapabilities = { supported: true, timeZone: false };

class RecordingConnector implements TimeSyncConnector {
    readonly syncCalls = new Array<PeerAddress>();
    failNext = false;

    async syncTime(peer: PeerAddress): Promise<void> {
        this.syncCalls.push(peer);
        if (this.failNext) {
            this.failNext = false;
            throw new Error('invoke failed');
        }
    }

    nodeConnected(): boolean {
        return true;
    }

    commissionedNodeCount(): number {
        return 1;
    }

    get syncedNodeIds(): string[] {
        return this.syncCalls.map(peer => peer.nodeId.toString());
    }
}

/** syncNode is fire-and-forget, so let its promise chain settle before asserting. */
async function settle(): Promise<void> {
    await Time.sleep('test-settle', Millis(5));
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
    const deadline = Time.nowMs + timeoutMs;
    while (!predicate() && Time.nowMs < deadline) {
        await Time.sleep('test-poll', Millis(5));
    }
}

describe('TimeSyncManager', () => {
    let connector: RecordingConnector;
    let manager: TimeSyncManager;

    beforeEach(() => {
        connector = new RecordingConnector();
        // Never let the real host zone be scanned; the cadence is not what these tests exercise.
        manager = new TimeSyncManager(connector, () => null);
    });

    afterEach(async () => {
        await manager.stop();
    });

    it('defers a trigger sync until the startup window has elapsed', async () => {
        manager.registerNode(PEER, CAPS);

        // A restart can leave many nodes reporting timeFailure at once, which is the traffic the
        // window exists to avoid; the first periodic cycle covers all of them together.
        manager.syncNode(PEER, SyncTrigger.TimeFailure);
        await settle();
        expect(connector.syncCalls.length).to.equal(0);

        manager.completeStartup();
        manager.syncNode(PEER, SyncTrigger.TimeFailure);
        await settle();
        expect(connector.syncCalls.length).to.equal(1);
    });

    it('holds off a timeFailure repeated inside the hour', async () => {
        manager.registerNode(PEER, CAPS);
        manager.completeStartup();

        manager.syncNode(PEER, SyncTrigger.TimeFailure);
        await settle();
        expect(connector.syncCalls.length).to.equal(1);

        manager.syncNode(PEER, SyncTrigger.TimeFailure);
        await settle();
        expect(connector.syncCalls.length).to.equal(1);
    });

    it('does not sync a node that was never registered', async () => {
        manager.completeStartup();
        manager.syncNode(PEER, SyncTrigger.TimeFailure);
        await settle();
        expect(connector.syncCalls.length).to.equal(0);
    });

    it('drops a node whose capabilities no longer report the cluster', async () => {
        manager.registerNode(PEER, CAPS);
        manager.completeStartup();
        manager.registerNode(PEER, { supported: false, timeZone: false });

        manager.syncNode(PEER, SyncTrigger.TimeFailure);
        await settle();
        expect(connector.syncCalls.length).to.equal(0);
    });

    it('reads the commissioned node count only while the startup delay can still change', async () => {
        let lookups = 0;
        const counting = new (class extends RecordingConnector {
            override commissionedNodeCount(): number {
                lookups++;
                return 6;
            }
        })();
        const probed = new TimeSyncManager(counting, () => null);
        try {
            probed.registerNode(PEER, CAPS);
            expect(lookups).to.equal(1);

            // The timer is running now, so a recomputed delay could not be applied anyway.
            probed.registerNode(PEER_2, CAPS);
            probed.registerNode(PEER, CAPS);
            expect(lookups).to.equal(1);
        } finally {
            await probed.stop();
        }
    });

    it('syncs a node registering after the startup window without waiting for a cycle', async () => {
        manager.registerNode(PEER, CAPS);
        manager.completeStartup();

        manager.registerNode(PEER_2, CAPS);
        await settle();
        expect(connector.syncedNodeIds).to.deep.equal(['2']);
    });

    it('answers a timeFailure even after a reconnect sync failed', async () => {
        manager.registerNode(PEER, CAPS);
        manager.completeStartup();

        // One shared stamp would let this failed attempt reinstate the 24 h reconnect block over
        // the hour the node is entitled to.
        connector.failNext = true;
        manager.syncNode(PEER, SyncTrigger.Reconnect);
        await settle();
        expect(connector.syncCalls.length).to.equal(1);

        manager.syncNode(PEER, SyncTrigger.Reconnect);
        await settle();
        expect(connector.syncCalls.length, 'reconnect stays held off').to.equal(1);

        manager.syncNode(PEER, SyncTrigger.TimeFailure);
        await settle();
        expect(connector.syncCalls.length, 'a node asking for a time is answered').to.equal(2);
    });

    describe('periodic cycle', function () {
        // A cycle spaces its nodes 2 s apart, which overruns mocha's default timeout.
        this.timeout(15_000);

        let cycling: TimeSyncManager;

        afterEach(async () => {
            await cycling.stop();
        });

        it('syncs every registered peer', async () => {
            cycling = new TimeSyncManager(connector, () => null, () => 1);
            cycling.registerNode(PEER, CAPS);
            cycling.registerNode(PEER_2, CAPS);

            await waitFor(() => connector.syncCalls.length >= 2, 6000);
            expect(connector.syncedNodeIds.slice(0, 2)).to.have.members(['1', '2']);
        });

        it('reports successes rather than attempts in the cycle-complete log', async () => {
            // processNode swallows every error, so counting attempts would claim both nodes were
            // synced when one invoke threw.
            const lines = new Array<string>();
            // Logger.log's setter composes destinations, so reassigning what its getter returns
            // recurses; swap the destination's write instead.
            const destination = Logger.destinations.default;
            const originalWrite = destination.write;
            destination.write = text => {
                lines.push(text);
            };
            try {
                connector.failNext = true;
                cycling = new TimeSyncManager(connector, () => null, () => 1);
                cycling.registerNode(PEER, CAPS);
                cycling.registerNode(PEER_2, CAPS);

                await waitFor(() => lines.some(line => line.includes('Periodic resync complete')), 8000);
            } finally {
                destination.write = originalWrite;
            }
            const summary = lines.find(line => line.includes('Periodic resync complete'));
            expect(summary, 'the cycle must log a summary').to.not.equal(undefined);
            expect(summary).to.contain('synced 1 of 2 nodes');
        });

        it('covers a node that registers while the first cycle is running', async () => {
            // The cycle snapshots its peer list up front, so a late arrival is not in it. It must
            // still be reachable through the immediate path, which opens as the cycle starts.
            cycling = new TimeSyncManager(connector, () => null, () => 1);
            cycling.registerNode(PEER, CAPS);
            cycling.registerNode(PEER_2, CAPS);

            // Two peers means the cycle is still mid-run, waiting out its inter-node delay.
            await waitFor(() => connector.syncCalls.length >= 1, 6000);
            cycling.registerNode(PEER_3, CAPS);

            await waitFor(() => connector.syncedNodeIds.includes('3'), 6000);
            expect(connector.syncedNodeIds, 'the late node must not wait for the next cycle').to.include('3');
        });
    });

    describe('resyncDelayMs', () => {
        it('treats a non-finite instant as no change in view', () => {
            // The lookup is injectable, and a NaN delay would otherwise reach the timer and fire at once.
            const now = Time.nowMs;
            expect(resyncDelayMs(now, NaN)).to.equal(Hours(24));
            expect(resyncDelayMs(now, Number.POSITIVE_INFINITY)).to.equal(Hours(24));
        });

        it('leaves the cadence alone for an instant already passed or beyond the interval', () => {
            const now = Time.nowMs;
            expect(resyncDelayMs(now, now - Hours(1))).to.equal(Hours(24));
            expect(resyncDelayMs(now, now + Hours(48))).to.equal(Hours(24));
        });

        it('brings the cycle forward to a minute past an upcoming change', () => {
            const now = Time.nowMs;
            expect(resyncDelayMs(now, now + Hours(8))).to.equal(Hours(8) + 60_000);
        });
    });
});
