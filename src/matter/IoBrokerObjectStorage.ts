import type { SupportedStorageTypes, MaybePromise } from '@matter/main';
import { fromJson, StorageError, StorageDriver, toJson } from '@matter/main';
import { FileStorageDriver } from '@matter/nodejs';

/**
 * Class that implements the storage for one Node in the Matter ecosystem
 */
export class IoBrokerObjectStorage extends StorageDriver {
    static readonly id = 'iobroker';

    #existingObjectIds = new Set<string>();
    readonly #storageRootOid: string;
    readonly #nodeDataStorageDirectory?: string;
    initialized = false;
    readonly #adapter: ioBroker.Adapter;
    #namespace: string;
    #localStorageManager?: FileStorageDriver;
    #storeLocalChecker?: (contexts: string[]) => boolean;

    constructor(
        adapter: ioBroker.Adapter,
        namespace: string,
        nodeDataStorageDirectory?: string,
        storeLocalChecker?: (contexts: string[]) => boolean,
    ) {
        super();
        this.#adapter = adapter;
        this.#namespace = namespace;
        this.#storageRootOid = `storage.${this.#namespace}`;
        this.#nodeDataStorageDirectory = nodeDataStorageDirectory;
        this.#storeLocalChecker = storeLocalChecker;
    }

    #isLocallyStored(contexts: string[]): boolean {
        return !!(this.#nodeDataStorageDirectory !== undefined && this.#storeLocalChecker?.(contexts));
    }

    async initialize(): Promise<void> {
        this.#adapter.log.debug(`[STORAGE] Initializing storage for ${this.#storageRootOid}`);

        if (this.#nodeDataStorageDirectory !== undefined) {
            this.#localStorageManager = new FileStorageDriver(this.#nodeDataStorageDirectory);
            await this.#localStorageManager.initialize();
        }

        await this.#adapter.extendObjectAsync(this.#storageRootOid, {
            type: 'folder',
            common: {
                expert: true,
                name: 'Matter storage',
            },
            native: {},
        });

        // read all keys, storage entries always have a value, so we can use the states
        const states = await this.#adapter.getStatesAsync(`${this.#storageRootOid}.*`);
        const namespaceLength = this.#adapter.namespace.length + 1;
        for (const key in states) {
            this.#existingObjectIds.add(key.substring(namespaceLength));
        }

        this.initialized = true;
    }

    async #clearNamespace(): Promise<void> {
        this.#adapter.log.info(`[STORAGE] Clearing all storage for ${this.#storageRootOid}`);
        try {
            await this.#adapter.delObjectAsync(this.#storageRootOid, { recursive: true });
        } catch (error) {
            this.#adapter.log.error(`[STORAGE] Cannot clear all state: ${error.message}`);
        }
        if (this.#localStorageManager !== undefined) {
            for (const context of this.#localContexts([])) {
                await this.#localStorageManager.clearAll([context]);
            }
        }
        this.#existingObjectIds.clear();
    }

    async clearAll(contexts: string[]): Promise<void> {
        if (!contexts.length) {
            await this.#clearNamespace();
            return;
        }
        if (this.#localStorageManager && this.#isLocallyStored(contexts)) {
            this.#adapter.log.info(`[STORAGE] Clearing all storage for ${contexts.join('$$')} in local storage`);
            await this.#localStorageManager.clearAll(contexts);
        }

        const contextKey = `${this.#adapter.namespace}.${this.buildKey(contexts, '')}`;
        const objs = await this.#adapter.getObjectViewAsync('system', 'state', {
            startkey: `${contextKey}`,
            endkey: `${contextKey}\u9999`,
        });
        this.#adapter.log.info(`[STORAGE] Clearing all storage (${objs.rows.length} keys found) for ${contextKey}`);
        const namespaceLen = this.#adapter.namespace.length + 1;
        for (const state of objs.rows) {
            if (state.value) {
                const oid = state.id.substring(namespaceLen);
                try {
                    await this.#adapter.delObjectAsync(oid);
                } catch (error) {
                    this.#adapter.log.error(`[STORAGE] Cannot delete state: ${error.message}`);
                }
                this.#existingObjectIds.delete(oid);
            }
        }
    }

    async close(): Promise<void> {
        // Nothing to do
    }

    buildKey(contexts: string[], key: string): string {
        return `${this.#storageRootOid}.${contexts.join('$$')}$$${key}`;
    }

    async get<T extends SupportedStorageTypes>(contexts: string[], key: string): Promise<T | undefined> {
        if (!key.length) {
            throw new StorageError('[STORAGE] Context and key must not be empty strings!');
        }
        if (this.#localStorageManager && this.#isLocallyStored(contexts)) {
            return await this.#localStorageManager.get<T>(contexts, key);
        }
        const oid = this.buildKey(contexts, key);
        try {
            const valueState = await this.#adapter.getStateAsync(oid);
            if (valueState === null || valueState === undefined) {
                return undefined;
            }
            if (typeof valueState.val !== 'string') {
                this.#adapter.log.error(
                    `[STORAGE] Invalid value for key "${key}" in context "${contexts.join('$$')}": ${toJson(valueState.val)}`,
                );
                return undefined;
            }
            return fromJson(valueState.val) as T;
        } catch (error) {
            this.#adapter.log.error(`[STORAGE] Cannot read state ${oid}: ${error.message}`);
        }
    }

    async has(contexts: string[], key: string): Promise<boolean> {
        return (await this.get(contexts, key)) !== undefined;
    }

    /**
     * Contexts the local storage reports, minus the empty name a foreign dotfile in the shared instance data
     * directory produces: the file storage driver splits an entry on ".", so ".DS_Store" indexes as a context
     * named "". Passing that on makes `clearAll` throw on the empty segment.
     */
    #localContexts(contexts: string[]): string[] {
        return this.#localStorageManager?.contexts(contexts).filter(name => name.length > 0) ?? [];
    }

    contexts(contexts: string[]): string[] {
        const result = new Array<string>();
        result.push(...this.#localContexts(contexts));

        const contextKeyStart = this.buildKey(contexts, '');
        const len = contextKeyStart.length;

        const foundContexts = new Set<string>();
        Array.from(this.#existingObjectIds.keys())
            .filter(key => key.startsWith(contextKeyStart) && key.indexOf('$$', len) !== -1)
            .forEach(key => {
                const context = key.substring(len, key.indexOf('$$', len));
                if (!foundContexts.has(context)) {
                    foundContexts.add(context);
                }
            });
        result.push(...Array.from(foundContexts.keys()));
        return result;
    }

    async keys(contexts: string[]): Promise<string[]> {
        const results = new Array<string>();
        // Nothing of ours is ever stored locally without a context, so root-level entries of the shared
        // directory belong to other components.
        if (this.#localStorageManager && contexts.length) {
            results.push(...(await this.#localStorageManager.keys(contexts)));
        }

        const contextKeyStart = this.buildKey(contexts, '');
        const len = contextKeyStart.length;

        results.push(
            ...Array.from(this.#existingObjectIds.keys())
                .filter(key => key.startsWith(contextKeyStart) && key.indexOf('$$', len) === -1)
                .map(key => key.substring(len)),
        );
        return results;
    }

    async values(contexts: string[]): Promise<Record<string, SupportedStorageTypes>> {
        const values =
            this.#localStorageManager && contexts.length ? await this.#localStorageManager.values(contexts) : {};

        const keys = await this.keys(contexts);
        for (const key of keys) {
            values[key] = await this.get(contexts, key);
        }
        return values;
    }

    async #setKey(contexts: string[], key: string, value: SupportedStorageTypes): Promise<void> {
        if (!key.length) {
            throw new StorageError('[STORAGE] Context and key must not be empty strings!');
        }

        const oid = this.buildKey(contexts, key);

        try {
            if (!this.#existingObjectIds.has(oid)) {
                await this.#adapter.setObjectAsync(oid, {
                    type: 'state',
                    common: {
                        name: key,
                        type: 'string',
                        role: 'state',
                        expert: true,
                        read: true,
                        write: false,
                    },
                    native: {},
                });
                this.#existingObjectIds.add(oid);
            }
            await this.#adapter.setState(oid, toJson(value), true);
        } catch (error) {
            this.#adapter.log.error(`[STORAGE] Cannot save state ${oid}: ${error.message}`);
        }
    }

    async set(
        contexts: string[],
        keyOrValue: string | Record<string, SupportedStorageTypes>,
        value?: SupportedStorageTypes,
    ): Promise<void> {
        if (this.#localStorageManager && this.#isLocallyStored(contexts)) {
            return this.#localStorageManager.set(contexts, keyOrValue as string, value);
        }

        if (typeof keyOrValue === 'string') {
            return this.#setKey(contexts, keyOrValue, value);
        }
        for (const key in keyOrValue) {
            await this.#setKey(contexts, key, keyOrValue[key]);
        }
    }

    begin(): MaybePromise<StorageDriver.Transaction> {
        return new StorageDriver.Transaction(this);
    }

    async delete(contexts: string[], key: string): Promise<void> {
        if (!key.length) {
            throw new StorageError('[STORAGE] Context and key must not be empty strings!');
        }
        if (this.#localStorageManager && this.#isLocallyStored(contexts)) {
            return this.#localStorageManager.delete(contexts, key);
        }

        const oid = this.buildKey(contexts, key);

        try {
            await this.#adapter.delObjectAsync(oid);
        } catch (error) {
            this.#adapter.log.error(`[STORAGE] Cannot delete state ${oid}: ${error.message}`);
        }
        this.#existingObjectIds.delete(oid);
    }
}
