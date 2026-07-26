import { expect } from 'chai';
import { Millis, Time } from '@matter/main';
import { FabricIndex, NodeId } from '@matter/main/types';
import { PeerAddress } from '@matter/main/protocol';
import {
    SyncTrigger,
    TimeSyncManager,
    type TimeSyncCapabilities,
    type TimeSyncConnector,
} from '../src/matter/timeSync/TimeSyncManager';

const PEER = PeerAddress({ nodeId: NodeId(1n), fabricIndex: FabricIndex(1) });
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
});
