import { expect } from 'chai';
import { Millis, Time } from '@matter/main';
import { FabricIndex, NodeId } from '@matter/main/types';
import { PeerAddress } from '@matter/main/protocol';
import { ThreadDetailsPoller, type ThreadTopologyConnector } from '../src/matter/timeSync/ThreadDetailsPoller';

const PEER = PeerAddress({ nodeId: NodeId(1n), fabricIndex: FabricIndex(1) });
const PEER_2 = PeerAddress({ nodeId: NodeId(2n), fabricIndex: FabricIndex(1) });
const LIT_PEER = PeerAddress({ nodeId: NodeId(11n), fabricIndex: FabricIndex(1) });

class RecordingConnector implements ThreadTopologyConnector {
    readonly reads = new Array<PeerAddress>();
    readonly connected = new Set<string>();
    failNext = false;

    constructor(...connectedPeers: PeerAddress[]) {
        for (const peer of connectedPeers) {
            this.connected.add(peer.nodeId.toString());
        }
    }

    nodeConnected(peer: PeerAddress): boolean {
        return this.connected.has(peer.nodeId.toString());
    }

    async readTopology(peer: PeerAddress): Promise<void> {
        this.reads.push(peer);
        if (this.failNext) {
            this.failNext = false;
            throw new Error('read exploded');
        }
    }

    get readNodeIds(): string[] {
        return this.reads.map(peer => peer.nodeId.toString());
    }
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
    const deadline = Time.nowMs + timeoutMs;
    while (!predicate() && Time.nowMs < deadline) {
        await Time.sleep('test-poll', Millis(5));
    }
}

describe('ThreadDetailsPoller', () => {
    let connector: RecordingConnector;
    let poller: ThreadDetailsPoller | undefined;

    afterEach(async () => {
        await poller?.stop();
        poller = undefined;
    });

    it('polls a registered Thread node once the initial delay elapses', async () => {
        connector = new RecordingConnector(PEER);
        poller = new ThreadDetailsPoller(connector, 1, 20);
        poller.registerNode(PEER, true);

        await waitFor(() => connector.reads.length >= 1);
        expect(connector.readNodeIds).to.deep.equal(['1']);
    });

    it('does not register a node that is not on Thread', async () => {
        connector = new RecordingConnector(PEER);
        poller = new ThreadDetailsPoller(connector, 1, 20);
        poller.registerNode(PEER, false);

        // The processor timer never arms without a registered peer; give it a moment anyway.
        await Time.sleep('settle', Millis(50));
        expect(connector.reads.length).to.equal(0);
    });

    it('unregisters a node that stops qualifying as Thread on re-registration', async () => {
        connector = new RecordingConnector(PEER);
        poller = new ThreadDetailsPoller(connector, 1, 20);
        poller.registerNode(PEER, true);
        poller.registerNode(PEER, false);

        await Time.sleep('settle', Millis(50));
        expect(connector.reads.length).to.equal(0);
    });

    it('skips an offline node and picks it up again once reconnected', async () => {
        connector = new RecordingConnector();
        poller = new ThreadDetailsPoller(connector, 1, 30);
        poller.registerNode(PEER, true);

        await Time.sleep('settle', Millis(50));
        expect(connector.reads.length, 'an offline node must not be read').to.equal(0);

        connector.connected.add(PEER.nodeId.toString());
        await waitFor(() => connector.reads.length >= 1, 1000);
        expect(connector.readNodeIds).to.deep.equal(['1']);
    });

    it('keeps polling the remaining nodes after a read fails', async function () {
        // The base class spaces nodes two real seconds apart.
        this.timeout(6000);
        connector = new RecordingConnector(PEER, PEER_2);
        connector.failNext = true;
        poller = new ThreadDetailsPoller(connector, 1, 200);
        poller.registerNode(PEER, true);
        poller.registerNode(PEER_2, true);

        await waitFor(() => connector.reads.length >= 2, 4000);
        expect(connector.readNodeIds).to.have.members(['1', '2']);
    });

    it('polls again on the next cycle', async () => {
        connector = new RecordingConnector(PEER);
        poller = new ThreadDetailsPoller(connector, 1, 30);
        poller.registerNode(PEER, true);

        await waitFor(() => connector.reads.length >= 1);
        await waitFor(() => connector.reads.length >= 2, 1000);
        expect(connector.reads.length, 'the cycle must re-arm itself').to.be.greaterThan(1);
    });

    it('stops polling a node that unregisters', async () => {
        connector = new RecordingConnector(PEER);
        poller = new ThreadDetailsPoller(connector, 1, 30);
        poller.registerNode(PEER, true);

        await waitFor(() => connector.reads.length >= 1);
        const afterFirst = connector.reads.length;

        poller.unregisterNode(PEER);
        await Time.sleep('settle', Millis(100));
        expect(connector.reads.length).to.equal(afterFirst);
    });

    it('holds a long idle time peer out of the serial loop and still polls it', async () => {
        connector = new RecordingConnector(PEER, LIT_PEER);
        poller = new ThreadDetailsPoller(connector, 1, 500);
        poller.registerNode(PEER, true);
        poller.registerNode(LIT_PEER, true, true);

        // A LIT peer sharing the serial loop would only be reached after its 2 s inter-node delay.
        await waitFor(() => connector.readNodeIds.includes(LIT_PEER.nodeId.toString()), 500);
        expect(connector.readNodeIds, 'the LIT peer must still be polled, via the deferred batch').to.include(
            LIT_PEER.nodeId.toString(),
        );
        expect(connector.readNodeIds[0], 'the serial peer must not stall behind the LIT peer').to.equal(
            PEER.nodeId.toString(),
        );
    });
});
