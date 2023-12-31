import { fromJson, Storage, StorageError, SupportedStorageTypes, toJson } from '@project-chip/matter-node.js/storage';

export class StorageIoBroker implements Storage {
    private readonly adapter: ioBroker.Adapter;
    private data: Record<string, any> = {};
    private clear: boolean = false;
    private savingNumber: number = 1;
    private readonly savingPromises: Record<string, Promise<void>> = {};
    private readonly createdKeys: Record<string, boolean>;

    constructor(adapter: ioBroker.Adapter, clear = false) {
        this.adapter = adapter;
        this.clear = clear;
        this.createdKeys = {};
    }

    async initialize(): Promise<void> {
        let object;
        try {
            object = await this.adapter.getObjectAsync('storage');
        } catch (error) {
            // create object
            object = {
                _id: 'storage',
                type: 'folder',
                common: {
                    expert: true,
                    name: 'Matter storage',
                },
                native: {}
            };
            await this.adapter.setObjectAsync('storage', object as ioBroker.Object);
        }

        if (this.clear) {
            await this.clearAll();
            return;
        }

        // read all keys
        const states = await this.adapter.getStatesAsync('storage.*');
        const len = `${this.adapter.namespace}.storage.`.length;
        for (const key in states) {
            this.createdKeys[key] = true;
            this.data[key.substring(len)] = fromJson(states[key].val as string);
        }
    }

    async clearAll(): Promise<void> {
        await this.adapter.delObjectAsync('storage', { recursive: true });
        this.clear = false;
        this.data = {};
    }

    async close(): Promise<void> {
        const keys = Object.keys(this.savingPromises);
        if (keys.length) {
            await Promise.all(keys.map(key => this.savingPromises[key]));
        }
    }

    static buildKey(contexts: string[], key: string): string {
        return `${contexts.join('$$')}$$${key}`;
    }

    get<T extends SupportedStorageTypes>(contexts: string[], key: string): T | undefined {
        if (!key.length) {
            throw new StorageError('[STORAGE] Context and key must not be empty strings!');
        }
        const value = this.data[StorageIoBroker.buildKey(contexts, key)];
        if (value === null || value === undefined) {
            return undefined;
        }
        return value as T;
    }

    keys(contexts: string[]): string[] {
        const contextKeyStart = StorageIoBroker.buildKey(contexts, '');
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
            this.savingPromises[index] = this.adapter.setStateAsync(`storage.${oid}`, value, true)
                .catch(error => this.adapter.log.error(`[STORAGE] Cannot save state: ${error}`))
                .then(() => {
                    delete this.savingPromises[index];
                });

        } else {
            this.savingPromises[index] =
                this.adapter.setObjectAsync(`storage.${oid}`, {
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
                    .then(() => this.adapter.setStateAsync(`storage.${oid}`, value, true)
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
            this.savingPromises[index] = this.adapter.delObjectAsync(`storage.${oid}`)
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

        const oid = StorageIoBroker.buildKey(contexts, key);
        this.data[oid] = value;
        this.saveKey(oid, toJson(value));
    }

    delete(contexts: string[], key: string): void {
        if (!key.length) {
            throw new StorageError('[STORAGE] Context and key must not be empty strings!');
        }
        const oid = StorageIoBroker.buildKey(contexts, key);
        delete this.data[oid];

        this.deleteKey(oid);
    }
}
