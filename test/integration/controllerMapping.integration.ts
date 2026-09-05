/**
 * Integration test for the Matter -> ioBroker (controller) mapping.
 *
 * A real matter.js bridge runs in its own process, a real controller commissions it, and every bridged endpoint is
 * fed through the production factory (`identifyDeviceTypes` + `ioBrokerDeviceFabric`) against a mock adapter. What
 * is exercised: device-type identification over the wire, converter selection, ioBroker device construction and the
 * state objects/values the converters create. What is not: the ioBroker object database, `MatterAdapter` startup,
 * and the write direction back to Matter.
 */

import { expect } from 'chai';
import type { ChildProcess } from 'node:child_process';
import type { ClientNode, Endpoint } from '@matter/main';
import { Logger, LogLevel } from '@matter/main';
import { AttributeId, ClusterId, EndpointNumber, NodeId } from '@matter/main/types';
import { BridgedDeviceBasicInformationClient, TemperatureMeasurementClient } from '@matter/main/behaviors';
import {
    ActivatedCarbonFilterMonitoring,
    FanControl,
    ResourceMonitoring,
    RvcOperationalState,
    RvcRunMode,
} from '@matter/main/clusters';
import { AggregatorEndpointDefinition } from '@matter/main/endpoints';
import { getIoBrokerDeviceStates } from '../../src/lib/deviceDetection';
import { SubscribeManager } from '../../src/lib/SubscribeManager';
import { toHex } from '../../src/lib/utils';
import type { GenericDeviceToIoBroker } from '../../src/matter/to-iobroker/GenericDeviceToIoBroker';
import ioBrokerDeviceFabric, {
    childEndpointsAreOwnDevices,
    identifyDeviceTypes,
} from '../../src/matter/to-iobroker/ioBrokerFactory';
import { GeneralMatterNode } from '../../src/matter/GeneralMatterNode';
import type { MatterAdapter } from '../../src/main';
import { BRIDGE_DISCRIMINATOR, BRIDGE_PASSCODE } from '../fixtures/bridgeConstants';
import { ALL_ENDPOINTS, OWNED_CHILD_ENDPOINTS } from '../fixtures/testBridgeDefinition';
import {
    createTempStorage,
    pickBridgePort,
    removeTempStorage,
    startBridgeFixture,
    stopBridgeFixture,
    waitForBridgeReady,
} from '../helpers/bridgeFixtureProcess';
import { MockControllerAdapter } from '../helpers/mockControllerAdapter';
import { commissionFixture, type CommissionedFixture } from '../helpers/testMatterController';

interface MappedEndpoint {
    device?: GenericDeviceToIoBroker<any>;
    baseId: string;
    matterDeviceTypeId?: number;
    error?: unknown;
}

/** The node id the controller gave the fixture, which a `ClientNode` carries in its commissioning state. */
function peerNodeId(peer: ClientNode): NodeId {
    const nodeId = peer.state.commissioning.peerAddress?.nodeId;
    if (nodeId === undefined) {
        throw new Error('the commissioned fixture has no node id');
    }
    return nodeId;
}

describe('Matter -> ioBroker controller mapping', function () {
    this.timeout(600_000);

    let bridge: ChildProcess | undefined;
    let bridgeStorage: string | undefined;
    let controllerStorage: string | undefined;
    let commissioned: CommissionedFixture | undefined;
    let adapter: MockControllerAdapter;
    let previousLogLevel: LogLevel;
    const mapped = new Map<string, MappedEndpoint>();
    const ownedChildren = new Array<string>();

    before(async () => {
        previousLogLevel = Logger.defaultLogLevel;
        Logger.defaultLogLevel = process.env.MATTER_LOG_LEVEL === 'debug' ? LogLevel.DEBUG : LogLevel.FATAL;

        // mDNS on a host with VPN/tunnel interfaces sometimes announces only unreachable addresses on the first
        // attempt; a fresh fixture and controller recover from that, so retry rather than fail the whole suite.
        const attempts = 3;
        for (let attempt = 1; attempt <= attempts; attempt++) {
            bridgeStorage = await createTempStorage('iobroker-matter-bridge-');
            controllerStorage = await createTempStorage('iobroker-matter-controller-');
            bridge = startBridgeFixture(bridgeStorage, pickBridgePort(), process.env.BRIDGE_VERBOSE === 'true');
            console.log(`    attempt ${attempt}/${attempts}: waiting for the bridge fixture to come online...`);
            try {
                await waitForBridgeReady(bridge);
                console.log('    commissioning the bridge...');
                commissioned = await commissionFixture({
                    storagePath: controllerStorage,
                    passcode: BRIDGE_PASSCODE,
                    discriminator: BRIDGE_DISCRIMINATOR,
                    fabricLabel: 'ioBroker Test',
                    timeoutMs: 45_000,
                });
                break;
            } catch (error) {
                console.log(`    attempt ${attempt} failed: ${String(error)}`);
                await stopBridgeFixture(bridge);
                bridge = undefined;
                await removeTempStorage(bridgeStorage);
                await removeTempStorage(controllerStorage);
                bridgeStorage = undefined;
                controllerStorage = undefined;
                if (attempt === attempts) {
                    throw error;
                }
            }
        }

        if (!commissioned) {
            throw new Error('Commissioning fixture was not established after retrying');
        }

        console.log('    commissioned; mapping endpoints...');
        adapter = new MockControllerAdapter();
        SubscribeManager.setAdapter(adapter as unknown as ioBroker.Adapter);

        const rootEndpoint = commissioned.node;

        const aggregator = ([...rootEndpoint!.parts] as Endpoint[]).find(
            part =>
                identifyDeviceTypes(part).primaryDeviceType?.deviceType.id === AggregatorEndpointDefinition.deviceType,
        );
        expect(aggregator, 'bridge did not expose an aggregator endpoint').to.not.equal(undefined);

        // Mirrors the recursion of `GeneralMatterNode`: a child endpoint becomes a device of its own exactly when
        // `childEndpointsAreOwnDevices` says the parent does not own it.
        const mapEndpoint = async (endpoint: Endpoint, key: string, connectionStateId?: string): Promise<void> => {
            const baseId = `controller.node.${key}`;
            const deviceTypes = identifyDeviceTypes(endpoint);
            const matterDeviceTypeId = deviceTypes.primaryDeviceType?.deviceType.id;
            // `GeneralMatterNode` creates this before mapping; without it the states below have no device
            // object and the ioBroker type detector cannot group them.
            await adapter.extendObjectAsync(baseId, { type: 'device', common: { name: key }, native: {} });
            // Per endpoint, so one converter throwing does not hide the mapping of all the others.
            try {
                const device = await ioBrokerDeviceFabric(
                    commissioned!.node,
                    endpoint,
                    rootEndpoint!,
                    adapter as unknown as ioBroker.Adapter,
                    baseId,
                    connectionStateId ?? 'controller.node.info.connection',
                    key,
                );
                mapped.set(key, { device, baseId, matterDeviceTypeId });
            } catch (error) {
                mapped.set(key, { baseId, matterDeviceTypeId, error });
            }
            const ownDevices =
                endpoint.number !== undefined && childEndpointsAreOwnDevices(endpoint.number, deviceTypes);
            for (const child of [...endpoint.parts] as Endpoint[]) {
                const childKey = `${key}/${identifyDeviceTypes(child).primaryDeviceType?.deviceType.name ?? 'Unknown'}`;
                if (!ownDevices) {
                    ownedChildren.push(childKey);
                    continue;
                }
                expect(mapped.has(childKey), `duplicate endpoint key ${childKey}`).to.equal(false);
                await mapEndpoint(child, childKey, mapped.get(key)?.device?.connectionStateId ?? connectionStateId);
            }
        };

        for (const endpoint of [...aggregator!.parts] as Endpoint[]) {
            await mapEndpoint(
                endpoint,
                endpoint.maybeStateOf(BridgedDeviceBasicInformationClient)?.nodeLabel ?? String(endpoint.number),
            );
        }
    });

    after(async () => {
        try {
            for (const { device } of mapped.values()) {
                await device?.destroy().catch(() => undefined);
            }
            adapter?.clearAllTimers();
            SubscribeManager.subscribes.clear();
            // A hanging controller shutdown must not cost us the process and the temp directories below.
            await Promise.race([
                commissioned?.close().catch(() => undefined) ?? Promise.resolve(),
                new Promise(resolve => setTimeout(resolve, 20_000)),
            ]);
        } finally {
            await stopBridgeFixture(bridge);
            await removeTempStorage(bridgeStorage);
            await removeTempStorage(controllerStorage);
            Logger.defaultLogLevel = previousLogLevel;
        }
    });

    it('maps every bridged endpoint the fixture exposes', async () => {
        if (process.env.DUMP_MAPPING === 'true') {
            for (const [id, { device, baseId, error }] of mapped) {
                // Without a preferred type, so the dump shows which device the states describe on their own.
                const detected = await getIoBrokerDeviceStates(adapter, `${adapter.namespace}.${baseId}`);
                console.log(
                    `${id}\t${device?.constructor.name ?? `THREW ${String(error)}`}\t${device?.ioBrokerDevice.deviceType}\tdetected=${detected?.type ?? 'none'}\t${adapter
                        .statesBelow(baseId)
                        .map(name => `${name}=${JSON.stringify(adapter.valueOf(baseId, name))}`)
                        .join(' ')}`,
                );
            }
        }
        expect([...mapped.keys()].sort()).to.deep.equal(ALL_ENDPOINTS.map(spec => spec.id).sort());
    });

    it('leaves the parts of a composed device to their parent', () => {
        expect(ownedChildren.sort()).to.deep.equal([...OWNED_CHILD_ENDPOINTS].sort());
        for (const id of OWNED_CHILD_ENDPOINTS) {
            expect([...mapped.keys()], `${id} must not become an own device`).to.not.contain(id);
        }
    });

    for (const spec of ALL_ENDPOINTS) {
        describe(`${spec.id} (device type 0x${spec.deviceType.toString(16).padStart(4, '0')})`, () => {
            if (spec.expectedThrowMessage !== undefined) {
                it('currently fails to map', () => {
                    const entry = mapped.get(spec.id);
                    expect(entry, `endpoint ${spec.id} was not mapped`).to.not.equal(undefined);
                    expect(entry!.matterDeviceTypeId).to.equal(spec.deviceType);
                    expect(String(entry!.error)).to.contain(spec.expectedThrowMessage);
                });
                return;
            }

            it('declares the Matter device type the fixture mounted', () => {
                const entry = mapped.get(spec.id);
                expect(entry, `endpoint ${spec.id} was not mapped`).to.not.equal(undefined);
                expect(entry!.matterDeviceTypeId).to.equal(spec.deviceType);
            });

            it(`selects ${spec.expectedConverter}`, () => {
                const entry = mapped.get(spec.id);
                expect(entry, `endpoint ${spec.id} was not mapped`).to.not.equal(undefined);
                expect(entry!.error, `mapping ${spec.id} threw`).to.equal(undefined);
                expect(entry!.device!.constructor.name).to.equal(spec.expectedConverter);
            });

            it(`reports the device type as ${spec.unmapped ? 'unsupported' : 'supported'}`, () => {
                const entry = mapped.get(spec.id)!;
                expect(entry.device!.deviceTypeSupported).to.equal(spec.unmapped !== true);
            });

            it(`produces the ioBroker device type ${spec.expectedIoBrokerType}`, () => {
                const entry = mapped.get(spec.id)!;
                expect(entry.device!.ioBrokerDevice.deviceType).to.equal(spec.expectedIoBrokerType);
            });

            it('creates exactly the expected states', () => {
                const entry = mapped.get(spec.id)!;
                expect(adapter.statesBelow(entry.baseId)).to.deep.equal([...spec.expectedStates].sort());
            });

            it('is detected again as an ioBroker device by the type detector', async () => {
                const entry = mapped.get(spec.id)!;
                const expected =
                    spec.expectedDetectedType === undefined ? spec.expectedIoBrokerType : spec.expectedDetectedType;
                // Asked the way the adapter asks: with the type the converter declares. A different answer
                // means a bridge pointed at these states would not get the device the controller reports.
                const detected = await getIoBrokerDeviceStates(
                    adapter,
                    `${adapter.namespace}.${entry.baseId}`,
                    spec.expectedIoBrokerType,
                );
                expect(detected?.type ?? null).to.equal(expected);
                if (detected === null) {
                    return;
                }
                // The detector may leave optional slots empty, but it must not reach outside the device.
                const prefix = `${adapter.namespace}.${entry.baseId}.`;
                const created = adapter.statesBelow(entry.baseId);
                for (const state of detected.states) {
                    expect(state.id!.startsWith(prefix), `${state.name} points outside at ${state.id}`).to.equal(true);
                    expect(created, `${state.name} points at ${state.id}, which was not created`).to.contain(
                        state.id!.substring(prefix.length),
                    );
                }
            });

            if (spec.expectedValues !== undefined) {
                it('initializes the states from the Matter attribute values', () => {
                    const entry = mapped.get(spec.id)!;
                    for (const [name, value] of Object.entries(spec.expectedValues!)) {
                        expect(adapter.valueOf(entry.baseId, name), `${spec.id}.${name}`).to.equal(value);
                    }
                });
            }
        });
    }

    /**
     * The per-endpoint checks above only see the values the mapping wrote at startup, so a property that is never
     * updated again reads as correct there. These drive an attribute change through the production dispatch.
     */
    describe('attribute changes after the initial read', () => {
        const CLUSTERS = [
            RvcRunMode.Cluster,
            RvcOperationalState.Cluster,
            ActivatedCarbonFilterMonitoring.Cluster,
            FanControl.Cluster,
        ];

        const pushAttribute = async (id: string, clusterId: number, attributeName: string, value: unknown) => {
            const entry = mapped.get(id)!;
            const cluster = CLUSTERS.find(candidate => candidate.id === clusterId)!;
            const attribute = Reflect.get(cluster.attributes, attributeName) as { id: number };
            await entry.device!.handleChangedAttribute({
                endpointId: EndpointNumber(entry.device!.number),
                clusterId: ClusterId(clusterId),
                attributeId: AttributeId(attribute.id),
                attributeName,
                value,
            });
        };

        it('carries a run mode change into both RUN_MODE and POWER', async () => {
            const { baseId } = mapped.get('roboticvacuum')!;
            expect(adapter.valueOf(baseId, 'RUN_MODE')).to.equal(1);
            expect(adapter.valueOf(baseId, 'POWER')).to.equal(true);

            // 7 is the robot's own Idle mode
            await pushAttribute('roboticvacuum', RvcRunMode.id, 'currentMode', 7);
            expect(adapter.valueOf(baseId, 'RUN_MODE')).to.equal(0);
            expect(adapter.valueOf(baseId, 'POWER')).to.equal(false);

            // 9 is its Mapping mode
            await pushAttribute('roboticvacuum', RvcRunMode.id, 'currentMode', 9);
            expect(adapter.valueOf(baseId, 'RUN_MODE')).to.equal(2);
            expect(adapter.valueOf(baseId, 'POWER')).to.equal(true);
        });

        it('clears PHASE when the robot reports no phase', async () => {
            const { baseId } = mapped.get('roboticvacuum')!;
            expect(adapter.valueOf(baseId, 'PHASE')).to.equal('Sweeping');

            await pushAttribute('roboticvacuum', RvcOperationalState.id, 'currentPhase', 1);
            expect(adapter.valueOf(baseId, 'PHASE')).to.equal('Mopping');

            await pushAttribute('roboticvacuum', RvcOperationalState.id, 'currentPhase', null);
            expect(adapter.valueOf(baseId, 'PHASE')).to.equal('');
        });

        /**
         * The two filter monitoring clusters both feed one ioBroker state. A property is enabled once, so the second
         * of them reaches the state through a handler of its own, and only a change proves that handler is wired.
         */
        it('carries a carbon filter change into the shared filter state', async () => {
            const { baseId } = mapped.get('airpurifier')!;
            expect(adapter.valueOf(baseId, 'FILTER_CHANGE')).to.equal(true);

            await pushAttribute(
                'airpurifier',
                ActivatedCarbonFilterMonitoring.id,
                'changeIndication',
                ResourceMonitoring.ChangeIndication.Ok,
            );
            expect(adapter.valueOf(baseId, 'FILTER_CHANGE')).to.equal(false);

            await pushAttribute(
                'airpurifier',
                ActivatedCarbonFilterMonitoring.id,
                'changeIndication',
                ResourceMonitoring.ChangeIndication.Warning,
            );
            expect(adapter.valueOf(baseId, 'FILTER_CHANGE')).to.equal(true);
        });

        /**
         * The fixture has no OnOff cluster, so POWER derives from fanMode. Off must flip POWER without touching
         * SPEED: the ioBroker fan speed enum has no Off member, and POWER already carries the off/on information.
         */
        it('derives POWER from fanMode and leaves SPEED alone when the fan reports Off', async () => {
            const { baseId } = mapped.get('fannoonoff')!;
            expect(adapter.valueOf(baseId, 'POWER')).to.equal(true);
            expect(adapter.valueOf(baseId, 'SPEED')).to.equal(3);

            await pushAttribute('fannoonoff', FanControl.id, 'fanMode', FanControl.FanMode.Off);
            expect(adapter.valueOf(baseId, 'POWER')).to.equal(false);
            expect(adapter.valueOf(baseId, 'SPEED')).to.equal(3);

            await pushAttribute('fannoonoff', FanControl.id, 'fanMode', FanControl.FanMode.High);
            expect(adapter.valueOf(baseId, 'POWER')).to.equal(true);
            expect(adapter.valueOf(baseId, 'SPEED')).to.equal(1);
        });

        it('reports the robot error by name and clears it again', async () => {
            const { baseId } = mapped.get('roboticvacuum')!;
            expect(adapter.valueOf(baseId, 'ERROR')).to.equal('');

            await pushAttribute('roboticvacuum', RvcOperationalState.id, 'operationalError', {
                errorStateId: RvcOperationalState.ErrorState.DustBinFull,
            });
            expect(adapter.valueOf(baseId, 'ERROR')).to.equal('DustBinFull');

            await pushAttribute('roboticvacuum', RvcOperationalState.id, 'operationalError', {
                errorStateId: RvcOperationalState.ErrorState.NoError,
            });
            expect(adapter.valueOf(baseId, 'ERROR')).to.equal('');
        });
    });

    /**
     * The raw application cluster data of an endpoint must exist exactly once, split the same way the device
     * mapping splits: below the object of the endpoint that became a device of its own, and nested below the
     * parent for a part the parent owns. A second copy would never be updated again.
     */
    describe('raw application cluster data', () => {
        const TEMPERATURE_MEASUREMENT = 0x0402;
        const MEASURED_VALUE = 0x0000;

        let node: GeneralMatterNode;
        let purifier: Endpoint;
        let fridge: Endpoint;
        let cabinet: Endpoint;

        const nativeValue = (obj: ioBroker.AnyObject, key: string): unknown => {
            const native: unknown = obj.native;
            return typeof native === 'object' && native !== null && key in native
                ? Reflect.get(native, key)
                : undefined;
        };

        /** The device object of an endpoint - cluster folders carry an endpointId too, but also a clusterId. */
        const deviceObjectId = (endpointNumber: number | undefined): string => {
            const ids = [...adapter.objects.entries()]
                .filter(
                    ([, obj]) =>
                        nativeValue(obj, 'endpointId') === endpointNumber &&
                        nativeValue(obj, 'nodeId') !== undefined &&
                        nativeValue(obj, 'clusterId') === undefined,
                )
                .map(([id]) => id);
            expect(ids, `endpoint ${endpointNumber} has no unique device object`).to.have.lengthOf(1);
            return ids[0];
        };

        const bridgedEndpoint = (label: string): Endpoint => {
            const rootEndpoint = commissioned!.node;
            for (const part of [...rootEndpoint.parts] as Endpoint[]) {
                for (const child of [...part.parts] as Endpoint[]) {
                    if (child.maybeStateOf(BridgedDeviceBasicInformationClient)?.nodeLabel === label) {
                        return child;
                    }
                }
            }
            throw new Error(`bridged endpoint ${label} not found`);
        };

        before(async () => {
            node = new GeneralMatterNode(adapter as unknown as MatterAdapter, commissioned!.node, {});
            await node.applyConfiguration(
                {
                    nodeId: peerNodeId(commissioned!.node),
                    exposeMatterApplicationClusterData: true,
                    exposeMatterSystemClusterData: false,
                },
                true,
            );

            purifier = bridgedEndpoint('airpurifiercomposed');
            fridge = bridgedEndpoint('fridgecomposed');
            cabinet = [...fridge.parts][0] as Endpoint;
        });

        after(async () => {
            await node?.clear();
        });

        it('places the raw data of a child that is its own device below that child', () => {
            for (const child of [...purifier.parts] as Endpoint[]) {
                const childBase = deviceObjectId(child.number);
                expect(
                    adapter.objectsBelow(`${childBase}.data.${child.number}`).length,
                    `endpoint ${child.number} has no raw data of its own`,
                ).to.be.greaterThan(1);
            }
        });

        it('does not nest a second copy below the parent', () => {
            const purifierBase = deviceObjectId(purifier.number);
            expect(
                adapter.objectsBelow(`${purifierBase}.data.${purifier.number}`).length,
                'the parent lost its own raw data',
            ).to.be.greaterThan(1);
            expect(adapter.objectsBelow(`${purifierBase}.data.data`)).to.deep.equal([]);
        });

        it('keeps the raw data of an owned part nested below its parent', () => {
            const fridgeBase = deviceObjectId(fridge.number);
            expect(
                adapter.objectsBelow(`${fridgeBase}.data.data.${fridge.number}-${cabinet.number}`).length,
                'the cabinet the fridge owns has no nested raw data',
            ).to.be.greaterThan(1);
        });

        it('updates the raw states of a child that is its own device', async () => {
            const sensor = ([...purifier.parts] as Endpoint[]).find(
                part => identifyDeviceTypes(part).primaryDeviceType?.deviceType.id === 0x0302,
            );
            expect(sensor, 'the purifier fixture has no temperature sensor child').to.not.equal(undefined);
            const stateId = `${deviceObjectId(sensor!.number)}.data.${sensor!.number}.${toHex(
                TEMPERATURE_MEASUREMENT,
            )}.attributes.measuredValue`;
            expect(adapter.states.get(stateId)?.val, 'raw state not initialized').to.equal(2350);

            // The fixture cannot be told to report a new value, so this drives the fan-out with the value
            // the device holds: it proves the notification reaches this raw state, not that it changes.
            adapter.states.delete(stateId);
            await node.handleChangedAttributes(sensor!, TemperatureMeasurementClient, ['measuredValue']);

            expect(adapter.states.get(stateId)?.val, 'raw state not written by the change handler').to.equal(2350);
        });
    });
});
