import {
    fromJson,
    MaybeAsyncStorage,
    StorageError,
    SupportedStorageTypes,
    toJson,
} from '@project-chip/matter.js/storage';

/**
 * Class that implements the storage for one Node in the Matter ecosystem
 */
export class IoBrokerNodeStorage implements MaybeAsyncStorage {
    private existingObjectIds = new Set<string>();
    private readonly storageRootOid: string;
    initialized = false;

    constructor(
        private readonly adapter: ioBroker.Adapter,
        private namespace: string,
        private clear = false,
    ) {
        this.storageRootOid = `storage.${this.namespace}`;
    }

    async initialize(): Promise<void> {
        this.adapter.log.debug(`[STORAGE] Initializing storage for ${this.storageRootOid}`);

        await this.adapter.extendObject(this.storageRootOid, {
            type: 'folder',
            common: {
                expert: true,
                name: 'Matter storage',
            },
            native: {},
        });

        if (this.clear) {
            this.initialized = true;
            await this.clearAll();
            return;
        }

        // read all keys, storage entries always have a value, so we can use the states
        const states = await this.adapter.getStatesAsync(`${this.storageRootOid}.*`);
        const namespaceLength = this.adapter.namespace.length + 1;
        for (const key in states) {
            this.existingObjectIds.add(key.substring(namespaceLength));
        }

        this.initialized = true;
    }

    async clearAll(): Promise<void> {
        try {
            await this.adapter.delObjectAsync(this.storageRootOid, { recursive: true });
        } catch (error) {
            this.adapter.log.error(`[STORAGE] Cannot clear all state: ${error.message}`);
        }
        this.existingObjectIds.clear();
        this.clear = false;
    }

    async close(): Promise<void> {
        // Nothing todo
    }

    buildKey(contexts: string[], key: string): string {
        return `${this.storageRootOid}.${contexts.join('$$')}$$${key}`;
    }

    async get<T extends SupportedStorageTypes>(contexts: string[], key: string): Promise<T | undefined> {
        if (!key.length) {
            throw new StorageError('[STORAGE] Context and key must not be empty strings!');
        }
        try {
            const valueState = await this.adapter.getStateAsync(this.buildKey(contexts, key));
            if (valueState === null || valueState === undefined) {
                return undefined;
            }
            if (typeof valueState.val !== 'string') {
                this.adapter.log.error(
                    `[STORAGE] Invalid value for key "${key}" in context "${contexts.join('$$')}": ${toJson(valueState.val)}`,
                );
                return undefined;
            }
            return fromJson(valueState.val) as T;
        } catch (error) {
            this.adapter.log.error(`[STORAGE] Cannot read state: ${error.message}`);
        }
    }

    async contexts(contexts: string[]): Promise<string[]> {
        const contextKeyStart = this.buildKey(contexts, '');
        const len = contextKeyStart.length;

        const foundContexts = new Set<string>();
        Array.from(this.existingObjectIds.keys())
            .filter(key => key.startsWith(contextKeyStart) && key.indexOf('$$', len) !== -1)
            .forEach(key => {
                const context = key.substring(len, key.indexOf('$$', len));
                if (!foundContexts.has(context)) {
                    foundContexts.add(context);
                }
            });
        return Array.from(foundContexts.keys());
    }

    async keys(contexts: string[]): Promise<string[]> {
        const contextKeyStart = this.buildKey(contexts, '');
        const len = contextKeyStart.length;

        return Array.from(this.existingObjectIds.keys())
            .filter(key => key.startsWith(contextKeyStart) && key.indexOf('$$', len) === -1)
            .map(key => key.substring(len));
    }

    async values(contexts: string[]): Promise<Record<string, SupportedStorageTypes>> {
        const values = {} as Record<string, SupportedStorageTypes>;
        const keys = await this.keys(contexts);
        for (const key in keys) {
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
            if (!this.existingObjectIds.has(oid)) {
                await this.adapter.setObjectAsync(oid, {
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
                this.existingObjectIds.add(oid);
            }
            await this.adapter.setState(oid, toJson(value), true);
        } catch (error) {
            this.adapter.log.error(`[STORAGE] Cannot save state: ${error.message}`);
        }
    }

    async set(
        contexts: string[],
        keyOrValue: string | Record<string, SupportedStorageTypes>,
        value?: SupportedStorageTypes,
    ): Promise<void> {
        if (typeof keyOrValue === 'string') {
            await this.#setKey(contexts, keyOrValue, value);
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
        const oid = this.buildKey(contexts, key);

        try {
            await this.adapter.delObjectAsync(oid);
        } catch (error) {
            this.adapter.log.error(`[STORAGE] Cannot delete state: ${error.message}`);
        }
        this.existingObjectIds.delete(oid);
    }
}
