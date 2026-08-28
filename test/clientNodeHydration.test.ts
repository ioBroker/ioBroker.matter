import { strictEqual } from 'node:assert';
import { ControllerBehavior, EndpointLifecycle, Environment, ServerNode, type ClientNode } from '@matter/main';
import { MockStorageService, StorageService, type SupportedStorageTypes } from '@matter/general';
import { FabricAuthority } from '@matter/main/protocol';

/**
 * The controller rebuilds the ioBroker objects of a paired node only once matter.js reports the node as seeded
 * (`GeneralMatterNode.initialize()`).  A node that is powered off while the adapter starts never connects, so the
 * objects survive a restart only if matter.js seeds it from its persisted structure alone.
 */

type Store = Record<string, Record<string, SupportedStorageTypes>>;

const NAMESPACE = 'controller';
const FABRIC_LABEL = 'test-fabric';
const PEER_NODE_ID = 15398113178295236884n;

function descriptor(
    deviceType: number,
    serverList: number[],
    partsList: number[],
): Record<string, SupportedStorageTypes> {
    return {
        '0': [{ deviceType, revision: 1 }],
        '1': serverList,
        '2': [],
        '3': partsList,
        '65528': [],
        '65529': [],
        '65531': [0, 1, 2, 3, 65528, 65529, 65531, 65532, 65533],
        '65532': { tagList: false },
        '65533': 2,
        __version__: 1,
    };
}

function basicInformation(): Record<string, SupportedStorageTypes> {
    return {
        '0': 17,
        '1': 'Test Vendor',
        '2': 4442,
        '3': 'Test Product',
        '4': 67,
        '5': '',
        '65528': [],
        '65529': [],
        '65531': [0, 1, 2, 3, 4, 5, 65528, 65529, 65531, 65532, 65533],
        '65532': {},
        '65533': 2,
        __version__: 2,
    };
}

function onOff(): Record<string, SupportedStorageTypes> {
    return {
        '0': true,
        '65528': [],
        '65529': [0, 1, 2],
        '65531': [0, 65528, 65529, 65531, 65532, 65533],
        '65532': { lighting: false, deadFrontBehavior: false, offOnly: false },
        '65533': 6,
        __version__: 3,
    };
}

interface SeedOptions {
    withBasicInformation?: boolean;
}

/** Writes the structure matter.js persists for a commissioned peer with one application endpoint. */
function seedPeer(store: Store, fabricIndex: number, options?: SeedOptions): void {
    const withBasicInformation = options?.withBasicInformation ?? true;
    const root = 'nodes.peer1.endpoints.0';

    store[`${root}.commissioning`] = {
        peerAddress: { fabricIndex, nodeId: PEER_NODE_ID },
        addresses: [{ ip: '127.0.0.1', port: 5540, type: 'udp' }],
        fabricIndexOnPeer: 1,
        deviceIdentifier: 'AAAAAAAAAAAAAAAA-BBBBBBBBBBBBBBBB._matter._tcp.local',
        discoveredAt: 1767704480040,
        ttl: 120000,
    };
    store[`${root}.29`] = descriptor(22, withBasicInformation ? [29, 40] : [29], [1]);
    if (withBasicInformation) {
        store[`${root}.40`] = basicInformation();
    }
    store['nodes.peer1.endpoints.1.29'] = descriptor(256, [29, 6], []);
    store['nodes.peer1.endpoints.1.6'] = onOff();
}

async function createControllerNode(environment: Environment): Promise<ServerNode> {
    return ServerNode.create(ServerNode.RootEndpoint.with(ControllerBehavior), {
        environment,
        id: NAMESPACE,
        commissioning: { enabled: false },
        subscriptions: { persistenceEnabled: false },
        controller: { adminFabricLabel: FABRIC_LABEL },
    });
}

/**
 * Boots a controller once to obtain its fabric, then boots a second time against the same storage with a peer
 * seeded into it.  The second boot is what an adapter restart looks like to matter.js.
 */
async function withRestoredPeer<T>(action: (peer: ClientNode) => Promise<T>, options?: SeedOptions): Promise<T> {
    const environment = new Environment('test', Environment.default);
    const storage = new MockStorageService(environment);
    environment.set(StorageService, storage);

    let fabricIndex: number;
    const firstBoot = await createControllerNode(environment);
    try {
        const fabricAuthority = await firstBoot.env.load(FabricAuthority);
        fabricIndex = (await fabricAuthority.defaultFabric({ adminFabricLabel: FABRIC_LABEL })).fabricIndex;
    } finally {
        await firstBoot.close();
    }

    seedPeer(storage.store(NAMESPACE).data, fabricIndex, options);

    const secondBoot = await createControllerNode(environment);
    try {
        const [peer] = [...secondBoot.peers];
        strictEqual(peer !== undefined, true, 'the persisted peer must be loaded');
        return await action(peer);
    } finally {
        await secondBoot.close();
    }
}

async function restartWithSeededPeer(options?: SeedOptions): Promise<{
    isCommissioned: boolean;
    isSeeded: boolean;
    endpointCount: number;
}> {
    return withRestoredPeer(
        async peer => ({
            isCommissioned: peer.lifecycle.isCommissioned,
            isSeeded: peer.lifecycle.isSeeded,
            endpointCount: peer.endpoints.size,
        }),
        options,
    );
}

describe('ClientNode hydration', () => {
    it('seeds a persisted peer without contacting it', async () => {
        const peer = await restartWithSeededPeer();

        strictEqual(peer.isCommissioned, true);
        strictEqual(peer.endpointCount, 2);
        strictEqual(peer.isSeeded, true);
    }).timeout(20000);

    // The controller rebuilds a peer's ioBroker structure from these two signals: no change notification
    // reports an endpoint that appeared, and none reaches a peer restored from storage at all.
    it('reports an endpoint that appears on a restored peer', async () => {
        const installed = await withRestoredPeer(async peer => {
            const seen = new Array<string>();
            peer.lifecycle.changed.on((type, endpoint) => {
                if (type === EndpointLifecycle.Change.Installed && endpoint !== peer) {
                    seen.push(endpoint.maybeId ?? String(endpoint.maybeNumber));
                }
            });

            peer.endpoints.require(2, { deviceType: 256 });
            return seen;
        });

        strictEqual(installed.length, 1, `expected one installed endpoint, saw ${installed.join(', ')}`);
    }).timeout(20000);

    it('announces the teardown of a peer before its endpoints are destroyed', async () => {
        const order = await withRestoredPeer(async peer => {
            const seen = new Array<string>();
            peer.lifecycle.changed.on((type, endpoint) => {
                if (type === EndpointLifecycle.Change.Destroying || type === EndpointLifecycle.Change.Destroyed) {
                    seen.push(`${type}:${endpoint === peer ? 'peer' : 'endpoint'}`);
                }
            });

            await peer.delete();
            return seen;
        });

        strictEqual(order[0], 'destroying:peer', `saw ${order.join(', ')}`);
        strictEqual(
            order.includes('destroyed:endpoint'),
            true,
            `an endpoint must be destroyed after the peer announced its teardown, saw ${order.join(', ')}`,
        );
    }).timeout(20000);

    it('leaves a peer unseeded when its BasicInformation was never persisted', async () => {
        const peer = await restartWithSeededPeer({ withBasicInformation: false });

        strictEqual(peer.isCommissioned, true);
        strictEqual(peer.endpointCount, 2);
        strictEqual(peer.isSeeded, false);
    }).timeout(20000);
});
