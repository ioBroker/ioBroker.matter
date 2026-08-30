/**
 * Minimal ioBroker adapter stand-in for the controller mapping path: it records objects and states in memory so a
 * test can assert what `ioBrokerDeviceFabric` produced.
 */

import { SubscribeManager } from '../../src/lib/SubscribeManager';

export class MockControllerAdapter {
    readonly namespace = 'matter.0';
    readonly objects = new Map<string, ioBroker.AnyObject>();
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

    async getObjectAsync(id: string): Promise<ioBroker.AnyObject | null> {
        return this.objects.get(this.#shortId(id)) ?? null;
    }

    async getForeignObjectAsync(id: string): Promise<ioBroker.AnyObject | null> {
        return this.objects.get(this.#shortId(id)) ?? null;
    }

    async extendObjectAsync(id: string, obj: Partial<ioBroker.AnyObject>): Promise<void> {
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
            _id: key,
            common,
            native: { ...(existing?.native ?? {}), ...(obj.native ?? {}) },
        } as ioBroker.AnyObject);
    }

    async setObjectNotExists(id: string, obj: ioBroker.SettableObject): Promise<void> {
        const key = this.#shortId(id);
        if (!this.objects.has(key)) {
            this.objects.set(key, { ...obj, _id: key } as unknown as ioBroker.AnyObject);
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

    valueOf(baseId: string, name: string): unknown {
        return this.states.get(`${this.#shortId(baseId)}.${name}`)?.val;
    }
}
