import { expect } from 'chai';
import {
    AttributeId,
    ClusterId,
    ControllerBehavior,
    EndpointNumber,
    MockStorageService,
    ServerNode,
    StorageService,
    type Environment,
    type SupportedStorageTypes,
} from '@matter/main';
import { LevelControl, OnOff } from '@matter/main/clusters';
import { FabricAuthority } from '@matter/main/protocol';
import { createMatterTestEnvironment } from './helpers/matterTestEnvironment';
import { MockControllerAdapter } from './helpers/mockControllerAdapter';
import { SubscribeManager } from '../src/lib/SubscribeManager';
import ioBrokerDeviceFabric from '../src/matter/to-iobroker/ioBrokerFactory';
import type { GenericDeviceToIoBroker } from '../src/matter/to-iobroker/GenericDeviceToIoBroker';

/**
 * Drives an OnOff report of a speaker through `GenericDeviceToIoBroker.handleChangedAttribute`, the entry point
 * `ControllerNode` calls for every attribute change. The peer is restored from storage, so no commissioning and
 * no network is needed.
 */

type Store = Record<string, Record<string, SupportedStorageTypes>>;

const NAMESPACE = 'controller';
const FABRIC_LABEL = 'test-fabric';
const SPEAKER_DEVICE_TYPE = 0x0022;
const BASE_ID = 'controller.node.speaker';

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

function seedSpeaker(store: Store, fabricIndex: number, onOff: boolean): void {
    const root = 'nodes.peer1.endpoints.0';
    store[`${root}.commissioning`] = {
        peerAddress: { fabricIndex, nodeId: 15398113178295236884n },
        addresses: [{ ip: '127.0.0.1', port: 5540, type: 'udp' }],
        fabricIndexOnPeer: 1,
        deviceIdentifier: 'AAAAAAAAAAAAAAAA-BBBBBBBBBBBBBBBB._matter._tcp.local',
        discoveredAt: 1767704480040,
        ttl: 120000,
    };
    store[`${root}.29`] = descriptor(22, [29, 40], [1]);
    store[`${root}.40`] = {
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
    store['nodes.peer1.endpoints.1.29'] = descriptor(SPEAKER_DEVICE_TYPE, [29, 6, 8], []);
    store['nodes.peer1.endpoints.1.6'] = {
        '0': onOff,
        '65528': [],
        '65529': [0, 1, 2],
        '65531': [0, 65528, 65529, 65531, 65532, 65533],
        '65532': { lighting: false, deadFrontBehavior: false, offOnly: false },
        '65533': 6,
        __version__: 3,
    };
    store['nodes.peer1.endpoints.1.8'] = {
        '0': 100,
        '15': {},
        '17': null,
        '65528': [],
        '65529': [0, 1, 2, 3, 4, 5, 6, 7],
        '65531': [0, 15, 17, 65528, 65529, 65531, 65532, 65533],
        '65532': { onOff: true, lighting: false, frequency: false },
        '65533': 6,
        __version__: 4,
    };
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

async function withSpeaker(
    onOff: boolean,
    action: (device: GenericDeviceToIoBroker, adapter: MockControllerAdapter) => Promise<void>,
): Promise<void> {
    const environment = await createMatterTestEnvironment('speaker-mute-report');
    const storage = environment.get(StorageService);
    if (!(storage instanceof MockStorageService)) {
        throw new Error('the test environment must keep its storage in memory');
    }

    const firstBoot = await createControllerNode(environment);
    let fabricIndex: number;
    try {
        const fabricAuthority = await firstBoot.env.load(FabricAuthority);
        fabricIndex = (await fabricAuthority.defaultFabric({ adminFabricLabel: FABRIC_LABEL })).fabricIndex;
    } finally {
        await firstBoot.close();
    }
    seedSpeaker(storage.store(NAMESPACE).data, fabricIndex, onOff);

    const controller = await createControllerNode(environment);
    const adapter = new MockControllerAdapter();
    SubscribeManager.setAdapter(adapter as unknown as ioBroker.Adapter);
    let device: GenericDeviceToIoBroker | undefined;
    try {
        const [peer] = [...controller.peers];
        const endpoint = peer.endpoints.for(1);
        await adapter.extendObjectAsync(BASE_ID, { type: 'device', common: { name: 'speaker' }, native: {} });
        device = await ioBrokerDeviceFabric(
            peer,
            endpoint,
            peer,
            adapter as unknown as ioBroker.Adapter,
            BASE_ID,
            'controller.node.info.connection',
            'speaker',
        );
        await action(device, adapter);
    } finally {
        await device?.destroy();
        adapter.clearAllTimers();
        SubscribeManager.subscribes.clear();
        await controller.close();
    }
}

const reportOnOff = (device: GenericDeviceToIoBroker, onOff: boolean): Promise<void> =>
    device.handleChangedAttribute({
        endpointId: EndpointNumber(1),
        clusterId: ClusterId(OnOff.Cluster.id),
        attributeId: AttributeId(OnOff.Cluster.attributes.onOff.id),
        attributeName: 'onOff',
        value: onOff,
    });

describe('SpeakerToIoBroker (controller: Matter reports to ioBroker states)', () => {
    it('shows OnOff false as MUTE true and OnOff true as MUTE false', async () => {
        await withSpeaker(true, async (device, adapter) => {
            expect(device.constructor.name).to.equal('SpeakerToIoBroker');
            expect(adapter.valueOf(BASE_ID, 'MUTE')).to.equal(false);

            await reportOnOff(device, false);
            expect(adapter.states.get(`${BASE_ID}.MUTE`)).to.include({ val: true, ack: true });

            await reportOnOff(device, true);
            expect(adapter.states.get(`${BASE_ID}.MUTE`)).to.include({ val: false, ack: true });
        });
    }).timeout(20000);

    it('keeps the level mapping of CurrentLevel next to MUTE', async () => {
        await withSpeaker(false, async (device, adapter) => {
            expect(adapter.valueOf(BASE_ID, 'MUTE')).to.equal(true);
            await device.handleChangedAttribute({
                endpointId: EndpointNumber(1),
                clusterId: ClusterId(LevelControl.Cluster.id),
                attributeId: AttributeId(LevelControl.Cluster.attributes.currentLevel.id),
                attributeName: 'currentLevel',
                value: 254,
            });
            expect(adapter.valueOf(BASE_ID, 'SET')).to.equal(100);
            expect(adapter.valueOf(BASE_ID, 'MUTE')).to.equal(true);
        });
    }).timeout(20000);
});
