import { strictEqual } from 'node:assert';
import { ControllerBehavior, Environment, ServerNode } from '@matter/main';
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
async function restartWithSeededPeer(options?: SeedOptions): Promise<{
    isCommissioned: boolean;
    isSeeded: boolean;
    endpointCount: number;
}> {
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
        const peers = [...secondBoot.peers];
        strictEqual(peers.length, 1, 'the persisted peer must be loaded');
        const [peer] = peers;
        return {
            isCommissioned: peer.lifecycle.isCommissioned,
            isSeeded: peer.lifecycle.isSeeded,
            endpointCount: peer.endpoints.size,
        };
    } finally {
        await secondBoot.close();
    }
}

describe('ClientNode hydration', () => {
    it('seeds a persisted peer without contacting it', async () => {
        const peer = await restartWithSeededPeer();

        strictEqual(peer.isCommissioned, true);
        strictEqual(peer.endpointCount, 2);
        strictEqual(peer.isSeeded, true);
    }).timeout(20000);

    it('leaves a peer unseeded when its BasicInformation was never persisted', async () => {
        const peer = await restartWithSeededPeer({ withBasicInformation: false });

        strictEqual(peer.isCommissioned, true);
        strictEqual(peer.endpointCount, 2);
        strictEqual(peer.isSeeded, false);
    }).timeout(20000);
});
