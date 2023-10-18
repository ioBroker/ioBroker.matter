import { fromJson, Storage, StorageError, SupportedStorageTypes, toJson } from "@project-chip/matter.js/storage";

export class StorageIoBroker implements Storage {
    private readonly adapter: ioBroker.Adapter;
    private readonly oid: string;
    private data: Record<string, any> = {};
    private savingPromise: Promise<void>;
    private savingTimer: NodeJS.Timeout | null = null;

    constructor(adapter: ioBroker.Adapter, uuid: string, clear = false, ) {
        this.adapter = adapter;
        this.oid = `${uuid}.state`;
        clear && this.clear();
        this.savingPromise = Promise.resolve();
    }

    async initialize() {
        let object;
        try {
             object = await this.adapter.getForeignObjectAsync(this.oid);
        } catch (error) {
            // create object
            object = {
                _id: this.oid,
                type: 'state',
                common: {
                    name: 'Storage and state',
                    type: 'boolean',
                    write: false,
                    role: 'state',
                },
                native: {

                }
            };
            await this.adapter.setForeignObjectAsync(this.oid, object as ioBroker.Object);
        }

        this.data = object?.native ?? {};
    }

    async close() {
        if (this.savingTimer) {
            // Save data to object
            await this.savingPromise;
        }
    }

    private save() {
        this.savingTimer && clearTimeout(this.savingTimer);
        this.savingTimer = setTimeout(() => {
            this.savingTimer = null;
            const object = {
                _id: this.oid,
                type: 'state',
                common: {
                    name: 'Storage and state',
                    type: 'boolean',
                    write: false,
                    role: 'state',
                },
                native: this.data,
            }
            this.savingPromise = this.adapter.setForeignObjectAsync(this.oid, object as ioBroker.Object)
                .then(() => {});
        }, 500);
    }

    clear() {
        this.data = {};
        this.save();
    }

    buildStorageKey(contexts: string[], key: string): string {
        const contextKey = contexts.join('.');
        if (
            !key.length ||
            !contextKey.length ||
            contextKey.includes('..') ||
            contextKey.startsWith('.') ||
            contextKey.endsWith('.')
        ) {
            throw new StorageError('Context must not be an empty string!');
        }

        return `${contextKey}.${key}`;
    }

    static getValue(object: any, contexts: string[], key: string): string | undefined {
        if (!object) {
            return;
        }
        if (contexts.length) {
            const context = contexts.shift();
            return StorageIoBroker.getValue(object[context as string], contexts, key);
        }
        return object[key];
    }

    static setValue(object: any, contexts: string[], key: string, value: string): void {
        if (!object) {
            return;
        }
        if (contexts.length) {
            const context = contexts.shift();
            object[context as string] = object[context as string] ?? {};
            StorageIoBroker.setValue(object[context as string], contexts, key, value);
        } else {
            object[key] = value;
        }
    }

    static clearValue(object: any, contexts: string[], key: string): void {
        if (!object) {
            return;
        }
        if (contexts.length) {
            const context = contexts.shift();
            StorageIoBroker.clearValue(object[context as string], contexts, key);
        } else {
            delete object[key];
        }
    }

    get<T extends SupportedStorageTypes>(contexts: string[], key: string): T | undefined {
        if (!key.length) {
            throw new StorageError("Context and key must not be empty strings!");
        }
        const value = StorageIoBroker.getValue(this.data, contexts, key);
        if (value === null || value === undefined) {
            return undefined;
        }
        return fromJson(value) as T;
    }

    set<T extends SupportedStorageTypes>(contexts: string[], key: string, value: T): void {
        if (!key.length) {
            throw new StorageError("Context and key must not be empty strings!");
        }
        StorageIoBroker.setValue(this.data, contexts, key, toJson(value));
        this.save();
    }

    delete(contexts: string[], key: string): void {
        if (!key.length) {
            throw new StorageError('Context and key must not be empty strings!');
        }
        StorageIoBroker.clearValue(this.data, contexts, key);
        this.save();
    }
}
