import { fromJson, MaybeAsyncStorage, StorageError, SupportedStorageTypes, toJson } from '@matter/main';
import { StorageBackendDiskAsync } from '@matter/nodejs';

/**
 * Class that implements the storage for one Node in the Matter ecosystem
 */
export class IoBrokerObjectStorage implements MaybeAsyncStorage {
    #existingObjectIds = new Set<string>();
    readonly #storageRootOid: string;
    readonly #nodeDataStorageDirectory?: string;
    initialized = false;
    readonly #adapter: ioBroker.Adapter;
    #namespace: string;
    #clear = false;
    #localStorageManager?: StorageBackendDiskAsync;
    #localStorageForPrefix?: string;

    constructor(
        adapter: ioBroker.Adapter,
        namespace: string,
        clear = false,
        nodeDataStorageDirectory?: string,
        localPrefix?: string,
    ) {
        this.#adapter = adapter;
        this.#namespace = namespace;
        this.#clear = clear;
        this.#storageRootOid = `storage.${this.#namespace}`;
        this.#nodeDataStorageDirectory = nodeDataStorageDirectory;
        this.#localStorageForPrefix = localPrefix;
    }

    #isLocallyStored(contexts: string[]): boolean {
        return (
            this.#nodeDataStorageDirectory !== undefined &&
            this.#localStorageForPrefix !== undefined &&
            contexts[0].startsWith(this.#localStorageForPrefix)
        );
    }

    async initialize(): Promise<void> {
        this.#adapter.log.debug(`[STORAGE] Initializing storage for ${this.#storageRootOid}`);

        if (this.#nodeDataStorageDirectory !== undefined) {
            this.#localStorageManager = new StorageBackendDiskAsync(this.#nodeDataStorageDirectory, this.#clear);
        }

        await this.#adapter.extendObjectAsync(this.#storageRootOid, {
            type: 'folder',
            common: {
                expert: true,
                name: 'Matter storage',
            },
            native: {},
        });

        if (this.#clear) {
            this.initialized = true;
            await this.clearAll();
            return;
        }

        // read all keys, storage entries always have a value, so we can use the states
        const states = await this.#adapter.getStatesAsync(`${this.#storageRootOid}.*`);
        const namespaceLength = this.#adapter.namespace.length + 1;
        for (const key in states) {
            this.#existingObjectIds.add(key.substring(namespaceLength));
        }

        this.initialized = true;
    }

    async clearAll(): Promise<void> {
        try {
            await this.#adapter.delObjectAsync(this.#storageRootOid, { recursive: true });
        } catch (error) {
            this.#adapter.log.error(`[STORAGE] Cannot clear all state: ${error.message}`);
        }
        this.#existingObjectIds.clear();
        if (this.#nodeDataStorageDirectory !== undefined && this.#localStorageManager !== undefined) {
            await this.#localStorageManager.clear();
        }
        this.#clear = false;
    }

    async close(): Promise<void> {
        // Nothing todo
    }

    buildKey(contexts: string[], key: string): string {
        return `${this.#storageRootOid}.${contexts.join('$$')}$$${key}`;
    }

    async get<T extends SupportedStorageTypes>(contexts: string[], key: string): Promise<T | undefined> {
        if (!key.length) {
            throw new StorageError('[STORAGE] Context and key must not be empty strings!');
        }
        if (this.#isLocallyStored(contexts)) {
            return this.#localStorageManager?.get<T>(contexts, key);
        }
        try {
            const valueState = await this.#adapter.getStateAsync(this.buildKey(contexts, key));
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
            this.#adapter.log.error(`[STORAGE] Cannot read state: ${error.message}`);
        }
    }

    async contexts(contexts: string[]): Promise<string[]> {
        const result = new Array<string>();
        if (this.#localStorageManager) {
            result.push(...(await this.#localStorageManager.contexts(contexts)));
        }

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
        if (this.#localStorageManager) {
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
        const values = this.#localStorageManager ? await this.#localStorageManager.values(contexts) : {};

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
            this.#adapter.log.error(`[STORAGE] Cannot save state: ${error.message}`);
        }
    }

    async set(
        contexts: string[],
        keyOrValue: string | Record<string, SupportedStorageTypes>,
        value?: SupportedStorageTypes,
    ): Promise<void> {
        if (this.#isLocallyStored(contexts) && this.#localStorageManager) {
            // @ts-expect-error we have multi type parameters here
            return this.#localStorageManager.set(contexts, keyOrValue, value);
        }

        if (typeof keyOrValue === 'string') {
            return this.#setKey(contexts, keyOrValue, value);
        } else {
            for (const key in keyOrValue) {
                await this.#setKey(contexts, key, keyOrValue[key]);
            }
        }
    }

    async delete(contexts: string[], key: string): Promise<void> {
        if (!key.length) {
            throw new StorageError('[STORAGE] Context and key must not be empty strings!');
        }
        if (this.#isLocallyStored(contexts) && this.#localStorageManager) {
            return this.#localStorageManager.delete(contexts, key);
        }

        const oid = this.buildKey(contexts, key);

        try {
            await this.#adapter.delObjectAsync(oid);
        } catch (error) {
            this.#adapter.log.error(`[STORAGE] Cannot delete state: ${error.message}`);
        }
        this.#existingObjectIds.delete(oid);
    }
}
