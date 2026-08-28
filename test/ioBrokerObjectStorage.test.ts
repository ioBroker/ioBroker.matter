import { deepStrictEqual, ok, strictEqual } from 'node:assert';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IoBrokerObjectStorage } from '../src/matter/IoBrokerObjectStorage';
import { StorageLayout } from '../src/matter/storageLayout';

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

    describe('node data stranded in the instance data directory', () => {
        // Until 1.3.1 the checker matched every context below a peer, so `commissioning` and `network`
        // were written to disk although they belong in the objects database.
        const strandingChecker = (contexts: string[]): boolean =>
            contexts[0]?.startsWith('node-') ||
            (contexts[0] === 'nodes' && contexts[2] === 'endpoints' && contexts[1]?.startsWith('peer'));

        const COMMISSIONING = ['nodes', 'peer1', 'endpoints', '0', 'commissioning'];
        const CLUSTER = ['nodes', 'peer1', 'endpoints', '0', '40'];

        async function withStrandedData(
            test: (storage: IoBrokerObjectStorage, mock: MockAdapter, dir: string) => Promise<void>,
        ): Promise<void> {
            const dir = mkdtempSync(join(tmpdir(), 'iobroker-matter-storage-'));
            try {
                const mock = makeAdapter();
                const stranding = new IoBrokerObjectStorage(mock.adapter, 'controller', dir, strandingChecker);
                await stranding.initialize();
                await stranding.set(COMMISSIONING, 'peerAddress', '{"fabricIndex":1}');
                await stranding.set(CLUSTER, '3', 'Test Product');
                await stranding.set(['node-15398113178295236884', '0', '29'], '0', 'legacy');
                await stranding.close();
                deepStrictEqual([...mock.objects], ['storage.controller']);

                const storage = new IoBrokerObjectStorage(mock.adapter, 'controller', dir, StorageLayout.isClusterData);
                await storage.initialize();
                await test(storage, mock, dir);
                await storage.close();
            } finally {
                rmSync(dir, { recursive: true, force: true });
            }
        }

        it('moves what belongs in the objects database out of the files', async () => {
            await withStrandedData(async (storage, { objects }, dir) => {
                strictEqual(await storage.get(COMMISSIONING, 'peerAddress'), '{"fabricIndex":1}');
                ok(objects.has('storage.controller.nodes$$peer1$$endpoints$$0$$commissioning$$peerAddress'));
                ok(!existsSync(join(dir, 'nodes.peer1.endpoints.0.commissioning.peerAddress')));
            });
        });

        it('leaves cluster data and the legacy layout on disk', async () => {
            await withStrandedData(async (storage, { objects }, dir) => {
                strictEqual(await storage.get(CLUSTER, '3'), 'Test Product');
                strictEqual(await storage.get(['node-15398113178295236884', '0', '29'], '0'), 'legacy');
                ok(existsSync(join(dir, 'nodes.peer1.endpoints.0.40.3')));
                deepStrictEqual(
                    [...objects].filter(id => id.includes('$$40$$') || id.includes('node-')),
                    [],
                );
            });
        });

        it('wipes the cluster files of a node that matter.js erases', async () => {
            // A node is erased at three context depths, none of which names a cluster:
            // ClientEndpointStore.erase(), ClientNodeStore.erase() and ClientNodeStores.erase().
            for (const erased of [['nodes', 'peer1', 'endpoints', '0'], ['nodes', 'peer1', 'endpoints'], ['nodes']]) {
                const dir = mkdtempSync(join(tmpdir(), 'iobroker-matter-storage-'));
                try {
                    const mock = makeAdapter();
                    const storage = new IoBrokerObjectStorage(
                        mock.adapter,
                        'controller',
                        dir,
                        StorageLayout.isClusterData,
                    );
                    await storage.initialize();
                    await storage.set(CLUSTER, '3', 'Test Product');
                    await storage.set(COMMISSIONING, 'peerAddress', '{"fabricIndex":1}');
                    ok(existsSync(join(dir, 'nodes.peer1.endpoints.0.40.3')));

                    await storage.clearAll(erased);

                    ok(!existsSync(join(dir, 'nodes.peer1.endpoints.0.40.3')), `left behind by ${erased.join('$$')}`);
                    strictEqual(await storage.get(CLUSTER, '3'), undefined);
                    await storage.close();
                } finally {
                    rmSync(dir, { recursive: true, force: true });
                }
            }
        });

        it('reports a peer once although both backends hold part of it', async () => {
            await withStrandedData(async storage => {
                deepStrictEqual(storage.contexts(['nodes']), ['peer1']);
                deepStrictEqual(storage.contexts(['nodes', 'peer1', 'endpoints']), ['0']);
            });
        });

        it('does not serve a deleted value from a file that could not be moved', async () => {
            await withStrandedData(async (storage, mock, dir) => {
                // The move of this entry failed, so both a file and, from now on, the objects entry exist
                mock.states.delete(
                    `${NAMESPACE}.storage.controller.nodes$$peer1$$endpoints$$0$$commissioning$$peerAddress`,
                );
                writeFileSync(
                    join(dir, 'nodes.peer1.endpoints.0.commissioning.peerAddress'),
                    '"{\\"fabricIndex\\":1}"',
                );

                await storage.delete(COMMISSIONING, 'peerAddress');

                strictEqual(await storage.get(COMMISSIONING, 'peerAddress'), undefined);
                deepStrictEqual(await storage.values(COMMISSIONING), {});
            });
        });

        it('drops the file when the objects database already holds the value', async () => {
            const dir = mkdtempSync(join(tmpdir(), 'iobroker-matter-storage-'));
            try {
                const mock = makeAdapter();
                const stranding = new IoBrokerObjectStorage(mock.adapter, 'controller', dir, strandingChecker);
                await stranding.initialize();
                await stranding.set(COMMISSIONING, 'peerAddress', '{"fabricIndex":1}');
                await stranding.close();

                // What a start after a failed move writes: the peer reports a new address, and by then the
                // corrected checker routes that write to the objects database
                const current = new IoBrokerObjectStorage(mock.adapter, 'controller', dir, StorageLayout.isClusterData);
                await current.initialize();
                await current.set(COMMISSIONING, 'peerAddress', '{"fabricIndex":2}');
                await current.close();
                writeFileSync(
                    join(dir, 'nodes.peer1.endpoints.0.commissioning.peerAddress'),
                    '"{\\"fabricIndex\\":1}"',
                );

                const storage = new IoBrokerObjectStorage(mock.adapter, 'controller', dir, StorageLayout.isClusterData);
                await storage.initialize();

                strictEqual(await storage.get(COMMISSIONING, 'peerAddress'), '{"fabricIndex":2}');
                ok(!existsSync(join(dir, 'nodes.peer1.endpoints.0.commissioning.peerAddress')));
                await storage.close();
            } finally {
                rmSync(dir, { recursive: true, force: true });
            }
        });

        it('keeps the file when the objects database refuses the value', async () => {
            const dir = mkdtempSync(join(tmpdir(), 'iobroker-matter-storage-'));
            try {
                const mock = makeAdapter();
                const stranding = new IoBrokerObjectStorage(mock.adapter, 'controller', dir, strandingChecker);
                await stranding.initialize();
                await stranding.set(COMMISSIONING, 'peerAddress', '{"fabricIndex":1}');
                await stranding.close();

                // The storage driver logs a write failure and carries on, so a lost write must not take the
                // last copy of the value with it.
                mock.adapter.setState = (() => {
                    throw new Error('objects database unavailable');
                }) as unknown as ioBroker.Adapter['setState'];

                const storage = new IoBrokerObjectStorage(mock.adapter, 'controller', dir, StorageLayout.isClusterData);
                await storage.initialize();

                ok(existsSync(join(dir, 'nodes.peer1.endpoints.0.commissioning.peerAddress')));
                // The file is only worth keeping if it is still the value the storage hands out
                strictEqual(await storage.get(COMMISSIONING, 'peerAddress'), '{"fabricIndex":1}');
                deepStrictEqual(await storage.values(COMMISSIONING), { peerAddress: '{"fabricIndex":1}' });
                deepStrictEqual(await storage.keys(COMMISSIONING), ['peerAddress']);
                await storage.close();
            } finally {
                rmSync(dir, { recursive: true, force: true });
            }
        });
    });
});
