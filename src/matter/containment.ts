/**
 * Wraps a handler for a matter.js observable so a synchronous exception cannot escape into the emitter.
 *
 * `Observable.emit()` rethrows what an observer throws and skips the observers behind it, so one faulty handler
 * would starve every other listener of the same observable, matter.js's own included. Only synchronous throws are
 * contained; a handler that returns a promise has to catch its own rejections.
 *
 * @param handler the observer body
 * @param onError receives whatever the handler threw
 */
export function contained<Args extends unknown[]>(
    handler: (...args: Args) => void,
    onError: (error: unknown) => void,
): (...args: Args) => void {
    return (...args) => {
        try {
            handler(...args);
        } catch (error) {
            onError(error);
        }
    };
}

/** One step of a shutdown that {@link runShutdownSteps} runs whether or not the steps before it failed. */
export interface ShutdownStep {
    /** Names the step in the error report. */
    what: string;
    run: () => unknown;
}

/**
 * Runs the steps one after the other and keeps going when one fails, because every skipped step leaves a
 * resource open (sockets, storage locks, timers) that a restart of the same component then collides with.
 *
 * @param steps the steps in the order to run them
 * @param onError called once per failed step
 */
export async function runShutdownSteps(
    steps: Iterable<ShutdownStep>,
    onError: (what: string, error: unknown) => void,
): Promise<void> {
    for (const { what, run } of steps) {
        try {
            await run();
        } catch (error) {
            onError(what, error);
        }
    }
}
