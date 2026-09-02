import { readFileSync } from 'node:fs';

import { SubscribeManager } from '../../src/lib/SubscribeManager';

export type ObjectMap = Record<string, ioBroker.Object>;

/** The device layer writes either a bare value or a state object; both reach the adapter as `unknown`. */
function isStateObject(value: unknown): value is ioBroker.SettableState {
    return typeof value === 'object' && value !== null && 'val' in value;
}

/**
 * Adapter stand-in that serves a fixed ioBroker object tree and keeps state values in memory.
 *
 * Alias states are resolved the way js-controller does it: the value lives on the alias target, and a
 * change to the target is reported to every alias pointing at it. Only id aliases are supported - a
 * `read`/`write` conversion function throws instead of being silently ignored, so a fixture that starts
 * using one fails loudly.
 */
export class MockObjectAdapter {
    readonly namespace = 'matter.0';
    readonly log = {
        silly: (): void => {},
        debug: (): void => {},
        info: (message: string): void => {
            this.infos.push(message);
        },
        warn: (message: string): void => {
            this.warnings.push(message);
        },
        error: (message: string): void => {
            this.errors.push(message);
        },
    };
    readonly infos = new Array<string>();
    readonly warnings = new Array<string>();
    readonly errors = new Array<string>();

    readonly #objects: ObjectMap;
    readonly #values = new Map<string, ioBroker.State>();
    /** Alias targets to the alias ids reporting them, so a target change reaches every alias. */
    readonly #aliasesByTarget = new Map<string, string[]>();
    readonly #timers = new Set<NodeJS.Timeout>();

    constructor(objects: ObjectMap) {
        this.#objects = objects;
        for (const id of Object.keys(objects)) {
            const target = this.#aliasTargetOf(id);
            if (target) {
                const existing = this.#aliasesByTarget.get(target);
                if (existing) {
                    existing.push(id);
                } else {
                    this.#aliasesByTarget.set(target, [id]);
                }
            }
        }
    }

    #aliasTargetOf(id: string): string | undefined {
        const object = this.#objects[id];
        const alias = object?.type === 'state' ? object.common.alias : undefined;
        if (!alias) {
            return undefined;
        }
        if (typeof alias.id !== 'string') {
            throw new Error(`Alias ${id} uses a read/write id pair, which the mock does not model`);
        }
        if (alias.read !== undefined || alias.write !== undefined) {
            throw new Error(`Alias ${id} uses a conversion function, which the mock does not model`);
        }
        return alias.id;
    }

    /** Follows the alias chain to the object actually holding the value. */
    resolveId(id: string): string {
        const seen = new Set<string>();
        let current = id;
        let target = this.#aliasTargetOf(current);
        while (target) {
            if (seen.has(target)) {
                throw new Error(`Alias cycle at ${id}`);
            }
            seen.add(target);
            current = target;
            target = this.#aliasTargetOf(current);
        }
        return current;
    }

    /** The object as the adapter sees it. Cloned so neither the detector nor a device can edit the fixture. */
    async getForeignObjectAsync(id: string): Promise<ioBroker.Object | null> {
        const object = this.#objects[id];
        return object ? structuredClone(object) : null;
    }

    async getObjectViewAsync(
        _design: string,
        search: string,
        params: { startkey?: string; endkey?: string } | null,
    ): Promise<{ rows: { id: string; value: ioBroker.Object }[] }> {
        const startkey = params?.startkey ?? '';
        const endkey = params?.endkey ?? '\u9999';
        const rows = Object.keys(this.#objects)
            .filter(id => this.#objects[id].type === search && id >= startkey && id <= endkey)
            .sort()
            .map(id => ({ id, value: structuredClone(this.#objects[id]) }));
        return { rows };
    }

    async getForeignStateAsync(id: string): Promise<ioBroker.State | null> {
        const target = this.resolveId(id);
        const existing = this.#values.get(target);
        if (existing) {
            return existing;
        }
        const object = this.#objects[target];
        if (object?.type !== 'state') {
            return null;
        }
        const common = object.common;
        const state = {
            val: common.def ?? (common.type === 'boolean' ? false : common.type === 'number' ? 0 : ''),
            ack: true,
            ts: Date.now(),
        } as ioBroker.State;
        this.#values.set(target, state);
        return state;
    }

    async setForeignStateAsync(id: string, value: unknown): Promise<void> {
        const val = isStateObject(value) ? value.val : (value as ioBroker.StateValue);
        this.#values.set(this.resolveId(id), { val, ack: false, ts: Date.now() } as ioBroker.State);
    }

    /** Presets a value as if the device had reported it, without notifying anybody. */
    seedValue(id: string, val: unknown): void {
        this.#values.set(this.resolveId(id), { val, ack: true, ts: Date.now() } as ioBroker.State);
    }

    /** The value the adapter would have written, read back without going through an alias. */
    rawValueOf(id: string): ioBroker.State | undefined {
        return this.#values.get(id);
    }

    /** Simulates an acked value arriving from the device, awaiting the full subscription handler chain. */
    async pushValue(id: string, val: unknown): Promise<void> {
        const target = this.resolveId(id);
        const state = { val, ack: true, ts: Date.now() } as ioBroker.State;
        this.#values.set(target, state);
        for (const reported of [target, ...(this.#aliasesByTarget.get(target) ?? [])]) {
            await SubscribeManager.observer(reported, state);
        }
    }

    async subscribeForeignStatesAsync(): Promise<void> {}
    async unsubscribeForeignStatesAsync(): Promise<void> {}
    subscribeStates(): void {}
    unsubscribeStates(): void {}
    async extendObjectAsync(): Promise<void> {}
    extendObject(): void {}
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

    /** Devices install delayed writes; left running they fire against a closed node in the next test. */
    clearAllTimers(): void {
        for (const timer of this.#timers) {
            clearTimeout(timer);
        }
        this.#timers.clear();
    }

    /** Structurally an `ioBroker.Adapter` for the parts the device layer uses. */
    asAdapter(): ioBroker.Adapter {
        return this as unknown as ioBroker.Adapter;
    }
}

/**
 * Loads an object fixture written by `npm run test:fixtures`. The file is plain JSON, so this is the one
 * place that asserts the exported shape matches `ioBroker.Object`.
 *
 * @param file absolute path of the fixture
 */
export function loadObjectFixture(file: string): ObjectMap {
    return JSON.parse(readFileSync(file, 'utf8')) as ObjectMap;
}

/** Roles whose value format a generic seed cannot produce, so the converters would see garbage. */
const SEEDED_BY_ROLE: Record<string, string> = {
    'level.color.rgb': '#336699',
    'level.color.rgbw': '#33669980',
    'level.color.cie': '[0.3,0.4]',
};

/**
 * Gives every state that backs a value a fixed non-default value, so a snapshot shows real conversions
 * instead of a tree of zeroes and a unit error is visible as a wrong number.
 *
 * Numbers land in the middle of their declared range - the value a converter is most likely to pass
 * through unclamped - and fall back to 42 without a range.
 *
 * @param adapter the adapter holding the values
 * @param objects the object tree the adapter serves
 */
export function seedDeterministicValues(adapter: MockObjectAdapter, objects: ObjectMap): void {
    for (const [id, object] of Object.entries(objects)) {
        if (object.type !== 'state' || adapter.resolveId(id) !== id) {
            continue; // Alias states hold no value of their own
        }
        const { type, min, max, states, role } = object.common;
        let value: unknown;
        if (role && Object.hasOwn(SEEDED_BY_ROLE, role)) {
            value = SEEDED_BY_ROLE[role];
        } else if (states) {
            // ioBroker also allows "0:off;1:on" and an array here; `Object.keys` would silently yield
            // indices for those, so a fixture using one has to fail instead of being seeded with garbage.
            if (typeof states !== 'object' || Array.isArray(states)) {
                throw new Error(`State ${id} declares its states as ${typeof states}, which the mock does not model`);
            }
            const keys = Object.keys(states);
            value = type === 'string' ? keys[0] : Number(keys[0]);
        } else if (type === 'boolean') {
            value = true;
        } else if (type === 'number') {
            value = min !== undefined && max !== undefined ? Math.round((min + max) / 2) : 42;
        } else if (type === 'string') {
            value = 'test';
        } else {
            continue;
        }
        adapter.seedValue(id, value);
    }
}
