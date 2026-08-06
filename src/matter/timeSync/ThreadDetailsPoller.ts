/**
 * Polls the Thread topology attributes (NeighborTable, RouteTable) of registered Thread nodes.
 *
 * Most Thread devices report these tables only when their subscription is (re)established, so a
 * long-running adapter shows increasingly stale link and route data. A read makes the node produce
 * current values, which flow into the attribute cache and out to the network graph exactly like a
 * subscription report would.
 *
 * Mirrored from matter-js/matterjs-server `packages/ws-controller/src/controller/ThreadDetailsPoller.ts`.
 */

import { Hours, Logger } from '@matter/main';
import type { PeerAddress } from '@matter/main/protocol';
import { NodeProcessor } from './NodeProcessor';
import { STARTUP_BASE_DELAY as TIME_SYNC_STARTUP_BASE_DELAY } from './TimeSyncManager';

const logger = Logger.get('ThreadDetailsPoller');

const POLL_INTERVAL = Hours(24);

// Twice the time sync startup base delay: nodes initialize at roughly 10 per minute, so this clears
// initialization on all but the largest installations before the first sweep.
const INITIAL_DELAY_MS = 2 * TIME_SYNC_STARTUP_BASE_DELAY;

export interface ThreadTopologyConnector {
    nodeConnected(peer: PeerAddress): boolean;
    /** Re-read a Thread node's topology attributes and refresh the network graph. */
    readTopology(peer: PeerAddress): Promise<void>;
}

function formatNodeId(peer: PeerAddress): string {
    return peer.nodeId.toString();
}

/**
 * Polls the Thread topology of registered Thread nodes, six minutes after the first one registers
 * and every 24 hours afterwards.
 */
export class ThreadDetailsPoller extends NodeProcessor {
    readonly #connector: ThreadTopologyConnector;

    // initialDelayMs/pollIntervalMs are only overridden by tests, which cannot wait out the real cadence.
    constructor(
        connector: ThreadTopologyConnector,
        initialDelayMs: number = INITIAL_DELAY_MS,
        pollIntervalMs: number = POLL_INTERVAL,
    ) {
        super('thread-details-poller', initialDelayMs, pollIntervalMs);
        this.#connector = connector;
    }

    /**
     * Register a node for Thread topology polling if it is a Thread node, or unregister it otherwise.
     * Call this once a node is connected and its attributes are available.
     */
    registerNode(peer: PeerAddress, isThreadNode: boolean, longIdleTime = false): void {
        if (this.closed) {
            return;
        }
        if (!isThreadNode) {
            this.unregisterNode(peer);
            return;
        }

        if (this.registerPeer(peer, longIdleTime)) {
            logger.info(`Registered node ${formatNodeId(peer)} for Thread topology polling`);
        }

        this.scheduleIfNeeded();
    }

    unregisterNode(peer: PeerAddress): void {
        if (this.unregisterPeer(peer)) {
            logger.info(`Unregistered node ${formatNodeId(peer)} from Thread topology polling`);
        }
    }

    protected override shouldProcess(peer: PeerAddress): boolean {
        return this.#connector.nodeConnected(peer);
    }

    protected override async processNode(peer: PeerAddress): Promise<void> {
        try {
            await this.#connector.readTopology(peer);
        } catch (error) {
            logger.warn(`Failed to poll Thread topology for node ${formatNodeId(peer)}:`, error);
        }
    }

    protected override onCycleComplete(processedCount: number, intervalFormatted: string): void {
        if (processedCount > 0) {
            const next = intervalFormatted === '' ? '' : ` Next poll in ${intervalFormatted}.`;
            logger.info(`Polled Thread topology of ${processedCount} nodes.${next}`);
        }
    }
}
