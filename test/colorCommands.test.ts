import { expect } from 'chai';
import { DeviceTypeId, type Endpoint, type Environment, LogLevel, Logger, ServerNode, VendorId } from '@matter/main';
import { ColorControl } from '@matter/main/clusters';
import { StateType, Types } from '@iobroker/type-detector';
import DeviceFactory from '../src/lib/DeviceFactory';
import { Ct } from '../src/lib/devices/Ct';
import type { DetectedDevice, DeviceOptions } from '../src/lib/devices/GenericDevice';
import { SubscribeManager } from '../src/lib/SubscribeManager';
import { IoBrokerEvents } from '../src/matter/behaviors/IoBrokerEvents';
import type { GenericDeviceToMatter } from '../src/matter/to-matter/GenericDeviceToMatter';
import matterDeviceFabric from '../src/matter/to-matter/matterFactory';
import { ColorTemperatureMapping } from '../src/matter/to-matter/ColorTemperatureMapping';
import { createMatterTestEnvironment } from './helpers/matterTestEnvironment';
import { LightingLevel } from '../src/matter/ConversionUtils';

// A Matter controller drives colour commands on an ioBroker light we expose; the tests check what the
// converter writes to the ioBroker states.

interface StateSpec {
    type: 'number' | 'boolean' | 'string';
    val?: ioBroker.StateValue;
    min?: number;
    max?: number;
}

type StateSet = Record<string, StateSpec>;

const STATE_TYPES: Record<StateSpec['type'], StateType> = {
    number: StateType.Number,
    boolean: StateType.Boolean,
    string: StateType.String,
};

const NO_OPTIONS = { optionsMask: {}, optionsOverride: {} };

let instanceCounter = 0;

class MockAdapter {
    readonly namespace = 'matter.0';
    /** Messages logged at info level, in log order. */
    readonly infos = new Array<string>();
    readonly log = {
        silly: (): void => {},
        debug: (): void => {},
        info: (message: string): void => {
            this.infos.push(message);
        },
        warn: (): void => {},
        error: (): void => {},
    };
    readonly #specs: StateSet;
    readonly #prefix: string;
    readonly #values = new Map<string, ioBroker.State>();
    /** Values written by the converter, by state name, in write order. */
    readonly written = new Map<string, ioBroker.StateValue[]>();

    constructor(specs: StateSet, prefix: string) {
        this.#specs = specs;
        this.#prefix = prefix;
    }

    #nameOf(id: string): string {
        return id.substring(this.#prefix.length + 1);
    }

    async getForeignObjectAsync(id: string): Promise<ioBroker.Object | null> {
        const spec = this.#specs[this.#nameOf(id)];
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
            },
            native: {},
        } as ioBroker.Object;
    }

    async getForeignStateAsync(id: string): Promise<ioBroker.State | null> {
        const existing = this.#values.get(id);
        if (existing) {
            return existing;
        }
        const spec = this.#specs[this.#nameOf(id)];
        if (!spec) {
            return null;
        }
        const state = { val: spec.val ?? null, ack: true, ts: Date.now() } as ioBroker.State;
        this.#values.set(id, state);
        return state;
    }

    async setForeignStateAsync(id: string, value: ioBroker.StateValue | { val?: ioBroker.StateValue }): Promise<void> {
        const val = typeof value === 'object' && value !== null ? (value.val ?? null) : value;
        this.#values.set(id, { val, ack: true, ts: Date.now() } as ioBroker.State);
        const name = this.#nameOf(id);
        const list = this.written.get(name) ?? new Array<ioBroker.StateValue>();
        list.push(val);
        this.written.set(name, list);
    }

    /** Simulates an acked value arriving from the real device, awaiting the full handler chain. */
    async pushValue(name: string, val: ioBroker.StateValue): Promise<void> {
        const id = `${this.#prefix}.${name}`;
        const state = { val, ack: true, ts: Date.now() } as ioBroker.State;
        this.#values.set(id, state);
        await SubscribeManager.observer(id, state);
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

let environment: Environment;
const cleanups = new Array<() => Promise<void>>();

interface Mounted {
    adapter: MockAdapter;
    endpoint: Endpoint;
}

interface CreatedDevice {
    adapter: MockAdapter;
    device: Awaited<ReturnType<typeof DeviceFactory>>;
    index: number;
}

async function createDevice(type: Types, specs: StateSet): Promise<CreatedDevice> {
    const index = ++instanceCounter;
    const prefix = `0_userdata.0.color${index}`;
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
        uuid: `uuid-color-${index}`,
        enabled: true,
        name: `Color ${index}`,
        oid: prefix,
        type,
        auto: false,
        noComposed: false,
    };
    const device = await DeviceFactory(detectedDevice, adapter as unknown as ioBroker.Adapter, options, false);
    return { adapter, device, index };
}

async function mount(type: Types, specs: StateSet): Promise<Mounted> {
    const { adapter, device, index } = await createDevice(type, specs);
    const converter: GenericDeviceToMatter | null = await matterDeviceFabric(
        device,
        `Color ${index}`,
        `uuid-color-${index}`,
    );
    expect(converter, `no converter for ${type}`).to.not.equal(null);

    const node = await ServerNode.create(ServerNode.RootEndpoint, {
        environment,
        id: `color-${index}`,
        network: { port: 0 },
        productDescription: { name: 'Test', deviceType: DeviceTypeId(0x0016) },
        basicInformation: {
            vendorName: 'ioBroker',
            vendorId: VendorId(0xfff1),
            productName: 'Test',
            productId: 0x8000,
        },
    });
    for (const endpoint of converter!.matterEndpoints) {
        await node.add(endpoint);
    }
    await converter!.init();

    cleanups.push(async () => {
        await node.close();
        await converter!.destroy();
    });

    return { adapter, endpoint: converter!.matterEndpoints[0] };
}

/** The converter handlers run from matter.js reactors after the command returns, so poll for the write. */
async function waitForWrite(adapter: MockAdapter, name: string): Promise<ioBroker.StateValue> {
    for (let i = 0; i < 100; i++) {
        const list = adapter.written.get(name);
        if (list?.length) {
            return list[list.length - 1];
        }
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error(`no write to ${name}`);
}

async function settle(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 100));
}

async function invoke(endpoint: Endpoint, command: string, request: Record<string, unknown>): Promise<void> {
    await endpoint.act((agent: any) => agent.colorControl[command]({ ...NO_OPTIONS, ...request }));
}

/**
 * Emits the event the colour control server sends for an xy command, with x and y in Matter units. A MoveToColor
 * command goes through `EventedTransitions`, which emits several x/y pairs for one command, so the xy tests drive
 * the converter handler directly.
 */
async function emitXyCommand(endpoint: Endpoint, x: number, y: number): Promise<void> {
    await endpoint.eventsOf(IoBrokerEvents).colorXyControlled.emit(x, y, 0);
}

function colorControlState(endpoint: Endpoint): {
    currentHue: number;
    currentSaturation: number;
    currentX: number;
    currentY: number;
    colorTemperatureMireds: number;
    colorTempPhysicalMinMireds: number;
    colorTempPhysicalMaxMireds: number;
    colorMode: ColorControl.ColorMode;
    enhancedColorMode: ColorControl.EnhancedColorMode;
} {
    return (endpoint.state as any).colorControl;
}

// kelvinToMireds(2001) and kelvinToMireds(6493) round to 500 and 154 mireds, which convert back to 2000 K and
// 6494 K, one kelvin outside the range of the TEMPERATURE state.
const LOW_KELVIN = 2001;
const HIGH_KELVIN = 6493;

describe('colour commands from a Matter controller to an ioBroker light', function () {
    this.timeout(30000);

    let previousLogLevel: LogLevel;

    before(async () => {
        previousLogLevel = Logger.defaultLogLevel;
        Logger.defaultLogLevel = LogLevel.FATAL;
        environment = await createMatterTestEnvironment('color-commands-test');
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

    describe('ColorTemperatureMapping', () => {
        async function createCt(specs: StateSet): Promise<{ adapter: MockAdapter; device: Ct }> {
            const { adapter, device } = await createDevice(Types.ct, specs);
            if (!(device instanceof Ct)) {
                throw new Error('expected a Ct device');
            }
            return { adapter, device };
        }

        it('writeTemperature throws when the device has no TEMPERATURE state', async () => {
            const { device } = await createCt({ ON: { type: 'boolean', val: true } });
            const mapping = new ColorTemperatureMapping(device);

            let error: unknown;
            try {
                await mapping.writeTemperature(250, 0);
            } catch (e) {
                error = e;
            }

            expect(error).to.be.instanceOf(Error).with.property('message', 'Temperature state not found');
        });

        it('logs once at info level that a device without TEMPERATURE state ignores colour temperature commands', async () => {
            const { adapter, endpoint } = await mount(Types.hue, {
                HUE: { type: 'number', val: 0, min: 0, max: 360 },
                ON: { type: 'boolean', val: true },
            });

            await invoke(endpoint, 'moveToColorTemperature', { colorTemperatureMireds: 250, transitionTime: 0 });
            await invoke(endpoint, 'moveToColorTemperature', { colorTemperatureMireds: 300, transitionTime: 0 });
            await settle();

            expect(
                adapter.infos.filter(message => message.includes('does not support color temperature')),
            ).to.have.length(1);
        });
    });

    describe('CieToMatter', () => {
        it('writes a MoveToColorTemperature command to the TEMPERATURE state in kelvin', async () => {
            const { adapter, endpoint } = await mount(Types.cie, {
                CIE: { type: 'string', val: '[0.3,0.3]' },
                ON: { type: 'boolean', val: true },
                TEMPERATURE: { type: 'number', val: 2700, min: 2000, max: 6500 },
            });

            await invoke(endpoint, 'moveToColorTemperature', { colorTemperatureMireds: 250, transitionTime: 0 });

            expect(await waitForWrite(adapter, 'TEMPERATURE')).to.equal(4000);
        });

        it('writes an xy colour command to the CIE state in the 0..1 range', async () => {
            const { adapter, endpoint } = await mount(Types.cie, {
                CIE: { type: 'string', val: '[0.3,0.3]' },
                ON: { type: 'boolean', val: true },
            });

            await emitXyCommand(endpoint, 32768, 16384);

            expect(await waitForWrite(adapter, 'CIE')).to.equal('[0.5,0.25]');
        });

        it('ignores a colour temperature command when the device has no TEMPERATURE state', async () => {
            const { adapter, endpoint } = await mount(Types.cie, {
                CIE: { type: 'string', val: '[0.3,0.3]' },
                ON: { type: 'boolean', val: true },
            });

            await invoke(endpoint, 'moveToColorTemperature', { colorTemperatureMireds: 250, transitionTime: 0 });
            await settle();

            expect(adapter.written.has('TEMPERATURE')).to.equal(false);
            // The handler resets the attribute to the 1000 K default minimum, telling the controller the change did not apply
            expect(colorControlState(endpoint).colorTemperatureMireds).to.equal(1000);
            expect(colorControlState(endpoint).colorMode).to.equal(ColorControl.ColorMode.CurrentXAndCurrentY);
            expect(colorControlState(endpoint).enhancedColorMode).to.equal(
                ColorControl.EnhancedColorMode.CurrentXAndCurrentY,
            );
        });

        it('writes the transition time of a colour temperature command in milliseconds', async () => {
            const { adapter, endpoint } = await mount(Types.cie, {
                CIE: { type: 'string', val: '[0.3,0.3]' },
                ON: { type: 'boolean', val: true },
                TEMPERATURE: { type: 'number', val: 2700, min: 2000, max: 6500 },
                TRANSITION_TIME: { type: 'number', val: 0 },
            });

            await invoke(endpoint, 'moveToColorTemperature', { colorTemperatureMireds: 250, transitionTime: 5 });

            expect(await waitForWrite(adapter, 'TRANSITION_TIME')).to.equal(500);
        });

        it('limits the commanded colour temperature to the TEMPERATURE range at the low end', async () => {
            const { adapter, endpoint } = await mount(Types.cie, {
                CIE: { type: 'string', val: '[0.3,0.3]' },
                ON: { type: 'boolean', val: true },
                TEMPERATURE: { type: 'number', val: 2700, min: LOW_KELVIN, max: HIGH_KELVIN },
            });

            await invoke(endpoint, 'moveToColorTemperature', { colorTemperatureMireds: 600, transitionTime: 0 });

            expect(await waitForWrite(adapter, 'TEMPERATURE')).to.equal(LOW_KELVIN);
        });

        it('limits the commanded colour temperature to the TEMPERATURE range at the high end', async () => {
            const { adapter, endpoint } = await mount(Types.cie, {
                CIE: { type: 'string', val: '[0.3,0.3]' },
                ON: { type: 'boolean', val: true },
                TEMPERATURE: { type: 'number', val: 2700, min: LOW_KELVIN, max: HIGH_KELVIN },
            });

            await invoke(endpoint, 'moveToColorTemperature', { colorTemperatureMireds: 100, transitionTime: 0 });

            expect(await waitForWrite(adapter, 'TEMPERATURE')).to.equal(HIGH_KELVIN);
        });

        it('converts an ioBroker colour temperature to mireds within the declared range', async () => {
            const { adapter, endpoint } = await mount(Types.cie, {
                CIE: { type: 'string', val: '[0.3,0.3]' },
                ON: { type: 'boolean', val: true },
                TEMPERATURE: { type: 'number', val: 2700, min: 2000, max: 6500 },
            });

            await adapter.pushValue('TEMPERATURE', 4000);
            expect(colorControlState(endpoint).colorTemperatureMireds).to.equal(250);

            await adapter.pushValue('TEMPERATURE', 10000);
            expect(colorControlState(endpoint).colorTemperatureMireds).to.equal(154);
        });

        it('limits the declared colour temperature range to 1000..20000 K', async () => {
            const { endpoint } = await mount(Types.cie, {
                CIE: { type: 'string', val: '[0.3,0.3]' },
                ON: { type: 'boolean', val: true },
                TEMPERATURE: { type: 'number', val: 2700, min: 500, max: 30000 },
            });

            expect(colorControlState(endpoint).colorTempPhysicalMinMireds).to.equal(50);
            expect(colorControlState(endpoint).colorTempPhysicalMaxMireds).to.equal(1000);
        });
    });

    describe('CtToMatter', () => {
        it('writes a MoveToColorTemperature command to the TEMPERATURE state in kelvin', async () => {
            const { adapter, endpoint } = await mount(Types.ct, {
                TEMPERATURE: { type: 'number', val: 2700, min: 2000, max: 6500 },
                ON: { type: 'boolean', val: true },
            });

            await invoke(endpoint, 'moveToColorTemperature', { colorTemperatureMireds: 250, transitionTime: 0 });

            expect(await waitForWrite(adapter, 'TEMPERATURE')).to.equal(4000);
        });

        it('limits the commanded colour temperature to the TEMPERATURE range at the low end', async () => {
            const { adapter, endpoint } = await mount(Types.ct, {
                TEMPERATURE: { type: 'number', val: 2700, min: LOW_KELVIN, max: HIGH_KELVIN },
                ON: { type: 'boolean', val: true },
            });

            await invoke(endpoint, 'moveToColorTemperature', { colorTemperatureMireds: 600, transitionTime: 0 });

            expect(await waitForWrite(adapter, 'TEMPERATURE')).to.equal(LOW_KELVIN);
        });

        it('limits the commanded colour temperature to the TEMPERATURE range at the high end', async () => {
            const { adapter, endpoint } = await mount(Types.ct, {
                TEMPERATURE: { type: 'number', val: 2700, min: LOW_KELVIN, max: HIGH_KELVIN },
                ON: { type: 'boolean', val: true },
            });

            await invoke(endpoint, 'moveToColorTemperature', { colorTemperatureMireds: 100, transitionTime: 0 });

            expect(await waitForWrite(adapter, 'TEMPERATURE')).to.equal(HIGH_KELVIN);
        });

        it('converts an ioBroker colour temperature to mireds within the declared range', async () => {
            const { adapter, endpoint } = await mount(Types.ct, {
                TEMPERATURE: { type: 'number', val: 2700, min: 2000, max: 6500 },
                ON: { type: 'boolean', val: true },
            });

            await adapter.pushValue('TEMPERATURE', 4000);
            expect(colorControlState(endpoint).colorTemperatureMireds).to.equal(250);

            await adapter.pushValue('TEMPERATURE', 10000);
            expect(colorControlState(endpoint).colorTemperatureMireds).to.equal(154);

            await adapter.pushValue('TEMPERATURE', 1500);
            expect(colorControlState(endpoint).colorTemperatureMireds).to.equal(500);
        });

        it('limits the declared colour temperature range to 1000..20000 K', async () => {
            const { endpoint } = await mount(Types.ct, {
                TEMPERATURE: { type: 'number', val: 2700, min: 500, max: 30000 },
                ON: { type: 'boolean', val: true },
            });

            expect(colorControlState(endpoint).colorTempPhysicalMinMireds).to.equal(50);
            expect(colorControlState(endpoint).colorTempPhysicalMaxMireds).to.equal(1000);
        });
    });

    describe('HueAndRgbToMatter', () => {
        const HUE_180 = 127;

        it('starts at the minimum level when the DIMMER state has no value yet', async () => {
            const { endpoint } = await mount(Types.hue, {
                HUE: { type: 'number', val: 0, min: 0, max: 360 },
                DIMMER: { type: 'number', val: null, min: 0, max: 255 },
                ON: { type: 'boolean', val: true },
            });

            expect((endpoint.state as any).levelControl.currentLevel).to.equal(LightingLevel.MIN);
        });

        it('writes a MoveToHue command to the HUE state in degrees', async () => {
            const { adapter, endpoint } = await mount(Types.hue, {
                HUE: { type: 'number', val: 0, min: 0, max: 360 },
                SATURATION: { type: 'number', val: 100, min: 0, max: 100 },
                DIMMER: { type: 'number', val: 100, min: 0, max: 100 },
                ON: { type: 'boolean', val: true },
            });

            await invoke(endpoint, 'moveToHue', {
                hue: HUE_180,
                direction: ColorControl.Direction.Shortest,
                transitionTime: 0,
            });

            expect(await waitForWrite(adapter, 'HUE')).to.equal(180);
        });

        it('writes the colour of a MoveToHue command to the RGB state of an RGB device', async () => {
            const { adapter, endpoint } = await mount(Types.rgbSingle, {
                RGB: { type: 'string', val: '#ff0000' },
                ON: { type: 'boolean', val: true },
            });

            await invoke(endpoint, 'moveToHue', {
                hue: HUE_180,
                direction: ColorControl.Direction.Shortest,
                transitionTime: 0,
            });

            expect(await waitForWrite(adapter, 'RGB')).to.equal('#00ffff');
        });

        it('writes the colour of a MoveToHue command to the RGBW state of an RGBW device', async () => {
            const { adapter, endpoint } = await mount(Types.rgbwSingle, {
                RGBW: { type: 'string', val: '#ff000000' },
                ON: { type: 'boolean', val: true },
            });

            await invoke(endpoint, 'moveToHue', {
                hue: HUE_180,
                direction: ColorControl.Direction.Shortest,
                transitionTime: 0,
            });

            expect(await waitForWrite(adapter, 'RGBW')).to.equal('#00ffff00');
        });

        it('characterization: MoveToSaturation keeps the current hue of an RGB device in degrees', async () => {
            const { adapter, endpoint } = await mount(Types.rgbSingle, {
                RGB: { type: 'string', val: '#00ffff' },
                ON: { type: 'boolean', val: true },
            });

            await invoke(endpoint, 'moveToSaturation', { saturation: 127, transitionTime: 0 });

            expect(await waitForWrite(adapter, 'RGB')).to.equal('#80ffff');
        });

        it('characterization: MoveToHueAndSaturation writes the hue in degrees', async () => {
            const { adapter, endpoint } = await mount(Types.hue, {
                HUE: { type: 'number', val: 0, min: 0, max: 360 },
                SATURATION: { type: 'number', val: 100, min: 0, max: 100 },
                ON: { type: 'boolean', val: true },
            });

            await invoke(endpoint, 'moveToHueAndSaturation', { hue: HUE_180, saturation: 254, transitionTime: 0 });

            expect(await waitForWrite(adapter, 'HUE')).to.equal(180);
        });

        it('keeps hue/saturation mode when a light without TEMPERATURE state gets a colour temperature command', async () => {
            const { adapter, endpoint } = await mount(Types.hue, {
                HUE: { type: 'number', val: 0, min: 0, max: 360 },
                ON: { type: 'boolean', val: true },
            });

            await invoke(endpoint, 'moveToColorTemperature', { colorTemperatureMireds: 250, transitionTime: 0 });
            await settle();

            expect(adapter.written.has('TEMPERATURE')).to.equal(false);
            expect(colorControlState(endpoint).colorTemperatureMireds).to.equal(1000);
            expect(colorControlState(endpoint).colorMode).to.equal(
                ColorControl.ColorMode.CurrentHueAndCurrentSaturation,
            );
            expect(colorControlState(endpoint).enhancedColorMode).to.equal(
                ColorControl.EnhancedColorMode.CurrentHueAndCurrentSaturation,
            );
        });

        it('keeps xy mode when a light without TEMPERATURE state in xy mode gets a colour temperature command', async () => {
            const { adapter, endpoint } = await mount(Types.rgbSingle, {
                RGB: { type: 'string', val: '#ff0000' },
                ON: { type: 'boolean', val: true },
            });

            await invoke(endpoint, 'moveToColor', { colorX: 20000, colorY: 20000, transitionTime: 0 });
            await waitForWrite(adapter, 'RGB');
            await settle();
            expect(colorControlState(endpoint).colorMode).to.equal(ColorControl.ColorMode.CurrentXAndCurrentY);
            await invoke(endpoint, 'moveToColorTemperature', { colorTemperatureMireds: 250, transitionTime: 0 });
            await settle();

            expect(colorControlState(endpoint).colorMode).to.equal(ColorControl.ColorMode.CurrentXAndCurrentY);
            expect(colorControlState(endpoint).enhancedColorMode).to.equal(
                ColorControl.EnhancedColorMode.CurrentXAndCurrentY,
            );
        });

        it('limits the commanded colour temperature to the TEMPERATURE range at the low end', async () => {
            const { adapter, endpoint } = await mount(Types.hue, {
                HUE: { type: 'number', val: 0, min: 0, max: 360 },
                ON: { type: 'boolean', val: true },
                TEMPERATURE: { type: 'number', val: 2700, min: LOW_KELVIN, max: HIGH_KELVIN },
            });

            await invoke(endpoint, 'moveToColorTemperature', { colorTemperatureMireds: 600, transitionTime: 0 });

            expect(await waitForWrite(adapter, 'TEMPERATURE')).to.equal(LOW_KELVIN);
        });

        it('limits the commanded colour temperature to the TEMPERATURE range at the high end', async () => {
            const { adapter, endpoint } = await mount(Types.hue, {
                HUE: { type: 'number', val: 0, min: 0, max: 360 },
                ON: { type: 'boolean', val: true },
                TEMPERATURE: { type: 'number', val: 2700, min: LOW_KELVIN, max: HIGH_KELVIN },
            });

            await invoke(endpoint, 'moveToColorTemperature', { colorTemperatureMireds: 100, transitionTime: 0 });

            expect(await waitForWrite(adapter, 'TEMPERATURE')).to.equal(HIGH_KELVIN);
        });

        it('converts an ioBroker colour temperature to mireds within the declared range', async () => {
            const { adapter, endpoint } = await mount(Types.hue, {
                HUE: { type: 'number', val: 0, min: 0, max: 360 },
                ON: { type: 'boolean', val: true },
                TEMPERATURE: { type: 'number', val: 2700, min: 2000, max: 6500 },
            });

            await adapter.pushValue('TEMPERATURE', 4000);
            expect(colorControlState(endpoint).colorTemperatureMireds).to.equal(250);

            await adapter.pushValue('TEMPERATURE', 1500);
            expect(colorControlState(endpoint).colorTemperatureMireds).to.equal(500);
        });

        it('limits the declared colour temperature range to 1000..20000 K', async () => {
            const { endpoint } = await mount(Types.hue, {
                HUE: { type: 'number', val: 0, min: 0, max: 360 },
                ON: { type: 'boolean', val: true },
                TEMPERATURE: { type: 'number', val: 2700, min: 500, max: 30000 },
            });

            expect(colorControlState(endpoint).colorTempPhysicalMinMireds).to.equal(50);
            expect(colorControlState(endpoint).colorTempPhysicalMaxMireds).to.equal(1000);
        });

        it('does not change the DIMMER state of a Hue device at level 1 on an xy colour command', async () => {
            const { adapter, endpoint } = await mount(Types.hue, {
                HUE: { type: 'number', val: 0, min: 0, max: 360 },
                SATURATION: { type: 'number', val: 100, min: 0, max: 100 },
                DIMMER: { type: 'number', val: 50, min: 0, max: 100 },
                ON: { type: 'boolean', val: true },
            });
            await endpoint.act((agent: any) =>
                agent.levelControl.moveToLevel({ ...NO_OPTIONS, level: 1, transitionTime: 0 }),
            );
            expect(await waitForWrite(adapter, 'DIMMER')).to.equal(1);

            await emitXyCommand(endpoint, 20000, 20000);
            await waitForWrite(adapter, 'HUE');
            await settle();

            expect(adapter.written.get('DIMMER')).to.deep.equal([1]);
        });

        it('writes the hue of an xy colour command to the HUE state in whole degrees', async () => {
            const { adapter, endpoint } = await mount(Types.hue, {
                HUE: { type: 'number', val: 0, min: 0, max: 360 },
                SATURATION: { type: 'number', val: 100, min: 0, max: 100 },
                ON: { type: 'boolean', val: true },
            });

            // x = y = 20000 / 65536; xyToRgb + rgbToHsv give 235.24 degrees for this colour
            await emitXyCommand(endpoint, 20000, 20000);

            expect(await waitForWrite(adapter, 'HUE')).to.equal(235);
        });

        it('writes the saturation of an xy colour command to the SATURATION state in percent', async () => {
            const { adapter, endpoint } = await mount(Types.hue, {
                HUE: { type: 'number', val: 0, min: 0, max: 360 },
                SATURATION: { type: 'number', val: 100, min: 0, max: 100 },
                ON: { type: 'boolean', val: true },
            });

            // xyToRgb gives (0xe7, 0xe9, 0xff) / 255 for this colour, saturation 1 - 231/255
            await emitXyCommand(endpoint, 20000, 20000);

            expect(await waitForWrite(adapter, 'SATURATION')).to.equal(9);
        });

        it('keeps the brightness of a dimmed RGB device on an xy colour command', async () => {
            const { adapter, endpoint } = await mount(Types.rgbSingle, {
                RGB: { type: 'string', val: '#400000' },
                ON: { type: 'boolean', val: true },
            });

            await emitXyCommand(endpoint, 20000, 20000);

            // The full scale colour #e7e9ff at the brightness 0x40 of #400000
            expect(await waitForWrite(adapter, 'RGB')).to.equal('#3a3a40');
        });

        it('shows an xy colour at full brightness on an RGB device whose state is black', async () => {
            const { adapter, endpoint } = await mount(Types.rgbSingle, {
                RGB: { type: 'string', val: '#000000' },
                ON: { type: 'boolean', val: true },
            });

            await emitXyCommand(endpoint, 20000, 20000);

            expect(await waitForWrite(adapter, 'RGB')).to.equal('#e7e9ff');
        });

        it('keeps the brightness of a dimmed RGBW device, white included, on an xy colour command', async () => {
            const { adapter, endpoint } = await mount(Types.rgbwSingle, {
                RGBW: { type: 'string', val: '#20000020' },
                ON: { type: 'boolean', val: true },
            });

            await emitXyCommand(endpoint, 20000, 20000);

            // Red plus white of #20000020 is 0x40; the colour #000218e7 at that brightness
            expect(await waitForWrite(adapter, 'RGBW')).to.equal('#0000063a');
        });

        it('keeps a full scale RGB value and does not write DIMMER on an xy colour command', async () => {
            const { adapter, endpoint } = await mount(Types.rgbSingle, {
                RGB: { type: 'string', val: '#ff0000' },
                DIMMER: { type: 'number', val: 50, min: 0, max: 100 },
                ON: { type: 'boolean', val: true },
            });
            await adapter.pushValue('DIMMER', 50);
            expect((endpoint.state as any).levelControl.currentLevel).to.equal(127);

            await emitXyCommand(endpoint, 20000, 20000);

            expect(await waitForWrite(adapter, 'RGB')).to.equal('#e7e9ff');
            expect(adapter.written.has('DIMMER')).to.equal(false);
        });

        it('converts the Matter xy units of an xy colour command for the RGB state of an RGB device', async () => {
            const { adapter, endpoint } = await mount(Types.rgbSingle, {
                RGB: { type: 'string', val: '#ff0000' },
                ON: { type: 'boolean', val: true },
            });

            await emitXyCommand(endpoint, 20000, 20000);

            expect(await waitForWrite(adapter, 'RGB')).to.equal('#e7e9ff');
        });

        it('converts the Matter xy units of an xy colour command for the RGBW state of an RGBW device', async () => {
            const { adapter, endpoint } = await mount(Types.rgbwSingle, {
                RGBW: { type: 'string', val: '#ff000000' },
                ON: { type: 'boolean', val: true },
            });

            await emitXyCommand(endpoint, 20000, 20000);

            expect(await waitForWrite(adapter, 'RGBW')).to.equal('#000218e7');
        });

        it('characterization: a MoveToHue command at level 1 writes a non-black colour to an RGB device', async () => {
            // #010000 has HSV value 1/255, which maps to level 1
            const { adapter, endpoint } = await mount(Types.rgbSingle, {
                RGB: { type: 'string', val: '#010000' },
                ON: { type: 'boolean', val: true },
            });
            expect((endpoint.state as any).levelControl.currentLevel).to.equal(1);

            await invoke(endpoint, 'moveToHue', {
                hue: HUE_180,
                direction: ColorControl.Direction.Shortest,
                transitionTime: 0,
            });

            expect(await waitForWrite(adapter, 'RGB')).to.equal('#000101');
        });

        it('limits red plus white of an RGBW device to full scale for the saturation', async () => {
            // Red 255 + white 128 is limited to 1, so the colour is (1, 0.5, 0.5) with saturation 0.5
            const { endpoint } = await mount(Types.rgbwSingle, {
                RGBW: { type: 'string', val: '#ff000080' },
                ON: { type: 'boolean', val: true },
            });

            expect(colorControlState(endpoint).currentSaturation).to.equal(127);
        });

        it('limits red plus white of an RGBW device to full scale for the xy colour', async () => {
            const { adapter, endpoint } = await mount(Types.rgbwSingle, {
                RGBW: { type: 'string', val: '#ff000000' },
                ON: { type: 'boolean', val: true },
            });
            await invoke(endpoint, 'moveToColor', { colorX: 20000, colorY: 20000, transitionTime: 0 });
            await waitForWrite(adapter, 'RGBW');
            await settle();
            expect(colorControlState(endpoint).colorMode).to.equal(ColorControl.ColorMode.CurrentXAndCurrentY);

            await adapter.pushValue('RGBW', '#ff000080');

            // rgbToXy(1, 128/255, 128/255)
            expect(colorControlState(endpoint).currentX).to.equal(34308);
            expect(colorControlState(endpoint).currentY).to.equal(20528);
        });

        it('characterization: an ioBroker hue in degrees reaches currentHue in the Matter range', async () => {
            const { adapter, endpoint } = await mount(Types.hue, {
                HUE: { type: 'number', val: 0, min: 0, max: 360 },
                ON: { type: 'boolean', val: true },
            });

            await adapter.pushValue('HUE', 180);

            expect(colorControlState(endpoint).currentHue).to.equal(HUE_180);
        });
    });
});
