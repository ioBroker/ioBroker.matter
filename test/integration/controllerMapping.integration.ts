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
import type { Endpoint } from '@matter/main';
import { Logger, LogLevel } from '@matter/main';
import { BridgedDeviceBasicInformationClient } from '@matter/main/behaviors';
import { AggregatorEndpointDefinition } from '@matter/main/endpoints';
import { SubscribeManager } from '../../src/lib/SubscribeManager';
import type { GenericDeviceToIoBroker } from '../../src/matter/to-iobroker/GenericDeviceToIoBroker';
import ioBrokerDeviceFabric, { identifyDeviceTypes } from '../../src/matter/to-iobroker/ioBrokerFactory';
import { BRIDGE_DISCRIMINATOR, BRIDGE_PASSCODE } from '../fixtures/bridgeConstants';
import { ALL_ENDPOINTS } from '../fixtures/testBridgeDefinition';
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

describe('Matter -> ioBroker controller mapping', function () {
    this.timeout(600_000);

    let bridge: ChildProcess | undefined;
    let bridgeStorage: string | undefined;
    let controllerStorage: string | undefined;
    let commissioned: CommissionedFixture | undefined;
    let adapter: MockControllerAdapter;
    let previousLogLevel: LogLevel;
    const mapped = new Map<string, MappedEndpoint>();

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

        const rootEndpoint = commissioned.node.node;
        expect(rootEndpoint, 'controller did not expose a root endpoint').to.not.equal(undefined);

        const aggregator = ([...rootEndpoint!.parts] as Endpoint[]).find(
            part =>
                identifyDeviceTypes(part).primaryDeviceType?.deviceType.id === AggregatorEndpointDefinition.deviceType,
        );
        expect(aggregator, 'bridge did not expose an aggregator endpoint').to.not.equal(undefined);

        for (const endpoint of [...aggregator!.parts] as Endpoint[]) {
            const key =
                endpoint.maybeStateOf(BridgedDeviceBasicInformationClient)?.nodeLabel ?? String(endpoint.number);
            const baseId = `controller.node.${key}`;
            const matterDeviceTypeId = identifyDeviceTypes(endpoint).primaryDeviceType?.deviceType.id;
            // Per endpoint, so one converter throwing does not hide the mapping of all the others.
            try {
                const device = await ioBrokerDeviceFabric(
                    commissioned.node,
                    endpoint,
                    rootEndpoint!,
                    adapter as unknown as ioBroker.Adapter,
                    baseId,
                    'controller.node.info.connection',
                    key,
                );
                mapped.set(key, { device, baseId, matterDeviceTypeId });
            } catch (error) {
                mapped.set(key, { baseId, matterDeviceTypeId, error });
            }
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

    it('maps every bridged endpoint the fixture exposes', () => {
        if (process.env.DUMP_MAPPING === 'true') {
            for (const [id, { device, baseId, error }] of mapped) {
                console.log(
                    `${id}\t${device?.constructor.name ?? `THREW ${String(error)}`}\t${device?.ioBrokerDevice.deviceType}\t${adapter
                        .statesBelow(baseId)
                        .map(name => `${name}=${JSON.stringify(adapter.valueOf(baseId, name))}`)
                        .join(' ')}`,
                );
            }
        }
        expect([...mapped.keys()].sort()).to.deep.equal(ALL_ENDPOINTS.map(spec => spec.id).sort());
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
});
