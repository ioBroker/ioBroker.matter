import { Descriptor } from '@matter/main/clusters';
import type { ClusterId } from '@matter/main';

const DEVICE_TYPE_LIST: keyof Descriptor.Attributes = 'deviceTypeList';

/**
 * Whether an attribute update changes what the ioBroker structure of a node is built from, in a way the endpoint
 * lifecycle does not report.
 *
 * Only the Descriptor `deviceTypeList` qualifies: matter.js updates the type of an existing endpoint in place, so
 * no lifecycle change follows. The other attributes a node's shape depends on need no check here:
 * - `partsList` and `serverList` already raise `PartsReady`, `Destroyed` or `ServersChanged`.
 * - `clientList` is not read by the mapping.
 * - BasicInformation and BridgedDeviceBasicInformation only name objects when they are first created, and a
 *   rebuild keeps the names of existing objects.
 *
 * `properties` is the list of a ChangeNotificationService update; without one, every property may have changed.
 */
export function changesNodeStructure(clusterId: ClusterId, properties: readonly string[] | undefined): boolean {
    if (clusterId !== Descriptor.id) {
        return false;
    }
    return properties === undefined || properties.includes(DEVICE_TYPE_LIST);
}

/** The timer functions {@link StructureRebuildTimer} uses, so tests can drive the timing. */
export interface RebuildTimerHost<Handle> {
    /** Monotonic time in milliseconds. */
    now(): number;
    /** Returns `undefined` when no timer can be started, for example while the adapter stops. */
    setTimeout(callback: () => void, ms: number): Handle | undefined;
    clearTimeout(handle: Handle): void;
}

/** The waits of a {@link StructureRebuildTimer}. */
export interface StructureRebuildTiming {
    /** How long after the first change, or after the last completed report batch, the rebuild waits. */
    settleMs: number;
    /** Latest time of the rebuild, counted from the first change. */
    maxDeferralMs: number;
}

const DEFAULT_TIMING: StructureRebuildTiming = { settleMs: 2_000, maxDeferralMs: 10_000 };

/**
 * Decides when the ioBroker structure of one peer is rebuilt after its structure changed.
 *
 * A structure change is seen while its report batch is still being applied, and a bridge can report new endpoints
 * across several batches. So the rebuild waits until the reports settle: every sign of life of the peer's subscription,
 * a completed report batch or an empty keepalive, restarts the `settleMs` window. The rebuild runs at the latest `maxDeferralMs` after the first change, so a peer that reports
 * all the time cannot postpone it. Without any further report it runs `settleMs` after the first change.
 *
 * Changes while a rebuild is pending join it, so `run` is called once per burst, from the timer.
 */
export class StructureRebuildTimer<Handle> {
    readonly #host: RebuildTimerHost<Handle>;
    readonly #run: () => void;
    readonly #timing: StructureRebuildTiming;
    #timer?: Handle;
    #deadline?: number;

    constructor(host: RebuildTimerHost<Handle>, run: () => void, timing = DEFAULT_TIMING) {
        this.#host = host;
        this.#run = run;
        this.#timing = timing;
    }

    get pending(): boolean {
        return this.#deadline !== undefined;
    }

    /** A structure change of the peer was seen. */
    changed(): void {
        if (this.#deadline !== undefined) {
            return;
        }
        this.#deadline = this.#host.now() + this.#timing.maxDeferralMs;
        this.#start(this.#timing.settleMs);
    }

    /** The peer's subscription reported or sent a keepalive. Extends a pending rebuild only. */
    reportCompleted(): void {
        if (this.#deadline === undefined) {
            return;
        }
        this.#stopTimer();
        this.#start(Math.min(this.#timing.settleMs, this.#deadline - this.#host.now()));
    }

    cancel(): void {
        this.#stopTimer();
        this.#deadline = undefined;
    }

    #start(ms: number): void {
        this.#timer = this.#host.setTimeout(() => {
            this.#timer = undefined;
            this.#deadline = undefined;
            this.#run();
        }, ms);
        if (this.#timer === undefined) {
            this.#deadline = undefined;
        }
    }

    #stopTimer(): void {
        if (this.#timer !== undefined) {
            this.#host.clearTimeout(this.#timer);
            this.#timer = undefined;
        }
    }
}
