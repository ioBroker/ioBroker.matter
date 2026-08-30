import { expect } from 'chai';
import {
    DeviceTypeId,
    Environment,
    LogLevel,
    Logger,
    MockStorageService,
    ServerNode,
    StorageService,
    VendorId,
} from '@matter/main';
import { MdnsService } from '@matter/main/protocol';
import { Thermostat as MatterThermostat } from '@matter/main/clusters';
import { StateType, Types } from '@iobroker/type-detector';
import DeviceFactory from '../src/lib/DeviceFactory';
import type { DetectedDevice, DeviceOptions, GenericDevice } from '../src/lib/devices/GenericDevice';
import { SubscribeManager } from '../src/lib/SubscribeManager';
import matterDeviceFabric from '../src/matter/to-matter/matterFactory';
import type { GenericDeviceToMatter } from '../src/matter/to-matter/GenericDeviceToMatter';

interface StateSpec {
    type: 'number' | 'boolean' | 'string';
    val?: ioBroker.StateValue;
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

const temperature = (val: number, min = 5, max = 35): StateSpec => ({ type: 'number', val, min, max, unit: '°C' });
const enumeration = (labels: string[], val = 0): StateSpec => ({
    type: 'number',
    val,
    states: Object.fromEntries(labels.map((label, index) => [String(index), label])),
});

let instanceCounter = 0;

class MockAdapter {
    readonly namespace = 'matter.0';
    readonly debugLog = new Array<string>();
    readonly log = {
        silly: (): void => {},
        debug: (message: string): void => {
            this.debugLog.push(message);
        },
        info: (): void => {},
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

    valueOf(name: string): ioBroker.StateValue | undefined {
        return this.#values.get(this.idOf(name))?.val;
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
        const state = { val: spec.val ?? 0, ack: true, ts: Date.now() } as ioBroker.State;
        this.#values.set(id, state);
        return state;
    }

    async setForeignStateAsync(id: string, value: ioBroker.SettableState | ioBroker.StateValue): Promise<void> {
        const val = typeof value === 'object' && value !== null && 'val' in value ? value.val : value;
        this.#values.set(id, { val, ack: true, ts: Date.now() } as ioBroker.State);
    }

    /** Simulates an acked value arriving from the real device, awaiting the full handler chain. */
    async pushValue(name: string, val: ioBroker.StateValue): Promise<void> {
        const id = this.idOf(name);
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

interface Mounted {
    adapter: MockAdapter;
    device: GenericDevice;
    converter: GenericDeviceToMatter;
    endpoint: any;
}

const cleanups = new Array<() => Promise<void>>();

async function mount(type: Types, specs: StateSet): Promise<Mounted> {
    const index = ++instanceCounter;
    const prefix = `0_userdata.0.setpoint${index}`;
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
    } as DetectedDevice;

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

    const node = await ServerNode.create(ServerNode.RootEndpoint, {
        environment,
        id: `setpoint-${index}`,
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

    return { adapter, device, converter: converter!, endpoint: converter!.matterEndpoints[0] };
}

/** The Thermostat cluster features the endpoint really declares; the setpoint attributes are conformant to them. */
function featuresOf(mounted: Mounted): Record<string, boolean> {
    return mounted.endpoint.state.thermostat.featureMap;
}

describe('Matter setpoint capabilities', function () {
    this.timeout(30000);

    let previousLogLevel: LogLevel;

    before(async () => {
        previousLogLevel = Logger.defaultLogLevel;
        Logger.defaultLogLevel = LogLevel.FATAL;
        await import('@matter/nodejs');
        environment = new Environment('setpoint-test', Environment.default);
        environment.set(StorageService, new MockStorageService(environment));
    });

    afterEach(async () => {
        while (cleanups.length) {
            await cleanups.pop()!();
        }
        SubscribeManager.subscribes.clear();
    });

    after(async () => {
        if (environment?.has(MdnsService)) {
            await environment.get(MdnsService).close();
        }
        Logger.defaultLogLevel = previousLogLevel;
    });

    it('declares Cooling for a thermostat detected through SET_COOLING alone', async () => {
        const mounted = await mount(Types.thermostat, { SET_COOLING: temperature(24, 16, 32) });

        expect(mounted.endpoint.state.thermostat.occupiedCoolingSetpoint).to.equal(2400);
        expect(featuresOf(mounted).cooling).to.equal(true);
        expect(featuresOf(mounted).heating).to.equal(false);
        expect(mounted.endpoint.state.thermostat.controlSequenceOfOperation).to.equal(
            MatterThermostat.ControlSequenceOfOperation.CoolingOnly,
        );
        expect(mounted.endpoint.state.thermostat.systemMode).to.equal(MatterThermostat.SystemMode.Cool);

        await mounted.adapter.pushValue('SET_COOLING', 26);
        expect(mounted.endpoint.state.thermostat.occupiedCoolingSetpoint).to.equal(2600);
    });

    it('declares Heating for an air conditioner detected through SET_HEATING alone', async () => {
        const mounted = await mount(Types.airCondition, { SET_HEATING: temperature(21, 7, 30) });

        expect(mounted.endpoint.state.thermostat.occupiedHeatingSetpoint).to.equal(2100);
        expect(featuresOf(mounted).heating).to.equal(true);
        expect(featuresOf(mounted).cooling).to.equal(false);
        expect(mounted.endpoint.state.thermostat.controlSequenceOfOperation).to.equal(
            MatterThermostat.ControlSequenceOfOperation.HeatingOnly,
        );

        await mounted.adapter.pushValue('SET_HEATING', 23);
        expect(mounted.endpoint.state.thermostat.occupiedHeatingSetpoint).to.equal(2300);
    });

    it('does not promise a setpoint kind that only a mode names and no state can back', async () => {
        // A dedicated setpoint implies its own kind only; without the shared SET state the COOL mode has
        // nothing to write to, so advertising Cooling would drop every controller write to it
        const mounted = await mount(Types.thermostat, {
            SET_HEATING: temperature(21, 7, 30),
            MODE: enumeration(['AUTO', 'HEAT', 'COOL'], 2),
        });

        expect(featuresOf(mounted).heating).to.equal(true);
        expect(featuresOf(mounted).cooling).to.equal(false);
    });

    it('does not narrow the cluster limits when the ioBroker state declares no range', async () => {
        // A thermostat whose state carries no min/max must still accept the setpoints the device itself does
        const mounted = await mount(Types.thermostat, { SET: { type: 'number', val: 20, unit: '°C' } });

        expect(mounted.endpoint.state.thermostat.minHeatSetpointLimit).to.equal(0);
        expect(mounted.endpoint.state.thermostat.maxHeatSetpointLimit).to.equal(5000);
    });

    it('publishes the setpoint the device holds rather than cropping it to a display default', async () => {
        // The limits accept 5 °C, so reporting 7 °C at startup would show a setpoint the device never held
        const mounted = await mount(Types.thermostat, { SET: { type: 'number', val: 5, unit: '°C' } });

        expect(mounted.endpoint.state.thermostat.occupiedHeatingSetpoint).to.equal(500);
    });

    it('keeps the feature set a device with modes had before setpoint states were consulted', async () => {
        const mounted = await mount(Types.thermostat, {
            SET: temperature(20),
            MODE: enumeration(['HEAT', 'COOL', 'AUTO'], 0),
        });

        expect(featuresOf(mounted).heating).to.equal(true);
        expect(featuresOf(mounted).cooling).to.equal(true);
        expect(featuresOf(mounted).autoMode).to.equal(true);
        expect(mounted.endpoint.state.thermostat.controlSequenceOfOperation).to.equal(
            MatterThermostat.ControlSequenceOfOperation.CoolingAndHeating,
        );
        expect(mounted.endpoint.state.thermostat.minSetpointDeadBand).to.equal(0);
    });

    it('reports a setpoint write it cannot route because the ioBroker mode moved on', async () => {
        const mounted = await mount(Types.thermostat, {
            SET: temperature(20),
            MODE: enumeration(['HEAT', 'COOL', 'AUTO'], 0),
        });

        // The ioBroker device switches to cooling while the Matter system mode still says heating
        await mounted.adapter.pushValue('MODE', 1);
        await mounted.endpoint.set({ thermostat: { systemMode: MatterThermostat.SystemMode.Heat } });

        mounted.adapter.debugLog.length = 0;
        const events = mounted.endpoint.events.thermostat;
        await mounted.endpoint.set({ thermostat: { occupiedHeatingSetpoint: 2350 } });
        // A remote write reaches the converter as this event with a subject in the context
        events.occupiedHeatingSetpoint$Changed.emit(2350, 2000, { subject: 'test' });

        await new Promise(resolve => setTimeout(resolve, 2000));

        expect(mounted.adapter.valueOf('SET')).to.equal(20);
        // The dial must not keep showing a temperature the device never accepted
        expect(mounted.endpoint.state.thermostat.occupiedHeatingSetpoint).to.equal(2000);
        expect(
            mounted.adapter.debugLog.filter(message => message.includes('Dropping heating setpoint write')),
            `setpoint drop was not reported: ${JSON.stringify(mounted.adapter.debugLog)}`,
        ).to.have.lengthOf(1);
    });
});
