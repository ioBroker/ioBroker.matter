/**
 * Handles time synchronization for nodes with the TimeSynchronization cluster.
 * Syncs time on three triggers:
 * 1. Node connects/reconnects after startup (immediate, once startup window has elapsed)
 * 2. Periodic resync every 24 hours, brought forward when the host zone changes offset sooner
 * 3. Reactive resync when a node emits a timeFailure event (driven externally via syncNode()),
 *    held off far more briefly than a reconnect because the node is asking to be given a time
 *
 * A startup window scaled to the number of commissioned nodes prevents syncing while nodes are
 * still being initialized, including on the reactive path: a restart can leave many nodes without
 * a time at once, and answering each one individually is the traffic the window exists to avoid.
 * This manager must only be enabled when the host time source is known to be reliable.
 *
 * Mirrored from matter-js/matterjs-server `packages/ws-controller/src/controller/TimeSyncManager.ts`;
 * the upstream raw attribute cache is replaced by {@link TimeSyncCapabilities}.
 */

import { Duration, type Endpoint, Hours, Logger, Millis, Minutes, Seconds, Time } from '@matter/main';
import { TimeSynchronizationClient } from '@matter/main/behaviors';
import { TimeSynchronization } from '@matter/main/clusters';
import { type PeerAddress, PeerAddressMap } from '@matter/main/protocol';
import { StatusResponseError } from '@matter/main/types';
import { nextOffsetChangeMs, resolveHostTimeZone, timeZonePlan } from './hostTimeZone';
import { MAX_TIMER_DELAY_MS, NodeProcessor } from './NodeProcessor';

const logger = Logger.get('TimeSyncManager');

/** TimeSynchronization cluster ID (0x0038 = 56 decimal) */
export const TIME_SYNC_CLUSTER_ID = 0x0038;

/** timeFailure event ID within the TimeSynchronization cluster */
export const TIME_FAILURE_EVENT_ID = 0x03;

/** Periodic resync interval: 24 hours */
const RESYNC_INTERVAL = Hours(24);

// Startup window, scaled to the node count: nodes initialize at roughly 10 per minute, so this
// clears initialization before the first sync without idling on small installations.
const STARTUP_BASE_DELAY = Minutes(3);
const STARTUP_DELAY_PER_NODE = Seconds(10);

// Land past an upcoming offset change rather than on it, so the cycle sees the post-change zone
// state and replaces any DST entry the node has just retired.
const POST_CHANGE_MARGIN = Minutes(1);
// Floor for a brought-forward cycle. A future change already clears it via POST_CHANGE_MARGIN; this
// catches a lookup returning an instant that has already passed, which would otherwise fire at once.
const MIN_ACCELERATED_DELAY = Minutes(1);

// Minimum spacing between reconnect-driven syncs for one peer. A reconnect says nothing about
// whether the node's time is still good, so a flapping node must not storm setUtcTime.
const RECONNECT_SYNC_COOLDOWN = Hours(24);

// A timeFailure event is the node reporting it has no usable time, so it is answered on a much
// shorter leash than a reconnect. The spec rate-limits the node to one such event per hour
// (§11.17.10.4), which already bounds this path without a long cooldown of our own.
const TIME_FAILURE_SYNC_COOLDOWN = Hours(1);

/** Why a sync was triggered outside the periodic cycle. Decides how long the peer is then held off. */
export enum SyncTrigger {
    /** The node reconnected; its time may well still be correct. */
    Reconnect = 'reconnect',
    /** The node reported it has no usable time and is asking to be given one. */
    TimeFailure = 'timeFailure',
}

export interface TimeSyncConnector {
    syncTime(peer: PeerAddress): Promise<void>;
    nodeConnected(peer: PeerAddress): boolean;
    commissionedNodeCount(): number;
}

/** Instant of the host zone's next offset change, or null when none is in view. */
export type OffsetChangeLookup = (fromMs: number) => number | null;

/**
 * Delay before the first sync, long enough for node initialization to finish. Capped so the value
 * reported to the log is the one the timer can actually be given.
 */
export function startupDelayMs(commissionedNodeCount: number): number {
    return Math.min(STARTUP_BASE_DELAY + commissionedNodeCount * STARTUP_DELAY_PER_NODE, MAX_TIMER_DELAY_MS);
}

/**
 * Delay before the next periodic cycle: normally the full interval, brought forward to a minute past
 * an upcoming offset change so a node's retired DST entry is replaced promptly. An instant that has
 * already passed, or one beyond the interval, leaves the cadence alone.
 */
export function resyncDelayMs(nowMs: number, nextChangeMs: number | null): number {
    if (nextChangeMs === null || !Number.isFinite(nextChangeMs)) {
        return RESYNC_INTERVAL;
    }
    const delay = nextChangeMs + POST_CHANGE_MARGIN - nowMs;
    return delay < MIN_ACCELERATED_DELAY || delay >= RESYNC_INTERVAL ? RESYNC_INTERVAL : delay;
}

const defaultOffsetChangeLookup: OffsetChangeLookup = fromMs => {
    const zone = resolveHostTimeZone();
    // A node with less capacity cannot surface a nearer boundary than the cluster maxima do.
    return nextOffsetChangeMs(timeZonePlan(zone, fromMs, { maxRegimes: 2, maxWindows: 2 }), fromMs);
};

/** What a node supports of the TimeSynchronization cluster, read from its root endpoint. */
export interface TimeSyncCapabilities {
    /** The node exposes the TimeSynchronization cluster. */
    supported: boolean;
    /** The node exposes the TimeZone feature, so SetTimeZone/SetDstOffset are supported. */
    timeZone: boolean;
    /** DSTOffsetListMaxSize when the node advertises it. */
    dstOffsetListMaxSize?: number;
    /** TimeZoneListMaxSize when the node advertises it. */
    timeZoneListMaxSize?: number;
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
        timeZoneListMaxSize: typeof state.timeZoneListMaxSize === 'number' ? state.timeZoneListMaxSize : undefined,
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
    readonly #offsetChangeLookup: OffsetChangeLookup;
    readonly #startupDelay: (commissionedNodeCount: number) => number;
    // Tracks in-flight immediate syncs per node to prevent parallel syncs
    #inFlightSyncs = new PeerAddressMap<Promise<void>>();
    // Last attempt per node, kept per trigger: a reconnect attempt must not spend the shorter leash
    // a timeFailure is entitled to, least of all when that attempt failed.
    #lastReconnectSyncMs = new PeerAddressMap<number>();
    #lastTimeFailureSyncMs = new PeerAddressMap<number>();
    // Successful syncs in the running cycle; the base class counts attempts.
    #cycleSyncedCount = 0;
    // True after the first periodic resync cycle, enabling immediate syncs on reconnect
    #startupComplete = false;

    // startupDelay is only overridden by tests, which cannot wait out the real startup window.
    constructor(
        connector: TimeSyncConnector,
        offsetChangeLookup: OffsetChangeLookup = defaultOffsetChangeLookup,
        startupDelay: (commissionedNodeCount: number) => number = startupDelayMs,
    ) {
        super('time-sync-resync', startupDelay(0), RESYNC_INTERVAL);
        this.#connector = connector;
        this.#offsetChangeLookup = offsetChangeLookup;
        this.#startupDelay = startupDelay;
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
        // the first periodic resync handles all nodes once initialization is done.
        if (this.#startupComplete) {
            this.syncNode(peer);
        } else if (this.cycleDelayAdjustable) {
            // The controller resolves the full commissioned list before attaching any of it, so
            // the first registration already sees the final count.
            let nodeCount = 0;
            try {
                nodeCount = this.#connector.commissionedNodeCount();
            } catch (error) {
                // Scaling the delay is an optimization; it must not abort the node's registration.
                logger.warn('Could not determine the commissioned node count:', error);
            }
            const delay = this.#startupDelay(nodeCount);
            if (this.setNextCycleDelay(delay)) {
                logger.info(`First time synchronization in ${Duration.format(Millis(delay))}`);
            }
        }

        this.scheduleIfNeeded();
    }

    /**
     * Unregister a node from time sync tracking.
     */
    unregisterNode(peer: PeerAddress): void {
        this.#lastReconnectSyncMs.delete(peer);
        this.#lastTimeFailureSyncMs.delete(peer);
        if (this.unregisterPeer(peer)) {
            logger.info(`Unregistered node ${formatNodeId(peer)} from time synchronization`);
        }
    }

    /**
     * Trigger an immediate time sync for a node (fire-and-forget with deduplication).
     * Called externally when a timeFailure event is received from the node.
     */
    syncNode(peer: PeerAddress, trigger = SyncTrigger.Reconnect): void {
        if (this.closed || !this.hasPeer(peer) || !this.#connector.nodeConnected(peer)) {
            return;
        }
        if (!this.#startupComplete) {
            // Nodes are still being initialized; the first periodic cycle covers every peer shortly.
            logger.debug(`Time sync for node ${formatNodeId(peer)} deferred to the first periodic cycle`);
            return;
        }
        if (this.#inFlightSyncs.has(peer)) {
            logger.debug(`Time sync already in progress for node ${formatNodeId(peer)}, skipping`);
            return;
        }
        const { cooldown, stamps } =
            trigger === SyncTrigger.TimeFailure
                ? { cooldown: TIME_FAILURE_SYNC_COOLDOWN, stamps: this.#lastTimeFailureSyncMs }
                : { cooldown: RECONNECT_SYNC_COOLDOWN, stamps: this.#lastReconnectSyncMs };
        const lastSync = stamps.get(peer);
        if (lastSync !== undefined && Time.nowMs - lastSync < cooldown) {
            logger.debug(
                `Time sync for node ${formatNodeId(peer)} skipped, within ${Duration.format(cooldown)} ${trigger} cooldown`,
            );
            return;
        }
        stamps.set(peer, Time.nowMs);
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
        this.#lastReconnectSyncMs.clear();
        this.#lastTimeFailureSyncMs.clear();
        logger.info('Time sync manager stopped');
    }

    protected override shouldProcess(peer: PeerAddress): boolean {
        return this.#connector.nodeConnected(peer) && !this.#inFlightSyncs.has(peer);
    }

    /**
     * Bring the next cycle forward to just after the host zone's next offset change. Nodes apply the
     * change themselves from the DST list they already hold; resyncing refreshes a list whose final
     * entry has just expired, which a node is otherwise entitled to discard entirely.
     */
    protected override nextCycleDelay(): Duration {
        const nowMs = Time.nowMs;
        let nextChangeMs: number | null = null;
        try {
            nextChangeMs = this.#offsetChangeLookup(nowMs);
        } catch (error) {
            // Bringing the cycle forward is an optimization; the zone lookup rests on Intl and the
            // host's zone name, neither of which is worth a missed resync.
            logger.warn('Could not determine the next time zone offset change:', error);
        }
        return Millis(resyncDelayMs(nowMs, nextChangeMs));
    }

    protected override async processNode(peer: PeerAddress): Promise<void> {
        // Register in #inFlightSyncs so a concurrent trigger sync (syncNode) for the same
        // peer dedupes against the periodic push instead of double-sending.
        const promise = this.#connector
            .syncTime(peer)
            .then(() => {
                this.#cycleSyncedCount++;
                logger.info(`Periodic resync: synced time on node ${formatNodeId(peer)}`);
            })
            .catch(error => logSyncFailure('Periodic resync: ', peer, error))
            .finally(() => {
                this.#inFlightSyncs.delete(peer);
            });
        this.#inFlightSyncs.set(peer, promise);
        await promise;
    }

    protected override onCycleStart(): void {
        this.#cycleSyncedCount = 0;
        if (!this.#startupComplete) {
            // Opening the window here, not on completion: a node registering mid-cycle is absent from
            // the peer snapshot, so it needs the immediate-sync path to be available already.
            this.#startupComplete = true;
            logger.info('Time sync startup window complete, immediate syncs enabled on reconnect');
        }
    }

    protected override onCycleComplete(processedCount: number, intervalFormatted: string): void {
        if (processedCount > 0) {
            logger.info(
                `Periodic resync complete: synced ${this.#cycleSyncedCount} of ${processedCount} nodes. ` +
                    `Next resync in ${intervalFormatted}`,
            );
        }
    }
}
