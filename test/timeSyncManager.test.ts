import { expect } from 'chai';
import { Hours, Millis, Time } from '@matter/main';
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
const CAPS: TimeSyncCapabilities = { supported: true, timeZone: false };

class RecordingConnector implements TimeSyncConnector {
    readonly syncCalls = new Array<PeerAddress>();

    async syncTime(peer: PeerAddress): Promise<void> {
        this.syncCalls.push(peer);
    }

    nodeConnected(): boolean {
        return true;
    }

    commissionedNodeCount(): number {
        return 1;
    }
}

/** syncNode is fire-and-forget, so let its promise chain settle before asserting. */
async function settle(): Promise<void> {
    await Time.sleep('test-settle', Millis(5));
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
