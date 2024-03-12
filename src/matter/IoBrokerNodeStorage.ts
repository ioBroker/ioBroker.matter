import { fromJson, Storage, StorageError, SupportedStorageTypes, toJson } from '@project-chip/matter.js/storage';

/**
 * Class that implements the storage for one Node in the Matter ecosystem
 */
export class IoBrokerNodeStorage implements Storage {
    private data: Record<string, any> = {};
    private savingNumber: number = 1;
    private readonly savingPromises: Record<string, Promise<void>> = {};
    private readonly createdKeys: Record<string, boolean>;
    private readonly storageRootOid: string;

    constructor(
        private readonly adapter: ioBroker.Adapter,
        private namespace: string,
        private clear = false
    ) {
        this.createdKeys = {};
        this.storageRootOid = `storage.${this.namespace}`;
    }

    async initialize(): Promise<void> {
        this.adapter.log.debug(`[STORAGE] Initializing storage for ${this.storageRootOid}`);
        await this.adapter.extendObjectAsync(this.storageRootOid, {
            type: 'folder',
            common: {
                expert: true,
                name: 'Matter storage',
            },
            native: {}
        });

        if (this.clear) {
            await this.clearAll();
            return;
        }

        // read all keys
        const states = await this.adapter.getStatesAsync(`${this.storageRootOid}.*`);
        const len = `${this.adapter.namespace}.${this.storageRootOid}.`.length;
        for (const key in states) {
            this.createdKeys[key] = true;
            this.data[key.substring(len)] = fromJson(states[key].val as string);
        }
    }

    async clearAll(): Promise<void> {
        await this.adapter.delObjectAsync(this.storageRootOid, { recursive: true });
        this.clear = false;
        this.data = {};
    }

    async close(): Promise<void> {
        const keys = Object.keys(this.savingPromises);
        if (keys.length) {
            await Promise.all(keys.map(key => this.savingPromises[key]));
        }
    }

    buildKey(contexts: string[], key: string): string {
        return `${contexts.join('$$')}$$${key}`;
    }

    get<T extends SupportedStorageTypes>(contexts: string[], key: string): T | undefined {
        if (!key.length) {
            throw new StorageError('[STORAGE] Context and key must not be empty strings!');
        }
        const value = this.data[this.buildKey(contexts, key)];
        if (value === null || value === undefined) {
            return undefined;
        }
        return value as T;
    }

    keys(contexts: string[]): string[] {
        const contextKeyStart = this.buildKey(contexts, '');
        const len = contextKeyStart.length;

        return Object.keys(this.data)
            .filter(key => key.startsWith(contextKeyStart) && key.indexOf('$$', len) === -1)
            .map(key => key.substring(len));
    }

    saveKey(oid: string, value: string): void {
        const index = this.savingNumber++;
        if (this.savingNumber >= 0xFFFFFFFF) {
            this.savingNumber = 1;
        }
        if (this.createdKeys[oid]) {
            this.savingPromises[index] = this.adapter.setStateAsync(`${this.storageRootOid}.${oid}`, value, true)
                .catch(error => this.adapter.log.error(`[STORAGE] Cannot save state: ${error}`))
                .then(() => {
                    delete this.savingPromises[index];
                });

        } else {
            this.savingPromises[index] =
                this.adapter.setObjectAsync(`${this.storageRootOid}.${oid}`, {
                    type: 'state',
                    common: {
                        name: 'key',
                        type: 'mixed',
                        role: 'state',
                        expert: true,
                        read: true,
                        write: false,
                    },
                    native: {}
                })
                    .then(() => this.adapter.setStateAsync(`${this.storageRootOid}.${oid}`, value, true)
                        .catch(error => this.adapter.log.error(`[STORAGE] Cannot save state: ${error}`))
                        .then(() => {
                            this.createdKeys[oid] = true;
                            delete this.savingPromises[index];
                        }));
        }
    }

    deleteKey(oid: string): void {
        const index = this.savingNumber++;
        if (this.createdKeys[oid]) {
            if (this.savingNumber >= 0xFFFFFFFF) {
                this.savingNumber = 1;
            }
            this.savingPromises[index] = this.adapter.delObjectAsync(`${this.storageRootOid}.${oid}`)
                .catch(error => this.adapter.log.error(`[STORAGE] Cannot save state: ${error}`))
                .then(() => {
                    delete this.createdKeys[oid];
                    delete this.savingPromises[index];
                });

        }
    }

    set<T extends SupportedStorageTypes>(contexts: string[], key: string, value: T): void {
        if (!key.length) {
            throw new StorageError('[STORAGE] Context and key must not be empty strings!');
        }

        const oid = this.buildKey(contexts, key);
        this.data[oid] = value;
        this.saveKey(oid, toJson(value));
    }

    delete(contexts: string[], key: string): void {
        if (!key.length) {
            throw new StorageError('[STORAGE] Context and key must not be empty strings!');
        }
        const oid = this.buildKey(contexts, key);
        delete this.data[oid];

        this.deleteKey(oid);
    }
}
