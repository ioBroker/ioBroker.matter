import { expect } from 'chai';
import {
    DeviceTypeId,
    Endpoint,
    Environment,
    LogLevel,
    Logger,
    ObserverGroup,
    ServerNode,
    VendorId,
} from '@matter/main';
import { LevelControl } from '@matter/main/clusters';
import { OnOffServer } from '@matter/main/behaviors';
import { OnOffLightDevice } from '@matter/main/devices';
import { MatterOnOffAttribute } from '../src/matter/to-matter/MatterOnOffAttribute';
import { StateType, Types } from '@iobroker/type-detector';
import DeviceFactory from '../src/lib/DeviceFactory';
import type { DetectedDevice, DeviceOptions, GenericDevice } from '../src/lib/devices/GenericDevice';
import { SubscribeManager } from '../src/lib/SubscribeManager';
import { createMatterTestEnvironment } from './helpers/matterTestEnvironment';
import matterDeviceFabric from '../src/matter/to-matter/matterFactory';
import type { GenericDeviceToMatter } from '../src/matter/to-matter/GenericDeviceToMatter';

import type { BlindButtons } from '../src/lib/devices/BlindButtons';
import type { Ct } from '../src/lib/devices/Ct';
import { LightingLevel, PumpLevel } from '../src/matter/ConversionUtils';

interface StateSpec {
    type: 'number' | 'boolean' | 'string';
    val?: any;
    unit?: string;
    min?: number;
    max?: number;
    states?: Record<string, string>;
}

type StateSet = Record<string, StateSpec>;

const STATE_TYPES: Record<StateSpec['type'], StateType> = {
    number: StateType.Number,
    boolean: StateType.Boolean,
    string: StateType.String,
};

const num = (val?: number, unit?: string): StateSpec => ({ type: 'number', val, unit });
const percent = (val?: number): StateSpec => ({ type: 'number', val, min: 0, max: 100, unit: '%' });
const bool = (val?: boolean): StateSpec => ({ type: 'boolean', val });

let instanceCounter = 0;

class MockAdapter {
    readonly namespace = 'matter.0';
    readonly infos = new Array<string>();
    /** Every converter write as NAME=value, in order. */
    readonly writes = new Array<string>();
    readonly log = {
        silly: (): void => {},
        debug: (): void => {},
        info: (message: string): void => {
            this.infos.push(message);
        },
        warn: (): void => {},
        error: (message: string): void => console.error(message),
    };
    readonly #specs: StateSet;
    readonly #prefix: string;
    readonly #values = new Map<string, ioBroker.State>();

    constructor(specs: StateSet, prefix: string) {
        this.#specs = specs;
        this.#prefix = prefix;
    }

    idOf(name: string): string {
        return `${this.#prefix}.${name}`;
    }

    #specOf(id: string): StateSpec | undefined {
        return this.#specs[id.substring(this.#prefix.length + 1)];
    }

    async getForeignObjectAsync(id: string): Promise<ioBroker.Object | null> {
        const spec = this.#specOf(id);
        if (!spec) {
            return null;
        }
        return {
            _id: id,
            type: 'state',
            common: {
                name: id,
                type: spec.type,
                role: 'state',
                read: true,
                write: true,
                min: spec.min,
                max: spec.max,
                unit: spec.unit,
                states: spec.states,
            },
            native: {},
        } as ioBroker.Object;
    }

    async getForeignStateAsync(id: string): Promise<ioBroker.State | null> {
        const existing = this.#values.get(id);
        if (existing) {
            return existing;
        }
        const spec = this.#specOf(id);
        if (!spec) {
            return null;
        }
        const state = {
            val: spec.val ?? (spec.type === 'boolean' ? false : spec.type === 'number' ? 0 : ''),
            ack: true,
            ts: Date.now(),
        } as ioBroker.State;
        this.#values.set(id, state);
        return state;
    }

    async setForeignStateAsync(id: string, value: any): Promise<void> {
        const val = typeof value === 'object' && value !== null && 'val' in value ? value.val : value;
        this.#values.set(id, { val, ack: true, ts: Date.now() } as ioBroker.State);
        this.writes.push(`${id.substring(this.#prefix.length + 1)}=${val}`);
    }

    /** Simulates an acked value arriving from the real device, awaiting the full handler chain. */
    async pushValue(name: string, val: any): Promise<void> {
        const id = this.idOf(name);
        const state = { val, ack: true, ts: Date.now() } as ioBroker.State;
        this.#values.set(id, state);
        await SubscribeManager.observer(id, state);
    }

    /** Last value written for the state, whether by the converter or by pushValue. */
    valueOf(name: string): unknown {
        return this.#values.get(this.idOf(name))?.val;
    }

    async subscribeForeignStatesAsync(): Promise<void> {}
    async unsubscribeForeignStatesAsync(): Promise<void> {}
    subscribeStates(): void {}
    unsubscribeStates(): void {}
    async extendObjectAsync(): Promise<void> {}
    extendObject(): void {}
    setTimeout(callback: () => void, ms: number): any {
        return setTimeout(callback, ms);
    }
    clearTimeout(timer: any): void {
        clearTimeout(timer);
    }
}

// ---------------------------------------------------------------------------------------------------------------
// Matter side: one shared in-memory environment; endpoints are added to a real ServerNode exactly like DeviceNode
// does it, so behavior conformance is validated for real.
// ---------------------------------------------------------------------------------------------------------------

let environment: Environment;

async function createNode(id: string): Promise<ServerNode> {
    return ServerNode.create(ServerNode.RootEndpoint, {
        environment,
        id,
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

interface Mounted {
    adapter: MockAdapter;
    device: GenericDevice;
    converter: GenericDeviceToMatter;
    node: ServerNode;
}

const cleanups = new Array<() => Promise<void>>();

/**
 * Builds the ioBroker device, runs it through the production factory and mounts the resulting endpoints on a real
 * ServerNode. Nothing here swallows errors: a conformance violation fails the test that mounted the device.
 */
async function mount(type: Types, specs: StateSet): Promise<Mounted> {
    const index = ++instanceCounter;
    const prefix = `0_userdata.0.test${index}`;
    const adapter = new MockAdapter(specs, prefix);
    SubscribeManager.setAdapter(adapter as unknown as ioBroker.Adapter);

    const detectedDevice: DetectedDevice = {
        type,
        isIoBrokerDevice: true,
        states: Object.entries(specs).map(([name, spec]) => ({
            name,
            id: `${prefix}.${name}`,
            type: STATE_TYPES[spec.type],
            read: true,
            write: true,
        })),
    };

    const options: DeviceOptions = {
        uuid: `uuid-${index}`,
        enabled: true,
        name: `Test ${index}`,
        oid: prefix,
        type,
        auto: false,
        noComposed: false,
    };
    const device = await DeviceFactory(detectedDevice, adapter as unknown as ioBroker.Adapter, options, false);
    const converter = await matterDeviceFabric(device, `Test ${index}`, `uuid-${index}`);
    expect(converter, `no converter for ${type}`).to.not.equal(null);

    const node = await createNode(`test-${index}`);
    for (const endpoint of converter!.matterEndpoints) {
        await node.add(endpoint);
    }
    await converter!.init();

    cleanups.push(async () => {
        await node.close();
        await converter!.destroy();
    });

    return { adapter, device, converter: converter!, node };
}

function endpointsOf(mounted: Mounted): any[] {
    return mounted.converter.matterEndpoints;
}

/** Drives LevelControl.moveToLevel the way a controller does. */
async function moveToLevel(endpoint: any, level: number): Promise<void> {
    await endpoint.act((agent: any) =>
        agent.levelControl.moveToLevel({ level, transitionTime: 0, optionsMask: {}, optionsOverride: {} }),
    );
}

/** Invokes a LevelControl command the way a controller does. */
async function levelCommand(endpoint: any, command: string, request: Record<string, unknown>): Promise<void> {
    await endpoint.act((agent: any) =>
        agent.levelControl[command]({ optionsMask: {}, optionsOverride: {}, ...request }),
    );
}

const writesOf = (mounted: Mounted, name: string): string[] =>
    mounted.adapter.writes.filter(write => write.startsWith(`${name}=`));

async function setOnOff(endpoint: any, on: boolean): Promise<void> {
    await endpoint.act((agent: any) => (on ? agent.onOff.on() : agent.onOff.off()));
}

/** The converters forward Matter commands to ioBroker asynchronously, so poll until the write has landed. */
async function waitFor(condition: () => boolean): Promise<void> {
    for (let i = 0; i < 100 && !condition(); i++) {
        await new Promise(resolve => setTimeout(resolve, 10));
    }
}

describe('level conversions', function () {
    this.timeout(30000);

    let previousLogLevel: LogLevel;

    before(async () => {
        previousLogLevel = Logger.defaultLogLevel;
        Logger.defaultLogLevel = LogLevel.FATAL;
        environment = await createMatterTestEnvironment('level-conversions-test');
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

    describe('LightingLevel scale', () => {
        it('maps Matter levels to integer percent and never a non-zero level to 0', () => {
            const expected: Record<number, number> = { 0: 0, 1: 1, 2: 1, 127: 50, 253: 100, 254: 100 };
            for (const [level, percent] of Object.entries(expected)) {
                expect(LightingLevel.toPercent(Number(level)), `level ${level}`).to.equal(percent);
            }
            for (let level = 1; level <= 254; level++) {
                const percent = LightingLevel.toPercent(level);
                expect(Number.isInteger(percent), `level ${level}`).to.equal(true);
                expect(percent, `level ${level}`).to.be.within(1, 100);
            }
        });

        it('maps percent to levels 1..254 and a tiny or zero percent to the minimum level', () => {
            const expected: Record<number, number> = { 0: 1, 0.1: 1, 1: 3, 2: 5, 50: 127, 99: 251, 100: 254, 150: 254 };
            for (const [percent, level] of Object.entries(expected)) {
                expect(LightingLevel.fromPercent(Number(percent)), `${percent} %`).to.equal(level);
            }
        });

        it('round-trips every integer percent and is stable after one level round trip', () => {
            for (let percent = 1; percent <= 100; percent++) {
                expect(LightingLevel.toPercent(LightingLevel.fromPercent(percent)), `${percent} %`).to.equal(percent);
            }
            for (let level = 1; level <= 254; level++) {
                const once = LightingLevel.fromPercent(LightingLevel.toPercent(level));
                expect(Math.abs(once - level), `level ${level}`).to.be.at.most(2);
                expect(LightingLevel.fromPercent(LightingLevel.toPercent(once)), `level ${level}`).to.equal(once);
            }
            // The documented neighbours: levels 1 and 2 both read as 1 %, which writes back as level 3
            expect(LightingLevel.fromPercent(LightingLevel.toPercent(1))).to.equal(3);
            expect(LightingLevel.fromPercent(LightingLevel.toPercent(254))).to.equal(254);
        });
    });

    describe('LightingLevel StartUpCurrentLevel', () => {
        it('keeps 0 as the "minimum of the device" value and null as "previous" in both directions', () => {
            expect(LightingLevel.startUpFromPercent(0)).to.equal(0);
            expect(LightingLevel.startUpFromPercent(null)).to.equal(null);
            expect(LightingLevel.startUpToPercent(0)).to.equal(0);
            expect(LightingLevel.startUpToPercent(null)).to.equal(null);
        });

        it('converts other percent values like the current level', () => {
            expect(LightingLevel.startUpFromPercent(1)).to.equal(3);
            expect(LightingLevel.startUpFromPercent(50)).to.equal(127);
            expect(LightingLevel.startUpFromPercent(100)).to.equal(254);
            expect(LightingLevel.startUpToPercent(1)).to.equal(1);
            expect(LightingLevel.startUpToPercent(254)).to.equal(100);
        });
    });

    describe('PumpLevel scale (Device Library Table 5)', () => {
        it('maps Matter levels to percent in 0.5 steps and 201..255 to 100 %', () => {
            const expected: Record<number, number> = {
                0: 0,
                1: 0.5,
                2: 1,
                127: 63.5,
                199: 99.5,
                200: 100,
                201: 100,
                253: 100,
                254: 100,
            };
            for (const [level, percent] of Object.entries(expected)) {
                expect(PumpLevel.toPercent(Number(level)), `level ${level}`).to.equal(percent);
            }
        });

        it('maps percent to levels 0..200 and a non-zero percent never to the stopped level', () => {
            const expected: Record<number, number> = {
                0: 0,
                0.1: 1,
                0.5: 1,
                1: 2,
                50.5: 101,
                99.5: 199,
                100: 200,
                120: 200,
            };
            for (const [percent, level] of Object.entries(expected)) {
                expect(PumpLevel.fromPercent(Number(percent)), `${percent} %`).to.equal(level);
            }
        });

        it('round-trips every level 0..200', () => {
            for (let level = 0; level <= 200; level++) {
                expect(PumpLevel.fromPercent(PumpLevel.toPercent(level)), `level ${level}`).to.equal(level);
            }
            expect(PumpLevel.fromPercent(PumpLevel.toPercent(254))).to.equal(200);
        });
    });

    describe('Dimmer without a power state', () => {
        it('keeps the light on and writes 1 % when a controller moves to the lowest level', async () => {
            const mounted = await mount(Types.dimmer, { SET: percent(50) });
            const [endpoint] = endpointsOf(mounted);
            expect(endpoint.state.levelControl.currentLevel).to.equal(127);
            await moveToLevel(endpoint, 1);
            await waitFor(() => mounted.adapter.valueOf('SET') === 1);
            expect(mounted.adapter.valueOf('SET')).to.equal(1);
            expect(endpoint.state.onOff.onOff).to.equal(true);
        });

        it('turns dimmer 0 from ioBroker into OnOff false and leaves the level unchanged', async () => {
            const mounted = await mount(Types.dimmer, { SET: percent(50) });
            const [endpoint] = endpointsOf(mounted);
            await mounted.adapter.pushValue('SET', 0);
            expect(endpoint.state.onOff.onOff).to.equal(false);
            expect(endpoint.state.levelControl.currentLevel).to.equal(127);

            await mounted.adapter.pushValue('SET', 0.2);
            expect(endpoint.state.onOff.onOff).to.equal(true);
            expect(endpoint.state.levelControl.currentLevel).to.equal(1);
        });

        it('restores the lowest level as 1 % when a controller turns the light on again', async () => {
            const mounted = await mount(Types.dimmer, { SET: percent(50) });
            const [endpoint] = endpointsOf(mounted);
            await moveToLevel(endpoint, 1);
            await waitFor(() => mounted.adapter.valueOf('SET') === 1);
            await mounted.adapter.pushValue('SET', 0);
            expect(endpoint.state.levelControl.currentLevel).to.equal(1);

            await setOnOff(endpoint, true);
            await waitFor(() => mounted.adapter.valueOf('SET') !== 0);
            expect(mounted.adapter.valueOf('SET')).to.equal(1);
        });

        it('starts an ioBroker dimmer at 0 as off at 100 % when no level is stored, without a range warning', async () => {
            const mounted = await mount(Types.dimmer, { SET: percent(0) });
            const [endpoint] = endpointsOf(mounted);
            expect(endpoint.state.onOff.onOff).to.equal(false);
            expect(endpoint.state.levelControl.currentLevel).to.equal(LightingLevel.MAX);
            expect(mounted.adapter.infos.filter(message => message.includes('below minimum'))).to.deep.equal([]);
        });
    });

    describe('Dimmer with an ACTUAL level state', () => {
        it('takes the level from ACTUAL and ignores SET', async () => {
            const mounted = await mount(Types.dimmer, { SET: percent(50), ACTUAL: percent(50), ON_SET: bool(true) });
            const [endpoint] = endpointsOf(mounted);
            await mounted.adapter.pushValue('SET', 0);
            expect(endpoint.state.onOff.onOff).to.equal(true);
            expect(endpoint.state.levelControl.currentLevel).to.equal(127);
            await mounted.adapter.pushValue('ACTUAL', 0);
            expect(endpoint.state.onOff.onOff).to.equal(false);
        });
    });

    describe('MatterOnOffAttribute', () => {
        async function attribute(): Promise<{ endpoint: any; reported: boolean[]; onOff: MatterOnOffAttribute }> {
            const node = await createNode(`onoff-${++instanceCounter}`);
            const endpoint = new Endpoint(OnOffLightDevice, { id: 'light' });
            await node.add(endpoint);
            const observers = new ObserverGroup();
            cleanups.push(async () => {
                observers.close();
                await node.close();
            });
            const onOff = new MatterOnOffAttribute(endpoint);
            const reported = new Array<boolean>();
            onOff.observe(observers, async on => {
                reported.push(on);
            });
            return { endpoint, reported, onOff };
        }

        it('does not report its own writes and reports commands', async () => {
            const { endpoint, reported, onOff } = await attribute();
            await onOff.write(() => true);
            await onOff.write(() => false);
            expect(endpoint.state.onOff.onOff).to.equal(false);
            await setOnOff(endpoint, true);
            expect(reported).to.deep.equal([true]);
        });

        it('reports a command that has the value of an own write waiting for the lock', async () => {
            const { endpoint, reported, onOff } = await attribute();
            let release!: () => void;
            const released = new Promise<void>(resolve => (release = resolve));
            let locked!: () => void;
            const isLocked = new Promise<void>(resolve => (locked = resolve));
            const command = endpoint.act(async (agent: any) => {
                const state = agent.get(OnOffServer);
                await agent.context.transaction.addResources(state);
                await agent.context.transaction.begin();
                state.state.onOff = true;
                locked();
                await released;
            });
            await isLocked;
            const write = onOff.write(() => true);
            await new Promise(resolve => setTimeout(resolve, 20));
            release();
            await Promise.all([command, write]);
            expect(reported).to.deep.equal([true]);
        });
    });

    describe('OnOff attribute changes', () => {
        it('starts from ACTUAL when the dimmer has one', async () => {
            const mounted = await mount(Types.dimmer, { SET: percent(50), ACTUAL: percent(20), ON_SET: bool(true) });
            const [endpoint] = endpointsOf(mounted);
            expect(endpoint.state.levelControl.currentLevel).to.equal(LightingLevel.fromPercent(20));
        });

        it('reports each On, Off and Toggle once and nothing for an On while on', async () => {
            const mounted = await mount(Types.dimmer, { SET: percent(50), ON_SET: bool(true) });
            const [endpoint] = endpointsOf(mounted);
            await setOnOff(endpoint, true);
            await setOnOff(endpoint, false);
            await endpoint.act((agent: any) => agent.onOff.toggle());
            await waitFor(() => writesOf(mounted, 'ON_SET').length === 2);
            await new Promise(resolve => setTimeout(resolve, 50));
            expect(writesOf(mounted, 'ON_SET')).to.deep.equal(['ON_SET=false', 'ON_SET=true']);
        });

        it('reports the Off of an OnWithTimedOff timer', async () => {
            const mounted = await mount(Types.dimmer, { SET: percent(50), ON_SET: bool(false) });
            const [endpoint] = endpointsOf(mounted);
            await endpoint.act((agent: any) =>
                agent.onOff.onWithTimedOff({ onOffControl: { acceptOnlyWhenOn: false }, onTime: 1, offWaitTime: 0 }),
            );
            await waitFor(() => writesOf(mounted, 'ON_SET').length === 2);
            expect(writesOf(mounted, 'ON_SET')).to.deep.equal(['ON_SET=true', 'ON_SET=false']);
            expect(endpoint.state.onOff.onOff).to.equal(false);
        });

        it('writes the OnOff value the ioBroker states have once a command releases the OnOff lock', async () => {
            const mounted = await mount(Types.dimmer, { SET: percent(50), ON_SET: bool(false) });
            const [endpoint] = endpointsOf(mounted);
            let release!: () => void;
            const released = new Promise<void>(resolve => (release = resolve));
            let locked!: () => void;
            const isLocked = new Promise<void>(resolve => (locked = resolve));
            // A controller command that holds the OnOff lock and turns the light on when it commits
            const command = endpoint.act(async (agent: any) => {
                const onOff = agent.get(OnOffServer);
                await agent.context.transaction.addResources(onOff);
                await agent.context.transaction.begin();
                onOff.state.onOff = true;
                locked();
                await released;
            });
            await isLocked;
            // ioBroker reports power true and then false while the command holds the lock
            const ioBrokerChanges = Promise.all([
                mounted.adapter.pushValue('ON_SET', true),
                mounted.adapter.pushValue('ON_SET', false),
            ]);
            await new Promise(resolve => setTimeout(resolve, 20));
            release();
            await command;
            await ioBrokerChanges;
            await waitFor(() => mounted.adapter.valueOf('ON_SET') === true);
            await new Promise(resolve => setTimeout(resolve, 50));
            expect(mounted.adapter.valueOf('ON_SET')).to.equal(true);
            expect(endpoint.state.onOff.onOff).to.equal(true);
        });
    });

    describe('Light without a level state', () => {
        it('maps power only and has no LevelControl', async () => {
            const mounted = await mount(Types.light, { SET: bool(true) });
            const [endpoint] = endpointsOf(mounted);
            expect(endpoint.behaviors.has('levelControl')).to.equal(false);
            expect(endpoint.state.onOff.onOff).to.equal(true);
            await mounted.adapter.pushValue('SET', false);
            expect(endpoint.state.onOff.onOff).to.equal(false);
            await setOnOff(endpoint, true);
            await waitFor(() => mounted.adapter.valueOf('SET') === true);
            expect(writesOf(mounted, 'SET')).to.deep.equal(['SET=true']);
        });
    });

    describe('Dimmer with a power state', () => {
        it('turns OnOff off for ioBroker dimmer 0 and leaves the level unchanged', async () => {
            const mounted = await mount(Types.dimmer, { SET: percent(50), ON_SET: bool(true) });
            const [endpoint] = endpointsOf(mounted);
            await mounted.adapter.pushValue('SET', 0);
            expect(endpoint.state.onOff.onOff).to.equal(false);
            expect(endpoint.state.levelControl.currentLevel).to.equal(127);

            await mounted.adapter.pushValue('SET', 50);
            expect(endpoint.state.onOff.onOff).to.equal(true);
        });

        it('characterization: turns OnOff off for ioBroker power false at a level above 0', async () => {
            const mounted = await mount(Types.dimmer, { SET: percent(50), ON_SET: bool(true) });
            const [endpoint] = endpointsOf(mounted);
            await mounted.adapter.pushValue('ON_SET', false);
            expect(endpoint.state.onOff.onOff).to.equal(false);
            expect(endpoint.state.levelControl.currentLevel).to.equal(127);
        });

        it('starts off when ioBroker power is true but the dimmer is 0', async () => {
            const mounted = await mount(Types.dimmer, { SET: percent(0), ON_SET: bool(true) });
            const [endpoint] = endpointsOf(mounted);
            expect(endpoint.state.onOff.onOff).to.equal(false);
        });

        it('sets power and restores the dimmer from the current level when a controller turns it on at dimmer 0', async () => {
            const mounted = await mount(Types.dimmer, { SET: percent(50), ON_SET: bool(false) });
            const [endpoint] = endpointsOf(mounted);
            await mounted.adapter.pushValue('SET', 0);

            await setOnOff(endpoint, true);
            await waitFor(() => mounted.adapter.valueOf('SET') !== 0);
            expect(mounted.adapter.valueOf('ON_SET')).to.equal(true);
            expect(mounted.adapter.valueOf('SET')).to.equal(50);
        });

        it('characterization: sets only power when a controller turns it off', async () => {
            const mounted = await mount(Types.dimmer, { SET: percent(50), ON_SET: bool(true) });
            const [endpoint] = endpointsOf(mounted);
            await setOnOff(endpoint, false);
            await waitFor(() => mounted.adapter.valueOf('ON_SET') === false);
            expect(mounted.adapter.valueOf('ON_SET')).to.equal(false);
            expect(mounted.adapter.valueOf('SET')).to.equal(50);
        });

        it('sets power for the on part of a MoveToLevelWithOnOff', async () => {
            const mounted = await mount(Types.dimmer, { SET: percent(50), ON_SET: bool(false) });
            const [endpoint] = endpointsOf(mounted);
            expect(endpoint.state.onOff.onOff).to.equal(false);
            await endpoint.act((agent: any) =>
                agent.levelControl.moveToLevelWithOnOff({
                    level: 200,
                    transitionTime: 0,
                    optionsMask: {},
                    optionsOverride: {},
                }),
            );
            await waitFor(() => mounted.adapter.valueOf('ON_SET') === true);
            expect(mounted.adapter.valueOf('ON_SET')).to.equal(true);
            expect(mounted.adapter.valueOf('SET')).to.equal(LightingLevel.toPercent(200));
            expect(endpoint.state.onOff.onOff).to.equal(true);
        });

        it('characterization: sets dimmer 0 for a controller Off when the power state is read-only', async () => {
            const mounted = await mount(Types.ct, {
                DIMMER: percent(50),
                ON_ACTUAL: bool(true),
                TEMPERATURE: num(4000, 'K'),
            });
            const [endpoint] = endpointsOf(mounted);
            await setOnOff(endpoint, false);
            await waitFor(() => mounted.adapter.valueOf('DIMMER') === 0);
            expect(mounted.adapter.valueOf('DIMMER')).to.equal(0);
            expect(mounted.adapter.valueOf('ON_ACTUAL')).to.equal(true);
        });

        it('characterization: ignores its own OnOff write although ioBroker power changed back before the write landed', async () => {
            const mounted = await mount(Types.dimmer, { SET: percent(50), ON_SET: bool(true) });
            const [endpoint] = endpointsOf(mounted);
            await Promise.all([mounted.adapter.pushValue('ON_SET', false), mounted.adapter.pushValue('ON_SET', true)]);
            await new Promise(resolve => setTimeout(resolve, 50));
            expect(writesOf(mounted, 'ON_SET')).to.deep.equal([]);
            expect(endpoint.state.onOff.onOff).to.equal(true);
        });

        it('sets power when a MoveToLevelWithOnOff targets the level the light already has', async () => {
            const mounted = await mount(Types.dimmer, { SET: percent(50), ON_SET: bool(false) });
            const [endpoint] = endpointsOf(mounted);
            await levelCommand(endpoint, 'moveToLevelWithOnOff', { level: 127, transitionTime: 0 });
            await waitFor(() => mounted.adapter.valueOf('ON_SET') === true);
            expect(writesOf(mounted, 'ON_SET')).to.deep.equal(['ON_SET=true']);
        });

        it('sets power for the on part of a MoveWithOnOff and a StepWithOnOff', async () => {
            for (const [command, request] of [
                ['moveWithOnOff', { moveMode: LevelControl.MoveMode.Up, rate: 50 }],
                ['stepWithOnOff', { stepMode: LevelControl.StepMode.Up, stepSize: 20, transitionTime: 0 }],
            ] as const) {
                const mounted = await mount(Types.dimmer, { SET: percent(50), ON_SET: bool(false) });
                const [endpoint] = endpointsOf(mounted);
                await levelCommand(endpoint, command, request);
                await waitFor(() => mounted.adapter.valueOf('ON_SET') === true);
                expect(writesOf(mounted, 'ON_SET'), command).to.deep.equal(['ON_SET=true']);
                expect(endpoint.state.onOff.onOff, command).to.equal(true);
            }
        });

        it('characterization: writes no power for a StepWithOnOff while the light is already on', async () => {
            const mounted = await mount(Types.dimmer, { SET: percent(50), ON_SET: bool(true) });
            const [endpoint] = endpointsOf(mounted);
            await levelCommand(endpoint, 'stepWithOnOff', {
                stepMode: LevelControl.StepMode.Up,
                stepSize: 20,
                transitionTime: 0,
            });
            await waitFor(() => mounted.adapter.valueOf('SET') !== 50);
            expect(mounted.adapter.valueOf('SET')).to.be.closeTo(LightingLevel.toPercent(147), 0.001);
            expect(writesOf(mounted, 'ON_SET')).to.deep.equal([]);
        });

        it('characterization: writes the transition time of a level command in ms before the level', async () => {
            const mounted = await mount(Types.dimmer, {
                SET: percent(50),
                ON_SET: bool(true),
                TRANSITION_TIME: num(0, 'ms'),
            });
            const [endpoint] = endpointsOf(mounted);
            await levelCommand(endpoint, 'moveToLevel', { level: 200, transitionTime: 5 });
            await waitFor(() => mounted.adapter.valueOf('SET') !== 50);
            expect(mounted.adapter.writes).to.deep.equal([
                'TRANSITION_TIME=500',
                `SET=${LightingLevel.toPercent(200)}`,
            ]);
        });

        it('characterization: turns OnOff off for an ioBroker ON_ACTUAL change', async () => {
            const mounted = await mount(Types.dimmer, { SET: percent(50), ON_ACTUAL: bool(true) });
            const [endpoint] = endpointsOf(mounted);
            expect(endpoint.state.onOff.onOff).to.equal(true);
            await mounted.adapter.pushValue('ON_ACTUAL', false);
            expect(endpoint.state.onOff.onOff).to.equal(false);
        });

        it('treats an ioBroker dimmer change to null as no value: OnOff follows power, the level stays', async () => {
            const mounted = await mount(Types.dimmer, { SET: percent(50), ON_SET: bool(true) });
            const [endpoint] = endpointsOf(mounted);
            await mounted.adapter.pushValue('SET', 0);
            expect(endpoint.state.onOff.onOff).to.equal(false);
            await mounted.adapter.pushValue('SET', null);
            expect(endpoint.state.onOff.onOff).to.equal(true);
            expect(endpoint.state.levelControl.currentLevel).to.equal(127);
        });

        it('characterization: keeps OnOff off for a plain MoveToLevel while ioBroker power is false', async () => {
            const mounted = await mount(Types.dimmer, { SET: percent(50), ON_SET: bool(false) });
            const [endpoint] = endpointsOf(mounted);
            await endpoint.act((agent: any) =>
                agent.levelControl.moveToLevel({
                    level: 200,
                    transitionTime: 0,
                    optionsMask: { executeIfOff: true },
                    optionsOverride: { executeIfOff: true },
                }),
            );
            await waitFor(() => mounted.adapter.valueOf('SET') !== 50);
            expect(mounted.adapter.valueOf('SET')).to.equal(LightingLevel.toPercent(200));
            expect(mounted.adapter.valueOf('ON_SET')).to.equal(false);
            expect(endpoint.state.onOff.onOff).to.equal(false);
        });
    });

    describe('Light without a dimmer state', () => {
        it('keeps reporting the highest level after a controller level command', async () => {
            const mounted = await mount(Types.ct, { ON: bool(true), TEMPERATURE: num(4000, 'K') });
            const [endpoint] = endpointsOf(mounted);
            expect((mounted.device as Ct).hasDimmer()).to.equal(false);
            expect(endpoint.state.levelControl.currentLevel).to.equal(LightingLevel.MAX);
            const levels = new Array<number | null>();
            endpoint.events.levelControl.currentLevel$Changed.on((level: number | null) => {
                levels.push(level);
            });
            await moveToLevel(endpoint, 100);
            await waitFor(() => levels.at(-1) === LightingLevel.MAX);
            expect(levels).to.deep.equal([100, LightingLevel.MAX]);
        });
    });

    describe('Pump level scale (Level = percent x 2)', () => {
        it('declares Level 0..200 as the range, so full speed reads as 100 %', async () => {
            const mounted = await mount(Types.pump, { POWER: bool(true), LEVEL: percent(50) });
            const [endpoint] = endpointsOf(mounted);
            expect(endpoint.state.levelControl.minLevel).to.equal(0);
            expect(endpoint.state.levelControl.maxLevel).to.equal(200);
        });

        it('carries half percent steps in both directions', async () => {
            const mounted = await mount(Types.pump, { POWER: bool(true), LEVEL: percent(50) });
            const [endpoint] = endpointsOf(mounted);
            await moveToLevel(endpoint, 101);
            await waitFor(() => mounted.adapter.valueOf('LEVEL') === 50.5);
            expect(mounted.adapter.valueOf('LEVEL')).to.equal(50.5);

            await mounted.adapter.pushValue('LEVEL', 0.2);
            expect(endpoint.state.levelControl.currentLevel).to.equal(1);
        });

        it('maps ioBroker percent to Level 0..200', async () => {
            const mounted = await mount(Types.pump, { POWER: bool(true), LEVEL: percent(50) });
            const [endpoint] = endpointsOf(mounted);
            expect(endpoint.state.levelControl.currentLevel).to.equal(100);

            await mounted.adapter.pushValue('LEVEL', 100);
            expect(endpoint.state.levelControl.currentLevel).to.equal(200);
        });

        it('stops the pump through OnOff for ioBroker level 0 and keeps the level for the next On', async () => {
            const mounted = await mount(Types.pump, { POWER: bool(true), LEVEL: percent(50) });
            const [endpoint] = endpointsOf(mounted);
            expect(endpoint.state.pumpConfigurationAndControl.pumpStatus.running).to.equal(true);
            await mounted.adapter.pushValue('LEVEL', 0);
            expect(endpoint.state.onOff.onOff).to.equal(false);
            expect(endpoint.state.levelControl.currentLevel).to.equal(100);
            expect(endpoint.state.pumpConfigurationAndControl.pumpStatus.running).to.equal(false);

            await setOnOff(endpoint, true);
            await waitFor(() => mounted.adapter.valueOf('LEVEL') === 50);
            expect(mounted.adapter.valueOf('LEVEL')).to.equal(50);
            expect(mounted.adapter.valueOf('POWER')).to.equal(true);
            expect(endpoint.state.pumpConfigurationAndControl.pumpStatus.running).to.equal(true);
        });

        it('treats an ioBroker level change to null as no value and a numeric power as on', async () => {
            const mounted = await mount(Types.pump, { POWER: bool(false), LEVEL: percent(50) });
            const [endpoint] = endpointsOf(mounted);
            await mounted.adapter.pushValue('POWER', 1);
            expect(endpoint.state.onOff.onOff).to.equal(true);
            await mounted.adapter.pushValue('LEVEL', 0);
            expect(endpoint.state.onOff.onOff).to.equal(false);
            await mounted.adapter.pushValue('LEVEL', null);
            expect(endpoint.state.onOff.onOff).to.equal(true);
            expect(endpoint.state.levelControl.currentLevel).to.equal(100);
            expect(endpoint.state.pumpConfigurationAndControl.pumpStatus.running).to.equal(true);
        });

        it('stops the pump when a controller moves to the stopped level 0', async () => {
            const mounted = await mount(Types.pump, { POWER: bool(true), LEVEL: percent(50) });
            const [endpoint] = endpointsOf(mounted);
            await moveToLevel(endpoint, 0);
            await waitFor(() => mounted.adapter.valueOf('LEVEL') === 0);
            expect(mounted.adapter.valueOf('LEVEL')).to.equal(0);
            expect(endpoint.state.onOff.onOff).to.equal(false);
            expect(endpoint.state.pumpConfigurationAndControl.pumpStatus.running).to.equal(false);

            await setOnOff(endpoint, true);
            await waitFor(() => mounted.adapter.valueOf('LEVEL') !== 0);
            expect(mounted.adapter.valueOf('LEVEL')).to.equal(100);
        });

        it('writes 100 % to ioBroker when a controller sends Level 200', async () => {
            const mounted = await mount(Types.pump, { POWER: bool(true), LEVEL: percent(50) });
            const [endpoint] = endpointsOf(mounted);
            await moveToLevel(endpoint, 200);
            await waitFor(() => mounted.adapter.valueOf('LEVEL') === 100);
            expect(mounted.adapter.valueOf('LEVEL')).to.equal(100);
        });

        it('writes 50 % for Level 100 and 100 % for Level 201..254', async () => {
            const mounted = await mount(Types.pump, { POWER: bool(true), LEVEL: percent(10) });
            const [endpoint] = endpointsOf(mounted);
            await moveToLevel(endpoint, 100);
            await waitFor(() => mounted.adapter.valueOf('LEVEL') === 50);
            expect(mounted.adapter.valueOf('LEVEL')).to.equal(50);

            await moveToLevel(endpoint, 254);
            await waitFor(() => mounted.adapter.valueOf('LEVEL') === 100);
            expect(mounted.adapter.valueOf('LEVEL')).to.equal(100);
            expect(endpoint.state.levelControl.currentLevel).to.equal(200);
        });
    });

    describe('BlindButtons with only TILT_SET', () => {
        it('initializes and reports the set value as the tilt', async () => {
            const mounted = await mount(Types.blindButtons, {
                OPEN: bool(false),
                CLOSE: bool(false),
                STOP: bool(false),
                TILT_SET: percent(30),
            });
            const device = mounted.device as BlindButtons;
            expect(device.hasTiltLevel()).to.equal(true);
            expect(device.getTiltLevel()).to.equal(30);
            const [endpoint] = endpointsOf(mounted);
            expect(endpoint.state.windowCovering.currentPositionTiltPercent100ths).to.equal(7000);
        });
    });

    describe('Speaker (Volume) at ioBroker volume 0', () => {
        it('starts as off at 100 % when no level is stored, with no range warning', async () => {
            const mounted = await mount(Types.volume, { SET: percent(0) });
            const [endpoint] = endpointsOf(mounted);
            expect(endpoint.state.onOff.onOff).to.equal(false);
            expect(endpoint.state.levelControl.currentLevel).to.equal(LightingLevel.MAX);
            expect(mounted.adapter.infos.filter(message => message.includes('below minimum'))).to.deep.equal([]);
        });

        it('restores the volume from the current level when a controller turns it on', async () => {
            const mounted = await mount(Types.volume, { SET: percent(50) });
            const [endpoint] = endpointsOf(mounted);
            await mounted.adapter.pushValue('SET', 0);
            expect(endpoint.state.onOff.onOff).to.equal(false);
            expect(endpoint.state.levelControl.currentLevel).to.equal(127);

            await setOnOff(endpoint, true);
            await waitFor(() => mounted.adapter.valueOf('SET') !== 0);
            expect(mounted.adapter.valueOf('SET')).to.equal(LightingLevel.toPercent(127));
        });
    });

    describe('Speaker (Volume) with a mute state', () => {
        it('mutes for ioBroker volume 0 without touching MUTE and keeps the level', async () => {
            const mounted = await mount(Types.volume, { SET: percent(50), MUTE: bool(false) });
            const [endpoint] = endpointsOf(mounted);
            expect(endpoint.state.onOff.onOff).to.equal(true);
            await mounted.adapter.pushValue('SET', 0);
            expect(endpoint.state.onOff.onOff).to.equal(false);
            expect(endpoint.state.levelControl.currentLevel).to.equal(127);
            expect(mounted.adapter.valueOf('MUTE')).to.equal(false);
        });

        it('characterization: inverts ioBroker MUTE into OnOff', async () => {
            const mounted = await mount(Types.volume, { SET: percent(50), MUTE: bool(false) });
            const [endpoint] = endpointsOf(mounted);
            await mounted.adapter.pushValue('MUTE', true);
            expect(endpoint.state.onOff.onOff).to.equal(false);
            await mounted.adapter.pushValue('MUTE', false);
            expect(endpoint.state.onOff.onOff).to.equal(true);
        });

        it('unmutes and restores the volume when a controller turns it on at volume 0', async () => {
            const mounted = await mount(Types.volume, { SET: percent(50), MUTE: bool(true) });
            const [endpoint] = endpointsOf(mounted);
            await mounted.adapter.pushValue('SET', 0);

            await setOnOff(endpoint, true);
            await waitFor(() => mounted.adapter.valueOf('SET') !== 0);
            expect(mounted.adapter.valueOf('MUTE')).to.equal(false);
            expect(mounted.adapter.valueOf('SET')).to.equal(50);
        });

        it('characterization: leaves MUTE alone for a level command with on/off, as the speaker LevelControl has no OnOff feature', async () => {
            const mounted = await mount(Types.volume, { SET: percent(50), MUTE: bool(true) });
            const [endpoint] = endpointsOf(mounted);
            await levelCommand(endpoint, 'moveToLevelWithOnOff', { level: 200, transitionTime: 0 });
            await waitFor(() => mounted.adapter.valueOf('SET') !== 50);
            expect(endpoint.state.onOff.onOff).to.equal(false);

            await mounted.adapter.pushValue('MUTE', false);
            await levelCommand(endpoint, 'moveToLevelWithOnOff', { level: 0, transitionTime: 0 });
            await waitFor(() => mounted.adapter.valueOf('SET') === 0);
            expect(writesOf(mounted, 'MUTE')).to.deep.equal([]);
        });

        it('characterization: skips the SET event while an ACTUAL state reports the volume', async () => {
            const mounted = await mount(Types.volume, { SET: percent(50), ACTUAL: percent(50), MUTE: bool(false) });
            const [endpoint] = endpointsOf(mounted);
            await mounted.adapter.pushValue('SET', 20);
            expect(endpoint.state.levelControl.currentLevel).to.equal(127);
            await mounted.adapter.pushValue('ACTUAL', 20);
            expect(endpoint.state.levelControl.currentLevel).to.equal(LightingLevel.fromPercent(20));
        });

        it('characterization: writes MUTE and keeps the volume when a controller turns it off', async () => {
            const mounted = await mount(Types.volume, { SET: percent(50), MUTE: bool(false) });
            const [endpoint] = endpointsOf(mounted);
            await setOnOff(endpoint, false);
            await waitFor(() => mounted.adapter.valueOf('MUTE') === true);
            expect(mounted.adapter.valueOf('MUTE')).to.equal(true);
            expect(mounted.adapter.valueOf('SET')).to.equal(50);
        });
    });

    describe('Speaker (Volume) without a mute state', () => {
        it('characterization: turns on for a volume above 0 and off for volume 0 from a level command with on/off', async () => {
            const mounted = await mount(Types.volume, { SET: percent(0) });
            const [endpoint] = endpointsOf(mounted);
            expect(endpoint.state.onOff.onOff).to.equal(false);
            await levelCommand(endpoint, 'moveToLevelWithOnOff', { level: 200, transitionTime: 0 });
            await waitFor(() => mounted.adapter.valueOf('SET') !== 0);
            expect(mounted.adapter.valueOf('SET')).to.equal(LightingLevel.toPercent(200));
            expect(endpoint.state.onOff.onOff).to.equal(true);

            await levelCommand(endpoint, 'moveToLevelWithOnOff', { level: 0, transitionTime: 0 });
            await waitFor(() => mounted.adapter.valueOf('SET') === 0);
            expect(endpoint.state.onOff.onOff).to.equal(false);
        });
    });

    describe('Speaker (Volume) at Matter level 0', () => {
        it('stays at volume 0 when a controller turns it on after moving it to level 0', async () => {
            const mounted = await mount(Types.volume, { SET: percent(50) });
            const [endpoint] = endpointsOf(mounted);
            await moveToLevel(endpoint, 0);
            await waitFor(() => mounted.adapter.valueOf('SET') === 0);
            expect(endpoint.state.onOff.onOff).to.equal(false);
            await setOnOff(endpoint, true);
            await new Promise(resolve => setTimeout(resolve, 50));
            expect(writesOf(mounted, 'SET')).to.deep.equal(['SET=0']);
            expect(endpoint.state.onOff.onOff).to.equal(true);
        });
    });

    describe('Speaker (Volume) lowest level', () => {
        it('maps Matter Level 1 to an audible ioBroker volume', async () => {
            const mounted = await mount(Types.volume, { SET: percent(50) });
            const [endpoint] = endpointsOf(mounted);
            await moveToLevel(endpoint, 1);
            await waitFor(() => mounted.adapter.valueOf('SET') !== undefined && mounted.adapter.valueOf('SET') !== 50);
            expect(mounted.adapter.valueOf('SET')).to.equal(1);
            expect(endpoint.state.onOff.onOff).to.equal(true);
            expect(mounted.adapter.infos.filter(message => message.includes('below minimum'))).to.deep.equal([]);
        });

        it('turns volume 0 from ioBroker into OnOff false and leaves the level unchanged', async () => {
            const mounted = await mount(Types.volume, { SET: percent(50) });
            const [endpoint] = endpointsOf(mounted);
            await mounted.adapter.pushValue('SET', 0);
            expect(endpoint.state.onOff.onOff).to.equal(false);
            expect(endpoint.state.levelControl.currentLevel).to.equal(127);
            await mounted.adapter.pushValue('SET', 1);
            expect(endpoint.state.onOff.onOff).to.equal(true);
            expect(endpoint.state.levelControl.currentLevel).to.equal(3);
        });
    });
});
