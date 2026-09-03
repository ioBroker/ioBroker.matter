/**
 * Minimal ioBroker adapter stand-in for the controller mapping path: it records objects and states in memory so a
 * test can assert what `ioBrokerDeviceFabric` produced.
 */

import { SubscribeManager } from '../../src/lib/SubscribeManager';

export class MockControllerAdapter {
    readonly namespace = 'matter.0';
    readonly objects = new Map<string, ioBroker.Object>();
    readonly states = new Map<string, ioBroker.State>();
    readonly errors = new Array<string>();
    readonly #timers = new Set<NodeJS.Timeout>();

    readonly log = {
        silly: (): void => {},
        debug: (): void => {},
        info: (): void => {},
        warn: (): void => {},
        error: (message: string): void => {
            this.errors.push(message);
        },
    };

    #shortId(id: string): string {
        return id.startsWith(`${this.namespace}.`) ? id.substring(this.namespace.length + 1) : id;
    }

    /** Objects are keyed by their short id but carry the full id, the way js-controller reports them. */
    #fullId(shortId: string): string {
        return `${this.namespace}.${shortId}`;
    }

    async getObjectAsync(id: string): Promise<ioBroker.Object | null> {
        return this.objects.get(this.#shortId(id)) ?? null;
    }

    async getForeignObjectAsync(id: string): Promise<ioBroker.Object | null> {
        return this.objects.get(this.#shortId(id)) ?? null;
    }

    async extendObjectAsync(id: string, obj: Partial<ioBroker.Object>): Promise<void> {
        const key = this.#shortId(id);
        const existing = this.objects.get(key);
        const common = { ...(existing?.common ?? {}), ...(obj.common ?? {}) };
        for (const [name, value] of Object.entries(common)) {
            if (value === undefined) {
                delete (common as Record<string, unknown>)[name];
            }
        }
        this.objects.set(key, {
            ...(existing ?? {}),
            ...obj,
            _id: this.#fullId(key),
            common,
            native: { ...(existing?.native ?? {}), ...(obj.native ?? {}) },
        } as ioBroker.Object);
    }

    async setObjectNotExists(id: string, obj: ioBroker.SettableObject): Promise<void> {
        const key = this.#shortId(id);
        if (!this.objects.has(key)) {
            this.objects.set(key, { ...obj, _id: this.#fullId(key) } as unknown as ioBroker.Object);
        }
    }

    async delObjectAsync(id: string, options?: { recursive?: boolean }): Promise<void> {
        const key = this.#shortId(id);
        this.objects.delete(key);
        this.states.delete(key);
        if (options?.recursive !== true) {
            return;
        }
        const prefix = `${key}.`;
        for (const existing of [...this.objects.keys()]) {
            if (existing.startsWith(prefix)) {
                this.objects.delete(existing);
            }
        }
        for (const existing of [...this.states.keys()]) {
            if (existing.startsWith(prefix)) {
                this.states.delete(existing);
            }
        }
    }

    async setState(id: string, state: ioBroker.SettableState | ioBroker.StateValue): Promise<void> {
        await this.setForeignStateAsync(id, state as ioBroker.StateValue);
    }

    async setForeignStateAsync(id: string, value: unknown, ack?: boolean): Promise<void> {
        const key = this.#shortId(id);
        const state =
            typeof value === 'object' && value !== null && 'val' in value
                ? ({ ack: true, ts: Date.now(), ...(value as object) } as ioBroker.State)
                : ({ val: value as ioBroker.StateValue, ack: ack ?? true, ts: Date.now() } as ioBroker.State);
        this.states.set(key, state);
        await SubscribeManager.observer(key, state);
    }

    /**
     * Object view over the recorded objects, so the ioBroker type detector can run over what the controller
     * mapping created. Ids are returned namespace-prefixed, the way js-controller reports them.
     */
    async getObjectViewAsync(
        _design: string,
        search: string,
        params: { startkey?: string; endkey?: string } | null,
    ): Promise<{ rows: { id: string; value: ioBroker.Object }[] }> {
        const startkey = this.#shortId(params?.startkey ?? '');
        const endkey = this.#shortId(params?.endkey ?? '\u9999');
        const rows = [...this.objects.entries()]
            .filter(([id, obj]) => obj.type === search && id >= startkey && id <= endkey)
            .map(([id, obj]) => ({ id: this.#fullId(id), value: obj }))
            .sort((a, b) => (a.id < b.id ? -1 : 1));
        return { rows };
    }

    async getForeignStateAsync(id: string): Promise<ioBroker.State | null> {
        return this.states.get(this.#shortId(id)) ?? null;
    }

    async subscribeForeignStatesAsync(): Promise<void> {}
    async unsubscribeForeignStatesAsync(): Promise<void> {}
    subscribeStates(): void {}
    unsubscribeStates(): void {}
    refreshControllerDevices(): void {}

    setTimeout(callback: () => void, ms: number): NodeJS.Timeout {
        const timer = setTimeout(() => {
            this.#timers.delete(timer);
            callback();
        }, ms);
        this.#timers.add(timer);
        return timer;
    }

    clearTimeout(timer: NodeJS.Timeout | undefined): void {
        if (timer) {
            this.#timers.delete(timer);
            clearTimeout(timer);
        }
    }

    /** Converters install repeating attribute polls; left running they fire against a closed controller. */
    clearAllTimers(): void {
        for (const timer of this.#timers) {
            clearTimeout(timer);
        }
        this.#timers.clear();
    }

    /** All state ids created below `baseId`, relative to it. */
    statesBelow(baseId: string): string[] {
        const prefix = `${this.#shortId(baseId)}.`;
        return [...this.objects.entries()]
            .filter(([id, obj]) => id.startsWith(prefix) && obj.type === 'state')
            .map(([id]) => id.substring(prefix.length))
            .sort();
    }

    /** All object ids at or below `baseId`, relative to the namespace. */
    objectsBelow(baseId: string): string[] {
        const key = this.#shortId(baseId);
        const prefix = `${key}.`;
        return [...this.objects.keys()].filter(id => id === key || id.startsWith(prefix)).sort();
    }

    valueOf(baseId: string, name: string): unknown {
        return this.states.get(`${this.#shortId(baseId)}.${name}`)?.val;
    }
}
