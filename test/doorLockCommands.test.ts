import { expect } from 'chai';
import {
    DeviceTypeId,
    type Endpoint,
    Environment,
    InternalError,
    Lifetime,
    LogLevel,
    Logger,
    RemoteActorContext,
    ServerNode,
    VendorId,
} from '@matter/main';
import { type DoorLockBaseServer, DoorLockServer } from '@matter/main/behaviors';
import { DoorLock } from '@matter/main/clusters';
import { FabricIndex, NodeId, StatusResponseError } from '@matter/main/types';
import type { MessageExchange } from '@matter/main/protocol';
import { StateType, Types } from '@iobroker/type-detector';
import DeviceFactory from '../src/lib/DeviceFactory';
import type { DetectedDevice, DeviceOptions } from '../src/lib/devices/GenericDevice';
import { SubscribeManager } from '../src/lib/SubscribeManager';
import matterDeviceFabric from '../src/matter/to-matter/matterFactory';
import { LockToMatter } from '../src/matter/to-matter/LockToMatter';
import { EventedDoorLockServer } from '../src/matter/behaviors/EventedDoorLockServer';
import { createMatterTestEnvironment } from './helpers/matterTestEnvironment';

// ---------------------------------------------------------------------------------------------------------------
// ioBroker side: a lock whose states are all booleans and record every write the converter makes.
// ---------------------------------------------------------------------------------------------------------------

class MockAdapter {
    readonly namespace = 'matter.0';
    readonly log = {
        silly: (): void => {},
        debug: (): void => {},
        info: (): void => {},
        warn: (): void => {},
        error: (): void => {},
    };
    readonly writes = new Array<{ name: string; val: ioBroker.StateValue }>();
    readonly #prefix: string;
    readonly #states: Set<string>;
    readonly #values = new Map<string, ioBroker.State>();

    constructor(prefix: string, states: string[]) {
        this.#prefix = prefix;
        this.#states = new Set(states);
    }

    #nameOf(id: string): string | undefined {
        const name = id.substring(this.#prefix.length + 1);
        return id.startsWith(`${this.#prefix}.`) && this.#states.has(name) ? name : undefined;
    }

    async getForeignObjectAsync(id: string): Promise<ioBroker.Object | null> {
        if (this.#nameOf(id) === undefined) {
            return null;
        }
        return {
            _id: id,
            type: 'state',
            common: { name: id, type: 'boolean', role: 'state', read: true, write: true },
            native: {},
        } as ioBroker.Object;
    }

    async getForeignStateAsync(id: string): Promise<ioBroker.State | null> {
        if (this.#nameOf(id) === undefined) {
            return null;
        }
        return this.#values.get(id) ?? ({ val: false, ack: true, ts: Date.now() } as ioBroker.State);
    }

    async setForeignStateAsync(id: string, val: ioBroker.StateValue): Promise<void> {
        const name = this.#nameOf(id);
        if (name !== undefined) {
            this.writes.push({ name, val });
        }
        this.#values.set(id, { val, ack: true, ts: Date.now() } as ioBroker.State);
    }

    async subscribeForeignStatesAsync(): Promise<void> {}
    async unsubscribeForeignStatesAsync(): Promise<void> {}
    subscribeStates(): void {}
    unsubscribeStates(): void {}
    async extendObjectAsync(): Promise<void> {}
    extendObject(): void {}
    setTimeout(callback: () => void, ms: number): NodeJS.Timeout {
        return setTimeout(callback, ms);
    }
    clearTimeout(timer: NodeJS.Timeout): void {
        clearTimeout(timer);
    }
}

// ---------------------------------------------------------------------------------------------------------------
// Matter side: the converter's endpoint mounted on a real ServerNode, commands invoked in a remote-actor context.
// ---------------------------------------------------------------------------------------------------------------

let environment: Environment;
let instanceCounter = 0;
const cleanups = new Array<() => Promise<void>>();

interface Mounted {
    adapter: MockAdapter;
    node: ServerNode;
    endpoint: Endpoint;
}

async function mountLock(states: string[]): Promise<Mounted> {
    const index = ++instanceCounter;
    const prefix = `0_userdata.0.lock${index}`;
    const adapter = new MockAdapter(prefix, states);
    SubscribeManager.setAdapter(adapter as unknown as ioBroker.Adapter);

    const detectedDevice: DetectedDevice = {
        type: Types.lock,
        isIoBrokerDevice: true,
        states: states.map(name => ({
            name,
            id: `${prefix}.${name}`,
            type: StateType.Boolean,
            read: true,
            write: true,
        })),
    };
    const options: DeviceOptions = {
        uuid: `lock-${index}`,
        enabled: true,
        name: `Lock ${index}`,
        oid: prefix,
        type: Types.lock,
        auto: false,
        noComposed: false,
    };
    const device = await DeviceFactory(detectedDevice, adapter as unknown as ioBroker.Adapter, options, false);
    const converter = await matterDeviceFabric(device, `Lock ${index}`, `lock-${index}`);
    expect(converter).to.be.instanceOf(LockToMatter);

    const node = await ServerNode.create(ServerNode.RootEndpoint, {
        environment,
        id: `lock-test-${index}`,
        network: { port: 0 },
        productDescription: { name: 'Test', deviceType: DeviceTypeId(0x0016) },
        basicInformation: {
            vendorName: 'ioBroker',
            vendorId: VendorId(0xfff1),
            productName: 'Test',
            productId: 0x8000,
        },
    });
    const [endpoint] = converter!.matterEndpoints;
    await node.add(endpoint);
    await converter!.init();
    adapter.writes.length = 0;

    cleanups.push(async () => {
        await node.close();
        await converter!.destroy();
    });
    return { adapter, node, endpoint };
}

/**
 * matter.js refuses lock commands without the fabric of a remote requester, so `endpoint.act()` cannot drive them.
 * This builds the context an authenticated CASE session on fabric 1 would produce.
 */
function remoteContext(node: ServerNode): ReturnType<typeof RemoteActorContext> {
    const fabricIndex = FabricIndex(1);
    const exchange = {
        session: {
            isSecure: true,
            fabric: { fabricIndex },
            subjectFor: () => ({ kind: 'node', id: NodeId(1), fabricIndex }),
            supportsLargeMessages: false,
        },
        via: 'test-controller',
        closing: { once: (): void => {} },
        join: (...name: unknown[]) => Lifetime.mock.join(...name),
    } as unknown as MessageExchange;
    return RemoteActorContext({ node, exchange, command: true });
}

const UnboltingDoorLockServer = DoorLockServer.with(DoorLock.Feature.Unbolting);
type UnboltingDoorLockServer = InstanceType<typeof UnboltingDoorLockServer>;

function hasUnbolting(doorLock: DoorLockServer): doorLock is UnboltingDoorLockServer {
    return doorLock.features.unbolting;
}

type DoorLockCommand = 'lockDoor' | 'unlockDoor' | 'unboltDoor';

async function invoke(mounted: Mounted, command: DoorLockCommand): Promise<void> {
    await remoteContext(mounted.node).act(context => {
        const doorLock = mounted.endpoint.agentFor(context).get(DoorLockServer);
        if (command !== 'unboltDoor') {
            return doorLock[command]({});
        }
        expect(hasUnbolting(doorLock), 'UnboltDoor needs the Unbolting feature').to.equal(true);
        return hasUnbolting(doorLock) ? doorLock.unboltDoor({}) : undefined;
    });
}

function lockStateOf(mounted: Mounted): DoorLock.LockState | null {
    return mounted.endpoint.stateOf(DoorLockServer).lockState;
}

describe('LockToMatter door lock commands', function () {
    this.timeout(30000);

    let previousLogLevel: LogLevel;

    before(async () => {
        previousLogLevel = Logger.defaultLogLevel;
        Logger.defaultLogLevel = LogLevel.FATAL;
        environment = await createMatterTestEnvironment('door-lock-commands-test');
    });

    afterEach(async () => {
        while (cleanups.length) {
            await cleanups.pop()!();
        }
        SubscribeManager.subscribes.clear();
    });

    after(() => {
        Logger.defaultLogLevel = previousLogLevel;
    });

    it('LockDoor locks the ioBroker lock', async () => {
        const mounted = await mountLock(['SET']);
        await mounted.endpoint.setStateOf(DoorLockServer, {
            lockState: DoorLock.LockState.Unlocked,
        });

        await invoke(mounted, 'lockDoor');

        expect(mounted.adapter.writes).to.deep.equal([{ name: 'SET', val: false }]);
        expect(lockStateOf(mounted)).to.equal(DoorLock.LockState.Locked);
    });

    it('UnlockDoor without Unbolting unlocks the ioBroker lock', async () => {
        const mounted = await mountLock(['SET']);

        await invoke(mounted, 'unlockDoor');

        expect(mounted.adapter.writes).to.deep.equal([{ name: 'SET', val: true }]);
        expect(lockStateOf(mounted)).to.equal(DoorLock.LockState.Unlocked);
    });

    it('UnlockDoor with Unbolting unlocks and opens the ioBroker lock', async () => {
        const mounted = await mountLock(['SET', 'OPEN']);
        expect(mounted.endpoint.stateOf('doorLock').featureMap).to.include({ unbolting: true });

        await invoke(mounted, 'unlockDoor');

        expect(mounted.adapter.writes).to.deep.equal([
            { name: 'SET', val: true },
            { name: 'OPEN', val: true },
        ]);
        expect(lockStateOf(mounted)).to.equal(DoorLock.LockState.Unlocked);
    });

    it('UnboltDoor unlocks the ioBroker lock without opening it', async () => {
        const mounted = await mountLock(['SET', 'OPEN']);

        await invoke(mounted, 'unboltDoor');

        expect(mounted.adapter.writes).to.deep.equal([{ name: 'SET', val: true }]);
        expect(lockStateOf(mounted)).to.equal(DoorLock.LockState.Unlocked);
    });

    it('a remote UnlockDoor refused in NoRemoteLockUnlock never reaches ioBroker', async () => {
        const mounted = await mountLock(['SET', 'OPEN']);
        await mounted.endpoint.setStateOf(DoorLockServer, {
            operatingMode: DoorLock.OperatingMode.NoRemoteLockUnlock,
        });

        let refusal: unknown;
        try {
            await invoke(mounted, 'unlockDoor');
        } catch (error) {
            refusal = error;
        }

        expect(refusal)
            .to.be.instanceOf(StatusResponseError)
            .with.property('message')
            .that.matches(/operating mode/);
        expect(mounted.adapter.writes).to.deep.equal([]);
        expect(lockStateOf(mounted)).to.equal(DoorLock.LockState.Locked);
    });

    it('the command waits for the ioBroker write: a rejected write fails it and keeps lockState', async () => {
        const mounted = await mountLock(['SET']);
        mounted.adapter.setForeignStateAsync = (): Promise<void> => Promise.reject(new Error('adapter down'));

        let failure: unknown;
        try {
            await invoke(mounted, 'unlockDoor');
        } catch (error) {
            failure = error;
        }

        expect(failure)
            .to.be.instanceOf(StatusResponseError)
            .with.property('message')
            .that.matches(/hardware failed/);
        expect(lockStateOf(mounted)).to.equal(DoorLock.LockState.Locked);
    });

    it('auto-relock locks the ioBroker lock', async () => {
        const mounted = await mountLock(['SET']);
        await mounted.endpoint.setStateOf(DoorLockServer, { autoRelockTime: 1 });

        await invoke(mounted, 'unlockDoor');
        expect(lockStateOf(mounted)).to.equal(DoorLock.LockState.Unlocked);

        const deadline = Date.now() + 5000;
        while (lockStateOf(mounted) !== DoorLock.LockState.Locked && Date.now() < deadline) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        expect(lockStateOf(mounted)).to.equal(DoorLock.LockState.Locked);
        expect(mounted.adapter.writes).to.deep.equal([
            { name: 'SET', val: true },
            { name: 'SET', val: false },
        ]);
    });

    it('an unknown actuation fails the command instead of reporting success', async () => {
        const mounted = await mountLock(['SET']);
        const unknownActuation = 'spin' as DoorLockBaseServer.Actuation;

        let failure: unknown;
        try {
            await mounted.endpoint.eventsOf(EventedDoorLockServer).lockActuationRequested.emit(unknownActuation);
        } catch (error) {
            failure = error;
        }

        expect(failure).to.be.instanceOf(InternalError).with.property('message').that.matches(/spin/);
        expect(mounted.adapter.writes).to.deep.equal([]);
    });
});
