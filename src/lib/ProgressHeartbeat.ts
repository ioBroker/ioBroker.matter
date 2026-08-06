/**
 * Minimal timer surface a `ProgressHeartbeat` needs, satisfied by `MatterAdapter` and easy to fake in
 * tests. `Handle` is generic so it fits both `ioBroker.Timeout` and a plain `NodeJS.Timeout` from a fake
 * scheduler without either side needing a type cast.
 */
export interface HeartbeatScheduler<Handle> {
    setTimeout(cb: () => void, timeoutMs: number): Handle;
    clearTimeout(timer: Handle): void;
}

/**
 * Repeats a caller-supplied tick (typically a dm-utils progress `update()`) on a fixed interval while a
 * long-running action is awaited. dm-gui-components' GUI arms a fresh "backend not responding" timer on
 * every progress round-trip and falls back to 5 s once the first one has passed, so without a steady
 * stream of updates it flags the backend as gone even though the action is still progressing normally.
 *
 * Ticks are strictly sequential: the next one is only scheduled after the previous tick's promise has
 * settled, so callers can rely on never seeing two ticks - or a tick and a `stop()` - in flight together.
 * Single-use: `start()` after the first call, or once `stop()` has been called, is a no-op - create a new
 * instance per operation.
 */
export class ProgressHeartbeat<Handle> {
    readonly #scheduler: HeartbeatScheduler<Handle>;
    readonly #intervalMs: number;
    readonly #tick: () => Promise<void>;
    #timer: Handle | undefined;
    #started = false;
    #stopped = false;
    #settled: Promise<void> = Promise.resolve();

    constructor(scheduler: HeartbeatScheduler<Handle>, intervalMs: number, tick: () => Promise<void>) {
        this.#scheduler = scheduler;
        this.#intervalMs = intervalMs;
        this.#tick = tick;
    }

    /** A second `start()` call - e.g. from a careless caller of both this and `run()` - would otherwise arm a second, untracked timer chain that `stop()` cannot reach. */
    start(): void {
        if (this.#started || this.#stopped) {
            return;
        }
        this.#started = true;
        this.#scheduleNext();
    }

    /**
     * Runs `action` with the heartbeat ticking, then unwinds in the order a single-slot message channel
     * requires: `onSettle` first, then the heartbeat fully stopped, and only then `close` - whether or not
     * `action` threw. If stopping the heartbeat hangs (its last tick's ack never arrives), `close` is never
     * reached; that is the same class of hang `close` itself is already exposed to on a dead channel, just
     * surfacing one step earlier.
     */
    async run(
        action: () => Promise<void>,
        onSettle: () => void,
        close: () => Promise<void>,
    ): Promise<{ failed: boolean; error: unknown }> {
        this.start();
        let failed = false;
        let error: unknown;
        try {
            try {
                await action();
            } finally {
                // Nested so a throwing `onSettle` cannot skip `stop()` - a plain sibling statement in the
                // same `finally` would abort right there, per JS `finally`-block semantics.
                try {
                    onSettle();
                } finally {
                    await this.stop();
                }
            }
        } catch (caught) {
            failed = true;
            error = caught;
        }
        try {
            await close();
        } catch (caught) {
            // A failure here must still surface as `failed`, but must not discard an `action` failure
            // already captured above.
            if (!failed) {
                failed = true;
                error = caught;
            }
        }
        return { failed, error };
    }

    /**
     * Stops scheduling further ticks and waits out one already in flight, so the caller can safely follow
     * with another message on the same channel (e.g. `progress.close()`). If that in-flight tick never
     * settles (its GUI ack never arrives), this call hangs with it - no worse than the same channel's
     * `close()` hanging under the same condition.
     */
    async stop(): Promise<void> {
        this.#stopped = true;
        if (this.#timer !== undefined) {
            this.#scheduler.clearTimeout(this.#timer);
            this.#timer = undefined;
        }
        await this.#settled;
    }

    #scheduleNext(): void {
        if (this.#stopped) {
            return;
        }
        this.#timer = this.#scheduler.setTimeout(() => {
            this.#timer = undefined;
            this.#settled = this.#runTick();
        }, this.#intervalMs);
    }

    async #runTick(): Promise<void> {
        try {
            await this.#tick();
        } catch {
            // A failed heartbeat update must not fail the device operation it accompanies.
        }
        this.#scheduleNext();
    }
}
