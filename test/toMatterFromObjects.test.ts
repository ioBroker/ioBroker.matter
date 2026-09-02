import { expect } from 'chai';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DeviceTypeId, Endpoint, Environment, LogLevel, Logger, ServerNode, VendorId } from '@matter/main';
import { DoorLock, Thermostat } from '@matter/main/clusters';
import { AggregatorEndpoint } from '@matter/main/endpoints';
import type { BridgeDeviceDescription } from '../src/ioBrokerTypes';
import DeviceFactory from '../src/lib/DeviceFactory';
import { determineIoBrokerDevice, getIoBrokerDeviceStates } from '../src/lib/deviceDetection';
import type { GenericDevice } from '../src/lib/devices/GenericDevice';
import { SubscribeManager } from '../src/lib/SubscribeManager';
import type { GenericDeviceToMatter } from '../src/matter/to-matter/GenericDeviceToMatter';
import matterDeviceFabric from '../src/matter/to-matter/matterFactory';
import { createMatterTestEnvironment } from './helpers/matterTestEnvironment';
import { loadObjectFixture, MockObjectAdapter, seedDeterministicValues } from './helpers/mockObjectAdapter';

const OBJECTS_FIXTURE = join(__dirname, 'fixtures/ioBrokerObjects.json');
const BRIDGES_FIXTURE = join(__dirname, 'fixtures/ioBrokerBridges.json');
const SNAPSHOT = join(__dirname, 'fixtures/toMatterFromObjects.snapshot.json');

/** Set `SNAPSHOT_UPDATE=1` to rewrite the snapshot; the diff is the review. */
const updateSnapshot = process.env.SNAPSHOT_UPDATE === '1';

interface BridgeExport {
    common: { name: string };
    native: { list: BridgeDeviceDescription[] };
}

function loadBridges(): Record<string, BridgeExport> {
    return JSON.parse(readFileSync(BRIDGES_FIXTURE, 'utf8')) as Record<string, BridgeExport>;
}

let entryCache: { bridge: string; entry: BridgeDeviceDescription }[] | undefined;

/** Every configured (oid, type) pair across all exported bridges, deduplicated, in export order. */
function bridgeEntries(): { bridge: string; entry: BridgeDeviceDescription }[] {
    if (entryCache) {
        return entryCache;
    }
    const seen = new Set<string>();
    const entries = new Array<{ bridge: string; entry: BridgeDeviceDescription }>();
    for (const [id, bridge] of Object.entries(loadBridges())) {
        for (const entry of bridge.native.list) {
            const key = `${entry.oid}|${entry.type}`;
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            entries.push({ bridge: `${bridge.common.name} (${id.split('.').pop()})`, entry });
        }
    }
    entryCache = entries;
    return entries;
}

// ---------------------------------------------------------------------------------------------------------------
// Snapshot serialization: cluster-independent metadata carries no information about the mapping, so it is
// dropped; the feature map is kept because feature gating is exactly what the converters decide.
// ---------------------------------------------------------------------------------------------------------------

const IGNORED_BEHAVIORS = new Set(['ioBrokerContext', 'ioBrokerEvents', 'identify', 'descriptor']);
const IGNORED_ATTRIBUTES = new Set([
    'clusterRevision',
    'attributeList',
    'acceptedCommandList',
    'generatedCommandList',
    'eventList',
    'credentialKey', // Randomly generated per door lock instance
]);

/** Behavior state of a converter endpoint, which carries no static type for the clusters it added. */
function stateOf(endpoint: Endpoint, behavior: string): Record<string, any> | undefined {
    return (endpoint.state as unknown as Record<string, Record<string, any>>)[behavior];
}

function serializeEndpoint(endpoint: Endpoint): unknown {
    const state: Record<string, Record<string, unknown>> = {};
    for (const [behavior, values] of Object.entries(endpoint.state as Record<string, Record<string, unknown>>)) {
        if (IGNORED_BEHAVIORS.has(behavior)) {
            continue;
        }
        const attributes: Record<string, unknown> = {};
        for (const name of Object.keys(values).sort()) {
            if (!IGNORED_ATTRIBUTES.has(name)) {
                attributes[name] = values[name];
            }
        }
        state[behavior] = attributes;
    }
    return {
        id: endpoint.id,
        deviceType: endpoint.type.name,
        deviceTypeId: endpoint.type.deviceType,
        behaviors: Object.keys(endpoint.state)
            .filter(name => !IGNORED_BEHAVIORS.has(name))
            .sort(),
        state,
        parts: [...endpoint.parts].map(part => serializeEndpoint(part)),
    };
}

/** bigint attribute values (epoch-µs, EUI64) have no JSON form, so they are stringified. */
function jsonReplacer(_key: string, value: unknown): unknown {
    return typeof value === 'bigint' ? `${value}n` : value;
}

// ---------------------------------------------------------------------------------------------------------------
// Mounting: the production chain from a bridge config entry to endpoints on a real ServerNode.
// ---------------------------------------------------------------------------------------------------------------

let environment: Environment;
let nodeCounter = 0;

interface Mounted {
    device: GenericDevice;
    converter: GenericDeviceToMatter;
    node: ServerNode;
    endpoints: Endpoint[];
}

const cleanups = new Array<() => Promise<void>>();

async function createNode(): Promise<ServerNode> {
    return ServerNode.create(ServerNode.RootEndpoint, {
        environment,
        id: `from-objects-${++nodeCounter}`,
        network: { port: 0 },
        productDescription: { name: 'Test', deviceType: DeviceTypeId(0x0016) },
        basicInformation: {
            vendorName: 'ioBroker',
            vendorId: VendorId(0xfff1),
            productName: 'Test',
            productId: 0x8000,
        },
    });
}

async function mount(adapter: MockObjectAdapter, entry: BridgeDeviceDescription): Promise<Mounted> {
    const detected = await determineIoBrokerDevice(adapter, entry.oid, entry.type, entry.auto);
    expect(detected, `nothing detected for ${entry.oid}`).to.not.equal(null);
    expect(detected!.type, `detected type for ${entry.oid}`).to.equal(entry.type);

    const device = await DeviceFactory(detected!, adapter.asAdapter(), entry, false);
    const converter = await matterDeviceFabric(device, entry.name, entry.uuid);
    expect(converter, `no to-matter converter for ${entry.type}`).to.not.equal(null);

    const node = await createNode();
    // Registered before anything that can throw, so a conformance error still releases the node.
    // `GenericDeviceToMatter.destroy` destroys the ioBroker device, so the device is not closed here.
    cleanups.push(async () => {
        await converter!.destroy();
        await node.close();
    });
    for (const endpoint of converter!.matterEndpoints) {
        await node.add(endpoint);
    }
    await converter!.init();

    return { device, converter: converter!, node, endpoints: converter!.matterEndpoints };
}

describe('to-matter mapping of exported ioBroker objects', function () {
    this.timeout(120_000);

    let previousLogLevel: LogLevel;
    let objects: ReturnType<typeof loadObjectFixture>;
    let adapter: MockObjectAdapter;

    /** The fixture is a `JSON.parse` result, so a prototype member name must not read as an existing object. */
    const hasObject = (oid: string): boolean => Object.hasOwn(objects, oid);

    before(async () => {
        previousLogLevel = Logger.defaultLogLevel;
        Logger.defaultLogLevel = LogLevel.FATAL;
        environment = await createMatterTestEnvironment('to-matter-from-objects');
        objects = loadObjectFixture(OBJECTS_FIXTURE);
    });

    beforeEach(() => {
        adapter = new MockObjectAdapter(objects);
        seedDeterministicValues(adapter, objects);
        SubscribeManager.setAdapter(adapter.asAdapter());
    });

    afterEach(async () => {
        // One failing teardown must not strand the remaining nodes, the pending timers or the subscriptions:
        // a leaked subscription drives a destroyed device from the next test and fails it instead.
        const failures = new Array<unknown>();
        while (cleanups.length) {
            try {
                await cleanups.pop()!();
            } catch (error) {
                failures.push(error);
            }
        }
        adapter.clearAllTimers();
        SubscribeManager.subscribes.clear();
        if (failures.length) {
            throw new Error(`Teardown failed: ${failures.map(error => String(error)).join('; ')}`);
        }
    });

    after(() => {
        Logger.defaultLogLevel = previousLogLevel;
    });

    describe('detection', () => {
        // `determineIoBrokerDevice` reports the configured type either way, detected or as a single-state
        // fallback, so only the detector itself can answer whether detection worked.
        it('detects the configured device type for every exported bridge entry', async () => {
            const mismatches = new Array<string>();
            for (const { entry } of bridgeEntries()) {
                const detected = await getIoBrokerDeviceStates(adapter, entry.oid, entry.type);
                if (detected === null) {
                    // The only entry without an object is a device from an adapter that was not exported.
                    expect(hasObject(entry.oid), `${entry.oid} exists but was not detected`).to.equal(false);
                    continue;
                }
                if (detected.type !== entry.type) {
                    mismatches.push(`${entry.oid}: configured ${entry.type}, detected ${detected.type}`);
                }
            }
            expect(mismatches).to.deep.equal([]);
        });

        it('maps the configured object to the main state of the detected device', async () => {
            for (const { entry } of bridgeEntries()) {
                const detected = await getIoBrokerDeviceStates(adapter, entry.oid, entry.type);
                if (detected === null) {
                    continue;
                }
                const ids = detected.states.map(state => state.id);
                if (objects[entry.oid].type === 'state') {
                    // A configured state must be one of the states the device works with, otherwise the user
                    // configured one thing and the bridge would expose another.
                    expect(ids, `${entry.oid} is not part of its own detected device`).to.include(entry.oid);
                } else {
                    // A configured channel contributes its children, so every state must live below it.
                    for (const id of ids) {
                        expect(id!.startsWith(`${entry.oid}.`), `${id} is not below ${entry.oid}`).to.equal(true);
                    }
                }
            }
        });
    });

    describe('endpoint structure', () => {
        it('matches the committed snapshot for every exported bridge entry', async () => {
            const snapshot: Record<string, unknown> = {};
            for (const { bridge, entry } of bridgeEntries()) {
                if (!hasObject(entry.oid)) {
                    continue;
                }
                const mounted = await mount(adapter, entry);
                snapshot[`${entry.type} ${entry.oid}`] = {
                    bridge,
                    endpoints: mounted.endpoints.map(endpoint => serializeEndpoint(endpoint)),
                };
                while (cleanups.length) {
                    await cleanups.pop()!();
                }
            }
            expect(adapter.errors, 'mounting logged errors').to.deep.equal([]);

            const serialized = `${JSON.stringify(snapshot, jsonReplacer, 2)}\n`;
            if (updateSnapshot) {
                writeFileSync(SNAPSHOT, serialized);
                return;
            }
            const expected = readFileSync(SNAPSHOT, 'utf8');
            if (serialized !== expected) {
                // Compare parsed to get a structural diff instead of a 100 kB string mismatch.
                expect(JSON.parse(serialized)).to.deep.equal(JSON.parse(expected));
                expect(serialized, 'snapshot formatting changed').to.equal(expected);
            }
        });

        it('mounts a whole exported bridge on one aggregator without endpoint id collisions', async () => {
            const list = Object.values(loadBridges()).sort((a, b) => b.native.list.length - a.native.list.length)[0]
                .native.list;
            const mountable = list.filter(entry => hasObject(entry.oid));
            const node = await createNode();
            const converters = new Array<GenericDeviceToMatter>();
            cleanups.push(async () => {
                for (const converter of converters) {
                    await converter.destroy();
                }
                await node.close();
            });
            const aggregator = new Endpoint(AggregatorEndpoint, { id: 'bridge' });
            await node.add(aggregator);

            for (const entry of mountable) {
                const detected = await determineIoBrokerDevice(adapter, entry.oid, entry.type, entry.auto);
                expect(detected, `nothing detected for ${entry.oid}`).to.not.equal(null);
                const device = await DeviceFactory(detected!, adapter.asAdapter(), entry, false);
                const converter = await matterDeviceFabric(device, entry.name, entry.uuid);
                expect(converter, `no to-matter converter for ${entry.type}`).to.not.equal(null);
                converters.push(converter!);
                for (const endpoint of converter!.matterEndpoints) {
                    await aggregator.add(endpoint);
                }
                await converter!.init();
            }

            expect(converters.length).to.equal(mountable.length);
            expect(adapter.errors, 'mounting a full bridge logged errors').to.deep.equal([]);
        });
    });

    describe('mapped behaviour of the exported devices', () => {
        /** The behaviors of a converter endpoint are not statically typed, so commands go through an agent. */
        async function invoke(endpoint: Endpoint, cluster: string, command: string, request?: unknown): Promise<any> {
            return endpoint.act((agent: any) => agent[cluster][command](request));
        }

        function entryFor(oid: string, type: string): BridgeDeviceDescription {
            const found = bridgeEntries().find(({ entry }) => entry.oid === oid && entry.type === type);
            expect(found, `${type} ${oid} is not configured in any exported bridge`).to.not.equal(undefined);
            return found!.entry;
        }

        it('reports thermostat temperature, setpoint and mode in their Matter units', async () => {
            // A single SET state means the mode decides which setpoint kind it backs, so MODE is pushed
            // before the setpoint is read back.
            const mounted = await mount(adapter, entryFor('alias.0.Test-Devices.Thermostat', 'thermostat'));
            const [thermostat] = mounted.endpoints;

            await adapter.pushValue('alias.0.Test-Devices.Thermostat.ACTUAL', 21.5);
            expect(stateOf(thermostat, 'thermostat')!.externalMeasuredIndoorTemperature).to.equal(2150);

            await adapter.pushValue('alias.0.Test-Devices.Thermostat.MODE', 7); // HEAT
            await adapter.pushValue('alias.0.Test-Devices.Thermostat.SET', 22.5);
            expect(stateOf(thermostat, 'thermostat')!.systemMode).to.equal(Thermostat.SystemMode.Heat);
            expect(stateOf(thermostat, 'thermostat')!.occupiedHeatingSetpoint).to.equal(2250);

            await adapter.pushValue('alias.0.Test-Devices.Thermostat.MODE', 3); // COOL
            await adapter.pushValue('alias.0.Test-Devices.Thermostat.SET', 19);
            expect(stateOf(thermostat, 'thermostat')!.systemMode).to.equal(Thermostat.SystemMode.Cool);
            expect(stateOf(thermostat, 'thermostat')!.occupiedCoolingSetpoint).to.equal(1900);
        });

        it('reports the humidity of a thermostat on its own endpoint', async () => {
            const mounted = await mount(adapter, entryFor('alias.0.Test-Devices.Thermostat', 'thermostat'));
            const humidity = mounted.endpoints.find(endpoint => stateOf(endpoint, 'relativeHumidityMeasurement'));
            expect(humidity, 'the thermostat has a HUMIDITY state but no humidity endpoint').to.not.equal(undefined);

            await adapter.pushValue('alias.0.Test-Devices.Thermostat.HUMIDITY', 55);
            expect(stateOf(humidity!, 'relativeHumidityMeasurement')!.measuredValue).to.equal(5500);
        });

        it('inverts the blind position between ioBroker percent open and Matter percent closed', async () => {
            const mounted = await mount(adapter, entryFor('alias.0.Test-Devices.BlindsLiftTilt.SET', 'blind'));
            const [blind] = mounted.endpoints;

            await adapter.pushValue('alias.0.Test-Devices.BlindsLiftTilt.ACTUAL', 30);
            expect(stateOf(blind, 'windowCovering')!.currentPositionLiftPercent100ths).to.equal(7000);

            await invoke(blind, 'windowCovering', 'goToLiftPercentage', { liftPercent100thsValue: 2500 });
            expect(adapter.rawValueOf('0_userdata.0.States-For-Devices.Blind-Level')?.val).to.equal(75);
        });

        it('reports the ioBroker lock switch as the Matter lock state', async () => {
            // The lock commands are fabric-scoped, so only the reporting direction is reachable without a
            // commissioned fabric; the command direction is covered by the controller integration test.
            const mounted = await mount(adapter, entryFor('alias.0.Test-Devices.Lock-With-Open.SET', 'lock'));
            const [lock] = mounted.endpoints;

            await adapter.pushValue('alias.0.Test-Devices.Lock-With-Open.SET', false);
            expect(stateOf(lock, 'doorLock')!.lockState).to.equal(DoorLock.LockState.Locked);

            await adapter.pushValue('alias.0.Test-Devices.Lock-With-Open.SET', true);
            expect(stateOf(lock, 'doorLock')!.lockState).to.equal(DoorLock.LockState.Unlocked);
        });

        it('keeps a single-state rgb device usable when its colour state holds no colour', async () => {
            adapter.seedValue('0_userdata.0.States-For-Devices.Color-RGB', '');
            const mounted = await mount(adapter, entryFor('alias.0.Test-Devices.Rgb-Single.RGB', 'rgbSingle'));
            const [light] = mounted.endpoints;

            expect(stateOf(light, 'colorControl')!.currentHue).to.equal(0);
            expect(stateOf(light, 'colorControl')!.currentSaturation).to.equal(0);
            expect(adapter.errors).to.deep.equal([]);
        });

        it('keeps a single-state rgbw device usable when its colour state holds no colour', async () => {
            adapter.seedValue('0_userdata.0.States-For-Devices.Color-RGBW', '');
            const mounted = await mount(adapter, entryFor('alias.0.Test-Devices.Rgbw-Single.RGBW', 'rgbwSingle'));
            const [light] = mounted.endpoints;

            expect(stateOf(light, 'colorControl')!.currentHue).to.equal(0);
            expect(stateOf(light, 'colorControl')!.currentSaturation).to.equal(0);
            expect(adapter.errors).to.deep.equal([]);
        });

        it('reports an unreadable colour once per value, not once per change', async () => {
            adapter.seedValue('0_userdata.0.States-For-Devices.Color-RGB', 'red');
            await mount(adapter, entryFor('alias.0.Test-Devices.Rgb-Single.RGB', 'rgbSingle'));
            const invalid = (): string[] => adapter.infos.filter(message => message.includes('Invalid RGB value'));
            const afterMount = invalid().length;
            expect(afterMount).to.be.greaterThan(0);

            await adapter.pushValue('alias.0.Test-Devices.Rgb-Single.RGB', 'red');
            expect(invalid().length, 'the same unreadable value logged again').to.equal(afterMount);

            await adapter.pushValue('alias.0.Test-Devices.Rgb-Single.RGB', 'blue');
            expect(invalid().length, 'a different unreadable value not logged').to.be.greaterThan(afterMount);
        });

        it('writes a controller colour change back as an ioBroker rgb string', async () => {
            adapter.seedValue('0_userdata.0.States-For-Devices.Color-RGB', '#ffffff');
            const mounted = await mount(adapter, entryFor('alias.0.Test-Devices.Rgb-Single.RGB', 'rgbSingle'));
            const [light] = mounted.endpoints;

            await invoke(light, 'colorControl', 'moveToHueAndSaturation', {
                hue: 0,
                saturation: 254,
                transitionTime: 0,
                optionsMask: {},
                optionsOverride: {},
            });
            expect(adapter.rawValueOf('0_userdata.0.States-For-Devices.Color-RGB')?.val).to.equal('#ff0000');
        });

        it('reads the current of a light in amperes, as the electricity states declare it', async () => {
            const mounted = await mount(adapter, entryFor('alias.0.Test-Devices.Light.SET', 'light'));
            const electrical = mounted.endpoints.find(endpoint => stateOf(endpoint, 'electricalPowerMeasurement'));
            expect(electrical, 'no endpoint carries the electrical measurements').to.not.equal(undefined);

            await adapter.pushValue('alias.0.Test-Devices.Light.CURRENT', 2.5);
            // Matter reports milliamperes, so 2.5 A must arrive as 2500 mA and not as 2.5 mA.
            expect(stateOf(electrical!, 'electricalPowerMeasurement')!.activeCurrent).to.equal(2500);
        });
    });
});
