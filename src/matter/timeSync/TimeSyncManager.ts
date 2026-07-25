/**
 * Handles time synchronization for nodes with the TimeSynchronization cluster.
 * Syncs time on three triggers:
 * 1. Node connects/reconnects after startup (immediate, once startup window has elapsed)
 * 2. Periodic resync every 24 hours
 * 3. Reactive resync when a node emits a timeFailure event (driven externally via syncNode())
 *
 * A startup window of 30–60 minutes prevents syncing during initial node connection
 * while the host's NTP is still stabilizing. This manager must only be enabled when
 * the host time source is known to be reliable.
 *
 * Mirrored from matter-js/matterjs-server `packages/ws-controller/src/controller/TimeSyncManager.ts`;
 * the upstream raw attribute cache is replaced by {@link TimeSyncCapabilities}.
 */

import { Duration, type Endpoint, Hours, Logger, Minutes, Time } from '@matter/main';
import { TimeSynchronizationClient } from '@matter/main/behaviors';
import { TimeSynchronization } from '@matter/main/clusters';
import { type PeerAddress, PeerAddressMap } from '@matter/main/protocol';
import { StatusResponseError } from '@matter/main/types';
import { NodeProcessor } from './NodeProcessor';

const logger = Logger.get('TimeSyncManager');

/** TimeSynchronization cluster ID (0x0038 = 56 decimal) */
export const TIME_SYNC_CLUSTER_ID = 0x0038;

/** timeFailure event ID within the TimeSynchronization cluster */
export const TIME_FAILURE_EVENT_ID = 0x03;

/** Periodic resync interval: 24 hours */
const RESYNC_INTERVAL = Hours(24);

// Minimum spacing between trigger-driven (reconnect / timeFailure) syncs for one peer.
// The periodic path already caps its own cadence; this stops a flapping node or a device
// repeatedly emitting timeFailure from storming setUtcTime commands.
const TRIGGER_SYNC_COOLDOWN = Hours(24);

export interface TimeSyncConnector {
    syncTime(peer: PeerAddress): Promise<void>;
    nodeConnected(peer: PeerAddress): boolean;
}

/** What a node supports of the TimeSynchronization cluster, read from its root endpoint. */
export interface TimeSyncCapabilities {
    /** The node exposes the TimeSynchronization cluster. */
    supported: boolean;
    /** The node exposes the TimeZone feature, so SetTimeZone/SetDstOffset are supported. */
    timeZone: boolean;
    /** DSTOffsetListMaxSize when the node advertises it. */
    dstOffsetListMaxSize?: number;
}

/**
 * Read the TimeSynchronization capabilities of a node from its root endpoint. The cluster is
 * always on endpoint 0 per the Matter spec.
 */
export function readTimeSyncCapabilities(rootEndpoint: Endpoint): TimeSyncCapabilities {
    // A defined state implies the behavior is present, which is what makes the later
    // commandsOf() call safe — that one throws instead of returning undefined.
    const state = rootEndpoint.maybeStateOf(TimeSynchronizationClient);
    if (state === undefined) {
        return { supported: false, timeZone: false };
    }
    return {
        supported: true,
        timeZone: rootEndpoint.maybeFeaturesOf(TimeSynchronizationClient)?.timeZone === true,
        dstOffsetListMaxSize: typeof state.dstOffsetListMaxSize === 'number' ? state.dstOffsetListMaxSize : undefined,
    };
}

function formatNodeId(peer: PeerAddress): string {
    return peer.nodeId.toString();
}

/** TimeNotAccepted means the node keeps a time source it prefers — expected, not an error. */
function logSyncFailure(prefix: string, peer: PeerAddress, error: unknown): void {
    if (error instanceof StatusResponseError && error.clusterCode === TimeSynchronization.StatusCode.TimeNotAccepted) {
        logger.info(`${prefix}Node ${formatNodeId(peer)} declined the provided time`);
        return;
    }
    logger.warn(`${prefix}Failed to sync time on node ${formatNodeId(peer)}:`, error);
}

/**
 * Manages time synchronization for nodes with the TimeSynchronization cluster.
 */
export class TimeSyncManager extends NodeProcessor {
    readonly #connector: TimeSyncConnector;
    // Tracks in-flight immediate syncs per node to prevent parallel syncs
    #inFlightSyncs = new PeerAddressMap<Promise<void>>();
    // Last trigger-driven sync attempt per node, used to enforce TRIGGER_SYNC_COOLDOWN
    #lastTriggerSyncMs = new PeerAddressMap<number>();
    // True after the first periodic resync cycle, enabling immediate syncs on reconnect
    #startupComplete = false;

    constructor(connector: TimeSyncConnector) {
        // Startup window: random 30–60 minutes to stagger across adapter restarts and
        // allow NTP to stabilize before pushing time to devices
        const startupDelayMs = Minutes(30) + Math.floor(Math.random() * Minutes(30));
        super('time-sync-resync', startupDelayMs, RESYNC_INTERVAL);
        this.#connector = connector;
    }

    /**
     * Register a node for time sync if it has the TimeSynchronization cluster.
     * Call this after a node connects and its attributes are available.
     * Immediate sync is skipped during the startup window to avoid traffic while
     * the adapter is initializing all nodes.
     */
    registerNode(peer: PeerAddress, capabilities: TimeSyncCapabilities): void {
        if (!capabilities.supported) {
            this.unregisterNode(peer);
            return;
        }

        if (this.registerPeer(peer)) {
            logger.info(`Registered node ${formatNodeId(peer)} for time synchronization`);
        }

        // Only sync immediately if the startup window has elapsed. During startup,
        // the first periodic resync handles all nodes once NTP has stabilized.
        if (this.#startupComplete) {
            this.syncNode(peer);
        }

        this.scheduleIfNeeded();
    }

    /**
     * Unregister a node from time sync tracking.
     */
    unregisterNode(peer: PeerAddress): void {
        this.#lastTriggerSyncMs.delete(peer);
        if (this.unregisterPeer(peer)) {
            logger.info(`Unregistered node ${formatNodeId(peer)} from time synchronization`);
        }
    }

    /**
     * Trigger an immediate time sync for a node (fire-and-forget with deduplication).
     * Called externally when a timeFailure event is received from the node.
     */
    syncNode(peer: PeerAddress): void {
        if (this.closed || !this.hasPeer(peer) || !this.#connector.nodeConnected(peer)) {
            return;
        }
        if (this.#inFlightSyncs.has(peer)) {
            logger.debug(`Time sync already in progress for node ${formatNodeId(peer)}, skipping`);
            return;
        }
        const lastSync = this.#lastTriggerSyncMs.get(peer);
        if (lastSync !== undefined && Time.nowMs - lastSync < TRIGGER_SYNC_COOLDOWN) {
            logger.debug(
                `Time sync for node ${formatNodeId(peer)} skipped, within ${Duration.format(TRIGGER_SYNC_COOLDOWN)} cooldown`,
            );
            return;
        }
        this.#lastTriggerSyncMs.set(peer, Time.nowMs);
        const promise = this.#connector
            .syncTime(peer)
            .then(() => logger.info(`Synced time on node ${formatNodeId(peer)}`))
            .catch(error => logSyncFailure('', peer, error))
            .finally(() => {
                this.#inFlightSyncs.delete(peer);
            });
        this.#inFlightSyncs.set(peer, promise);
    }

    /** For testing: advance past the startup window to enable immediate syncs. */
    completeStartup(): void {
        this.#startupComplete = true;
    }

    override async stop(): Promise<void> {
        await super.stop();
        await Promise.allSettled(this.#inFlightSyncs.values());
        this.#inFlightSyncs.clear();
        this.#lastTriggerSyncMs.clear();
        logger.info('Time sync manager stopped');
    }

    protected override shouldProcess(peer: PeerAddress): boolean {
        return this.#connector.nodeConnected(peer) && !this.#inFlightSyncs.has(peer);
    }

    protected override async processNode(peer: PeerAddress): Promise<void> {
        // Register in #inFlightSyncs so a concurrent trigger sync (syncNode) for the same
        // peer dedupes against the periodic push instead of double-sending.
        const promise = this.#connector
            .syncTime(peer)
            .then(() => logger.info(`Periodic resync: synced time on node ${formatNodeId(peer)}`))
            .catch(error => logSyncFailure('Periodic resync: ', peer, error))
            .finally(() => {
                this.#inFlightSyncs.delete(peer);
            });
        this.#inFlightSyncs.set(peer, promise);
        await promise;
    }

    protected override onCycleComplete(processedCount: number, _intervalFormatted: string): void {
        if (!this.#startupComplete) {
            this.#startupComplete = true;
            logger.info('Time sync startup window complete, immediate syncs enabled on reconnect');
        }
        if (processedCount > 0) {
            logger.info(
                `Periodic resync complete: synced ${processedCount} nodes. Next resync in ${Duration.format(RESYNC_INTERVAL)}`,
            );
        }
    }
}
