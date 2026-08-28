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

    /** Nothing of ours is stored without a context, so the checker is never asked about the root. */
    #isLocallyStored(contexts: string[]): boolean {
        return !!(
            contexts.length &&
            this.#nodeDataStorageDirectory !== undefined &&
            this.#storeLocalChecker?.(contexts)
        );
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

        try {
            await this.#adoptStrandedNodeData();
        } catch (error) {
            // The data stays readable where it is, so a failed move must not keep the adapter from starting
            this.#adapter.log.error(`[STORAGE] Cannot move node data into the objects database: ${error.message}`);
        }
    }

    /**
     * Copy node data the local checker no longer claims into the objects database.
     *
     * Until 1.3.1 the checker matched every context below a peer, so entries that belong in objects were
     * written to disk instead and would read back as missing once the checker was corrected. The file is
     * kept: a downgrade to a version that reads only files still finds its peers, at the price of the copy
     * going stale, and an entry already in the objects database is left alone rather than written back.
     */
    async #adoptStrandedNodeData(): Promise<void> {
        const local = this.#localStorageManager;
        if (local === undefined) {
            return;
        }

        // Only peer data is split between the two backends; anything else in the shared directory is not ours
        const pending = new Array<string[]>();
        if (this.#localContexts([]).includes('nodes')) {
            pending.push(['nodes']);
        }
        let adopted = 0;
        const stranded = new Array<string>();
        while (pending.length) {
            const contexts = pending.shift()!;
            if (this.#isLocallyStored(contexts)) {
                continue;
            }
            pending.push(...this.#localContexts(contexts).map(context => [...contexts, context]));

            const values = await local.values(contexts);
            for (const key of await local.keys(contexts)) {
                const file = [...contexts, key].join('.');
                if ((await this.#getFromObjects(contexts, key)) !== undefined) {
                    continue;
                }
                if (!(key in values)) {
                    // The file storage driver drops what it cannot parse, so this entry has no value to copy
                    stranded.push(file);
                    continue;
                }

                await this.#setKey(contexts, key, values[key]);
                // #setKey reports a failed write in the log and returns rather than throwing
                if ((await this.#getFromObjects(contexts, key)) === undefined) {
                    stranded.push(file);
                    continue;
                }
                adopted++;
            }
        }

        if (adopted) {
            this.#adapter.log.info(
                `[STORAGE] Copied ${adopted} node data entries into the objects database. The files stay behind ` +
                    `so that a downgrade to an earlier adapter version still finds its nodes.`,
            );
        }
        if (stranded.length) {
            this.#adapter.log.warn(
                `[STORAGE] Could not copy ${stranded.length} node data entries into the objects database: ` +
                    `${stranded.join(', ')}. They are still read from the instance data directory and copying ` +
                    `them is retried on the next start.`,
            );
        }
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
        if (this.#localStorageManager) {
            // A wipe addresses a whole subtree, and matter.js erases a node at contexts above the one the
            // checker answers for, so this cannot ask where a single key would be written.
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
        await this.#localStorageManager?.close();
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
        const value = await this.#getFromObjects<T>(contexts, key);
        if (value !== undefined) {
            return value;
        }
        if (!contexts.length) {
            // Root level entries of the shared directory belong to other components, and reading one that is
            // a directory throws rather than reporting nothing
            return undefined;
        }
        // Entries #adoptStrandedNodeData could not move stay readable from where they were written
        return this.#localStorageManager?.get<T>(contexts, key);
    }

    async #getFromObjects<T extends SupportedStorageTypes>(contexts: string[], key: string): Promise<T | undefined> {
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
        // A peer keeps its cluster data in files and the rest in objects, so both backends report it and
        // every consumer of this list would build its store twice.
        const result = new Set<string>(this.#localContexts(contexts));

        const contextKeyStart = this.buildKey(contexts, '');
        const len = contextKeyStart.length;

        for (const oid of this.#existingObjectIds) {
            const separator = oid.indexOf('$$', len);
            if (oid.startsWith(contextKeyStart) && separator !== -1) {
                result.add(oid.substring(len, separator));
            }
        }
        return [...result];
    }

    async keys(contexts: string[]): Promise<string[]> {
        const results = new Set<string>();
        // Nothing of ours is ever stored locally without a context, so root-level entries of the shared
        // directory belong to other components.
        if (this.#localStorageManager && contexts.length) {
            for (const key of await this.#localStorageManager.keys(contexts)) {
                results.add(key);
            }
        }

        const contextKeyStart = this.buildKey(contexts, '');
        const len = contextKeyStart.length;

        for (const oid of this.#existingObjectIds) {
            if (oid.startsWith(contextKeyStart) && oid.indexOf('$$', len) === -1) {
                results.add(oid.substring(len));
            }
        }
        return [...results];
    }

    async values(contexts: string[]): Promise<Record<string, SupportedStorageTypes>> {
        const values =
            this.#localStorageManager && contexts.length ? await this.#localStorageManager.values(contexts) : {};

        const readFromFiles = this.#isLocallyStored(contexts);
        for (const key of await this.keys(contexts)) {
            if (readFromFiles && key in values) {
                continue;
            }
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
            }
            await this.#adapter.setState(oid, toJson(value), true);
            // Only a key that carries a value counts as existing: `keys()` and `contexts()` are built from
            // this set, and an object without a state reports a key that reads back as undefined.
            this.#existingObjectIds.add(oid);
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

        if (this.#localStorageManager && contexts.length) {
            // An entry #adoptStrandedNodeData could not move would be served again by get()
            await this.#localStorageManager
                .delete(contexts, key)
                .catch(error => this.#adapter.log.warn(`[STORAGE] Cannot delete file for ${oid}: ${error.message}`));
        }
    }
}
