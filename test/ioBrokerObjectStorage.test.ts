import { deepStrictEqual, ok, strictEqual } from 'node:assert';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IoBrokerObjectStorage } from '../src/matter/IoBrokerObjectStorage';

const NAMESPACE = 'matter.0';

interface MockAdapter {
    adapter: ioBroker.Adapter;
    objects: Set<string>;
    states: Map<string, string>;
}

function makeAdapter(): MockAdapter {
    const objects = new Set<string>();
    const states = new Map<string, string>();
    const full = (id: string): string => `${NAMESPACE}.${id}`;

    const adapter = {
        namespace: NAMESPACE,
        log: {
            silly: () => {},
            debug: () => {},
            info: () => {},
            warn: () => {},
            error: () => {},
        },
        extendObjectAsync: async (id: string) => {
            objects.add(id);
        },
        setObjectAsync: async (id: string) => {
            objects.add(id);
        },
        setState: async (id: string, value: string) => {
            states.set(id, value);
        },
        getStateAsync: async (id: string) => {
            const val = states.get(id);
            return val === undefined ? null : { val };
        },
        getStatesAsync: async (pattern: string) => {
            const prefix = full(pattern.replace(/\*$/, ''));
            const result: Record<string, { val: string }> = {};
            for (const [id, val] of states) {
                if (full(id).startsWith(prefix)) {
                    result[full(id)] = { val };
                }
            }
            return result;
        },
        getObjectViewAsync: async (_design: string, _view: string, params: { startkey: string; endkey: string }) => ({
            rows: [...objects]
                .filter(id => full(id) >= params.startkey && full(id) <= params.endkey)
                .map(id => ({ id: full(id), value: { _id: full(id) } })),
        }),
        delObjectAsync: async (id: string, options?: { recursive?: boolean }) => {
            for (const existing of [...objects]) {
                if (existing === id || (options?.recursive && existing.startsWith(`${id}.`))) {
                    objects.delete(existing);
                    states.delete(existing);
                }
            }
        },
    } as unknown as ioBroker.Adapter;

    return { adapter, objects, states };
}

describe('IoBrokerObjectStorage', () => {
    describe('clearAll([]) — full namespace wipe', () => {
        it('deletes the whole storage object tree', async () => {
            const { adapter, objects, states } = makeAdapter();
            const storage = new IoBrokerObjectStorage(adapter, 'uuid-1');
            await storage.initialize();
            await storage.set(['nodes', 'peer0'], 'key', 'value');
            ok(objects.has('storage.uuid-1.nodes$$peer0$$key'));

            await storage.clearAll([]);

            deepStrictEqual([...objects], []);
            deepStrictEqual([...states.keys()], []);
        });

        it('forgets the tracked object ids so a later write recreates the object', async () => {
            const { adapter, objects } = makeAdapter();
            const storage = new IoBrokerObjectStorage(adapter, 'uuid-1');
            await storage.initialize();
            await storage.set(['nodes'], 'key', 'value');

            await storage.clearAll([]);
            await storage.set(['nodes'], 'key', 'value2');

            // Recreated only if #existingObjectIds was cleared — otherwise setState writes to a
            // state object that no longer exists.
            ok(objects.has('storage.uuid-1.nodes$$key'));
            strictEqual(await storage.get(['nodes'], 'key'), 'value2');
        });

        it('works on a fresh instance that was never initialized', async () => {
            // `deleteBridgeOrDevice` constructs the storage purely to drop a uuid namespace and never
            // calls initialize().
            const { adapter, objects } = makeAdapter();
            const writer = new IoBrokerObjectStorage(adapter, 'uuid-1');
            await writer.initialize();
            await writer.set(['nodes'], 'key', 'value');

            await new IoBrokerObjectStorage(adapter, 'uuid-1').clearAll([]);

            deepStrictEqual([...objects], []);
        });

        it('wipes the local filesystem storage too', async () => {
            const dir = mkdtempSync(join(tmpdir(), 'iobroker-matter-storage-'));
            try {
                const { adapter } = makeAdapter();
                const storage = new IoBrokerObjectStorage(adapter, 'controller', dir, contexts =>
                    contexts[0].startsWith('node-'),
                );
                await storage.initialize();
                await storage.set(['node-1'], 'attr', 'local-value');
                strictEqual(await storage.get(['node-1'], 'attr'), 'local-value');

                await storage.clearAll([]);

                strictEqual(await storage.get(['node-1'], 'attr'), undefined);
                await storage.close();
            } finally {
                rmSync(dir, { recursive: true, force: true });
            }
        });
    });

    describe('shared instance data directory', () => {
        // The local storage is rooted at the instance data directory, which also holds other
        // components' directories ("ota", "custom-ota", …) and, on a developer machine, dotfiles.
        // The file storage driver indexes those as entries of this store.
        async function withSharedDir(
            test: (storage: IoBrokerObjectStorage, adapter: MockAdapter) => Promise<void>,
        ): Promise<void> {
            const dir = mkdtempSync(join(tmpdir(), 'iobroker-matter-storage-'));
            try {
                mkdirSync(join(dir, 'ota'));
                writeFileSync(join(dir, '.DS_Store'), 'junk');
                const mock = makeAdapter();
                const storage = new IoBrokerObjectStorage(mock.adapter, 'controller', dir, contexts =>
                    contexts[0].startsWith('node-'),
                );
                await storage.initialize();
                await storage.set(['node-1'], 'attr', 'local-value');
                await test(storage, mock);
                await storage.close();
            } finally {
                rmSync(dir, { recursive: true, force: true });
            }
        }

        it('does not report foreign root entries as keys', async () => {
            await withSharedDir(async storage => {
                deepStrictEqual(await storage.keys([]), []);
            });
        });

        it('does not try to read foreign root entries as values', async () => {
            await withSharedDir(async storage => {
                // Reading a directory as a value throws EISDIR rather than returning undefined.
                deepStrictEqual(await storage.values([]), {});
            });
        });

        it('does not report a dotfile as a context', async () => {
            await withSharedDir(async storage => {
                deepStrictEqual(storage.contexts([]), ['node-1']);
            });
        });

        it('wipes our contexts without tripping over the foreign entries', async () => {
            await withSharedDir(async storage => {
                await storage.clearAll([]);
                strictEqual(await storage.get(['node-1'], 'attr'), undefined);
            });
        });
    });

    describe('clearAll(contexts) — scoped wipe', () => {
        it('deletes only the addressed subtree', async () => {
            const { adapter, objects } = makeAdapter();
            const storage = new IoBrokerObjectStorage(adapter, 'uuid-1');
            await storage.initialize();
            await storage.set(['nodes', 'peer0'], 'key', 'value');
            await storage.set(['nodes', 'peer1'], 'key', 'value');
            await storage.set(['fabrics'], 'key', 'value');

            await storage.clearAll(['nodes', 'peer0']);

            deepStrictEqual([...objects].sort(), [
                'storage.uuid-1',
                'storage.uuid-1.fabrics$$key',
                'storage.uuid-1.nodes$$peer1$$key',
            ]);
        });
    });
});
