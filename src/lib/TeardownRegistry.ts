/** Return value is ignored; a returned promise is awaited, so fluent APIs like `EventEmitter.off` fit directly. */
export type TeardownAction = () => unknown;

/**
 * Collects undo actions next to the code that registers the thing being undone, so one `close()` releases
 * everything a component acquired.
 *
 * Registering the undo at the registration site is the point: a hand-written `destroy()` that enumerates fields
 * drifts out of sync with the registrations it is supposed to mirror, and the resulting leak is invisible because
 * the component keeps working.
 */
export class TeardownRegistry {
    readonly #actions = new Array<TeardownAction>();
    readonly #onError: (error: Error) => void;
    #closed = false;

    constructor(onError: (error: Error) => void) {
        this.#onError = onError;
    }

    get closed(): boolean {
        return this.#closed;
    }

    get size(): number {
        return this.#actions.length;
    }

    /** Register an undo action. Runs it right away if this registry is already closed. */
    add(action: TeardownAction): void {
        if (this.#closed) {
            void this.#run(action);
            return;
        }
        this.#actions.push(action);
    }

    /**
     * Run every registered action, most recently registered first, and reject further registration.
     *
     * A throwing action must not strand the actions after it, so each one is isolated.
     */
    async close(): Promise<void> {
        this.#closed = true;
        while (this.#actions.length) {
            await this.#run(this.#actions.pop()!);
        }
    }

    async #run(action: TeardownAction): Promise<void> {
        try {
            await action();
        } catch (error) {
            try {
                this.#onError(error instanceof Error ? error : new Error(String(error)));
            } catch {
                // Reporting a failure must not become one
            }
        }
    }
}
