import { expect } from 'chai';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
import {
    ConcentrationMeasurement,
    FanControl,
    ModeBase,
    ResourceMonitoring,
    RvcCleanMode,
    RvcOperationalState,
    RvcRunMode,
} from '@matter/main/clusters';
import { StateType, Types } from '@iobroker/type-detector';
import DeviceFactory from '../src/lib/DeviceFactory';
import { PropertyType } from '../src/lib/devices/DeviceStateObject';
import type { DetectedDevice, DeviceOptions, GenericDevice } from '../src/lib/devices/GenericDevice';
import { SubscribeManager } from '../src/lib/SubscribeManager';
import matterDeviceFabric from '../src/matter/to-matter/matterFactory';
import type { GenericDeviceToMatter } from '../src/matter/to-matter/GenericDeviceToMatter';
import { AirPurifierToMatter } from '../src/matter/to-matter/AirPurifierToMatter';
import { AirQualityToMatter } from '../src/matter/to-matter/AirQualityToMatter';
import { ContactToMatter } from '../src/matter/to-matter/ContactToMatter';
import { FanToMatter } from '../src/matter/to-matter/FanToMatter';
import { FlowToMatter } from '../src/matter/to-matter/FlowToMatter';
import { PressureToMatter } from '../src/matter/to-matter/PressureToMatter';
import { PumpToMatter } from '../src/matter/to-matter/PumpToMatter';
import { VacuumCleanerToMatter } from '../src/matter/to-matter/VacuumCleanerToMatter';

// ---------------------------------------------------------------------------------------------------------------
// ioBroker side: a mock adapter that serves exactly the states a test asks for, so the hasX() gating in the
// converters can be driven per test case.
// ---------------------------------------------------------------------------------------------------------------

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
const enumeration = (labels: string[], val = 0): StateSpec => ({
    type: 'number',
    val,
    states: Object.fromEntries(labels.map((label, index) => [String(index), label])),
});

const FAN_SPEEDS = ['AUTO', 'HIGH', 'LOW', 'MEDIUM', 'QUIET', 'TURBO'];
const FAN_SWINGS = ['AUTO', 'HORIZONTAL', 'STATIONARY', 'VERTICAL'];
const AIRFLOW_DIRECTIONS = ['FORWARD', 'REVERSE'];
const VACUUM_RUN_MODES = ['IDLE', 'CLEANING', 'MAPPING'];
const VACUUM_MODES = ['AUTO', 'NORMAL', 'QUIET', 'ECO', 'EXPRESS'];
const VACUUM_STATES = ['HOME', 'CLEANING', 'PAUSE'];

const AQI_LEVELS = ['UNKNOWN', 'GOOD', 'FAIR', 'MODERATE', 'POOR', 'VERY_POOR', 'EXTREMELY_POOR'];
const POLLUTANT_LEVELS = ['UNKNOWN', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

let instanceCounter = 0;

class MockAdapter {
    readonly namespace = 'matter.0';
    readonly log = {
        silly: (): void => {},
        debug: (): void => {},
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
    }

    /** Simulates an acked value arriving from the real device, awaiting the full handler chain. */
    async pushValue(name: string, val: any): Promise<void> {
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

describe('to-matter converters for type-detector v6 device types', function () {
    this.timeout(30000);

    let previousLogLevel: LogLevel;

    before(async () => {
        previousLogLevel = Logger.defaultLogLevel;
        Logger.defaultLogLevel = LogLevel.FATAL;
        // The nodejs platform bindings live on the default environment; storage is overridden so nothing is written.
        await import('@matter/nodejs');
        environment = new Environment('to-matter-test', Environment.default);
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

    describe('FanToMatter', () => {
        it('initializes a fan that only has the detector-required SPEED state', async () => {
            const mounted = await mount(Types.fan, { SPEED: enumeration(FAN_SPEEDS, 3) });
            expect(mounted.converter).to.be.instanceOf(FanToMatter);
            const [endpoint] = endpointsOf(mounted);
            expect(endpoint.behaviors.has('onOff'), 'fan without POWER must not gain OnOff').to.equal(false);
            expect(endpoint.state.fanControl.fanMode).to.equal(FanControl.FanMode.Medium);
            expect(endpoint.state.fanControl.fanModeSequence).to.equal(FanControl.FanModeSequence.OffLowMedHighAuto);
        });

        it('narrows fanModeSequence to the steps the device actually offers', async () => {
            const mounted = await mount(Types.fan, { SPEED: enumeration(['HIGH'], 0) });
            const [endpoint] = endpointsOf(mounted);
            expect(endpoint.state.fanControl.fanModeSequence).to.equal(FanControl.FanModeSequence.OffHigh);
            expect(endpoint.state.fanControl.fanMode).to.equal(FanControl.FanMode.High);
        });

        it('initializes a fully equipped fan and gates the rocking/airflow features on the states', async () => {
            const mounted = await mount(Types.fan, {
                SPEED: enumeration(FAN_SPEEDS, 3),
                POWER: bool(true),
                SPEED_LEVEL: percent(40),
                SWING: enumeration(FAN_SWINGS, 1),
                AIRFLOW_DIRECTION: enumeration(AIRFLOW_DIRECTIONS, 1),
                ON_TIME: num(0),
                ELECTRIC_POWER: num(12, 'W'),
                CURRENT: num(1, 'A'),
                VOLTAGE: num(230, 'V'),
                CONSUMPTION: num(5, 'Wh'),
                FREQUENCY: num(50, 'Hz'),
            });
            const [endpoint] = endpointsOf(mounted);
            expect(endpoint.behaviors.has('onOff')).to.equal(true);
            expect(endpoint.state.onOff.onOff).to.equal(true);
            expect(endpoint.state.fanControl.fanMode).to.equal(FanControl.FanMode.Medium);
            expect(endpoint.state.fanControl.percentCurrent).to.equal(40);
            expect(endpoint.state.fanControl.rockSetting.rockLeftRight).to.equal(true);
            expect(endpoint.state.fanControl.airflowDirection).to.equal(FanControl.AirflowDirection.Reverse);
        });

        it('reports percentSetting as null while the fan runs in Auto', async () => {
            const mounted = await mount(Types.fan, { SPEED: enumeration(FAN_SPEEDS, 0), POWER: bool(true) });
            const [endpoint] = endpointsOf(mounted);
            expect(endpoint.state.fanControl.fanMode).to.equal(FanControl.FanMode.Auto);
            expect(endpoint.state.fanControl.percentSetting).to.equal(null);
        });

        it('follows an ioBroker power change into fanMode Off', async () => {
            const mounted = await mount(Types.fan, { SPEED: enumeration(FAN_SPEEDS, 3), POWER: bool(true) });
            const [endpoint] = endpointsOf(mounted);
            await mounted.adapter.pushValue('POWER', false);
            expect(endpoint.state.onOff.onOff).to.equal(false);
            expect(endpoint.state.fanControl.fanMode).to.equal(FanControl.FanMode.Off);
            expect(endpoint.state.fanControl.percentCurrent).to.equal(0);
        });
    });

    describe('AirPurifierToMatter', () => {
        it('initializes an air purifier that only has the detector-required SPEED state', async () => {
            const mounted = await mount(Types.airPurifier, { SPEED: enumeration(FAN_SPEEDS, 1) });
            expect(mounted.converter).to.be.instanceOf(AirPurifierToMatter);
            const [endpoint] = endpointsOf(mounted);
            expect(endpoint.behaviors.has('hepaFilterMonitoring')).to.equal(false);
            expect(endpoint.behaviors.has('activatedCarbonFilterMonitoring')).to.equal(false);
        });

        it('initializes a carbon-filter-only air purifier', async () => {
            const mounted = await mount(Types.airPurifier, {
                SPEED: enumeration(FAN_SPEEDS, 1),
                FILTER_CONDITION_CARBON: percent(42),
            });
            const [endpoint] = endpointsOf(mounted);
            expect(endpoint.behaviors.has('hepaFilterMonitoring')).to.equal(false);
            expect(endpoint.state.activatedCarbonFilterMonitoring.condition).to.equal(42);
            expect(endpoint.state.activatedCarbonFilterMonitoring.degradationDirection).to.equal(
                ResourceMonitoring.DegradationDirection.Down,
            );
        });

        it('initializes a change-indication-only air purifier without a condition attribute', async () => {
            const mounted = await mount(Types.airPurifier, {
                SPEED: enumeration(FAN_SPEEDS, 1),
                FILTER_CHANGE: bool(true),
            });
            const [endpoint] = endpointsOf(mounted);
            expect(endpoint.state.hepaFilterMonitoring.changeIndication).to.equal(
                ResourceMonitoring.ChangeIndication.Warning,
            );
            // Without a FILTER_CONDITION state the Condition feature stays off, so the attribute must not appear
            expect(endpoint.state.hepaFilterMonitoring.condition).to.equal(undefined);
        });

        it('initializes a fully equipped air purifier and follows filter changes', async () => {
            const mounted = await mount(Types.airPurifier, {
                SPEED: enumeration(FAN_SPEEDS, 1),
                POWER: bool(true),
                SPEED_LEVEL: percent(80),
                FILTER_CONDITION: percent(70),
                FILTER_CONDITION_CARBON: percent(60),
                FILTER_CHANGE: bool(false),
            });
            const [endpoint] = endpointsOf(mounted);
            expect(endpoint.state.hepaFilterMonitoring.condition).to.equal(70);
            expect(endpoint.state.hepaFilterMonitoring.changeIndication).to.equal(
                ResourceMonitoring.ChangeIndication.Ok,
            );
            expect(endpoint.state.activatedCarbonFilterMonitoring.condition).to.equal(60);

            await mounted.adapter.pushValue('FILTER_CHANGE', true);
            expect(endpoint.state.hepaFilterMonitoring.changeIndication).to.equal(
                ResourceMonitoring.ChangeIndication.Warning,
            );
            expect(endpoint.state.activatedCarbonFilterMonitoring.changeIndication).to.equal(
                ResourceMonitoring.ChangeIndication.Warning,
            );
        });
    });

    describe('AirQualityToMatter', () => {
        it('initializes an air quality sensor that only has the detector-required AQI state', async () => {
            const mounted = await mount(Types.airQuality, { AQI: enumeration(AQI_LEVELS, 4) });
            expect(mounted.converter).to.be.instanceOf(AirQualityToMatter);
            expect(mounted.converter.matterEndpoints).to.have.length(1);
            const [endpoint] = endpointsOf(mounted);
            expect(endpoint.state.airQuality.airQuality).to.equal(4);
            expect(endpoint.behaviors.has('carbonDioxideConcentrationMeasurement')).to.equal(false);
            expect(endpoint.behaviors.has('temperatureMeasurement')).to.equal(false);
        });

        it('initializes a sensor with a single pollutant concentration', async () => {
            const mounted = await mount(Types.airQuality, {
                AQI: enumeration(AQI_LEVELS, 1),
                CO: num(7, 'ppm'),
            });
            const [endpoint] = endpointsOf(mounted);
            expect(endpoint.behaviors.has('carbonMonoxideConcentrationMeasurement')).to.equal(true);
            expect(endpoint.behaviors.has('carbonDioxideConcentrationMeasurement')).to.equal(false);
            expect(endpoint.state.carbonMonoxideConcentrationMeasurement.measuredValue).to.equal(7);
            expect(endpoint.state.carbonMonoxideConcentrationMeasurement.levelValue).to.equal(
                ConcentrationMeasurement.LevelValue.Unknown,
            );
        });

        it('initializes a sensor that only reports a pollutant level, without a concentration', async () => {
            const mounted = await mount(Types.airQuality, {
                AQI: enumeration(AQI_LEVELS, 1),
                PM25_LEVEL: enumeration(POLLUTANT_LEVELS, 3),
            });
            const [endpoint] = endpointsOf(mounted);
            expect(endpoint.behaviors.has('pm25ConcentrationMeasurement')).to.equal(true);
            expect(endpoint.state.pm25ConcentrationMeasurement.measuredValue).to.equal(null);
            expect(endpoint.state.pm25ConcentrationMeasurement.levelValue).to.equal(
                ConcentrationMeasurement.LevelValue.High,
            );
        });

        it('initializes a fully equipped air quality sensor with all three endpoints', async () => {
            const mounted = await mount(Types.airQuality, {
                AQI: enumeration(AQI_LEVELS, 2),
                POWER: bool(true),
                PRESSURE: num(1013, 'mbar'),
                ACTUAL: num(21.5, '°C'),
                HUMIDITY: percent(55.5),
                CO2: num(800, 'ppm'),
                CO2_LEVEL: enumeration(POLLUTANT_LEVELS, 1),
                TVOC: num(120, 'ppb'),
                TVOC_LEVEL: enumeration(POLLUTANT_LEVELS, 2),
                PM1: num(3, 'µg/m³'),
                PM25: num(9, 'µg/m³'),
                PM10: num(14, 'µg/m³'),
                CO: num(2, 'ppm'),
                NO2: num(18, 'ppb'),
                O3: num(25, 'ppb'),
                CH2O: num(6, 'µg/m³'),
                RN: num(40, 'Bq/m³'),
                SO2: num(11, 'µg/m³'),
            });
            expect(mounted.converter.matterEndpoints).to.have.length(3);
            const [airQuality, pressure, power] = endpointsOf(mounted);
            expect(airQuality.state.temperatureMeasurement.measuredValue).to.equal(2150);
            expect(airQuality.state.relativeHumidityMeasurement.measuredValue).to.equal(5550);
            expect(airQuality.state.carbonDioxideConcentrationMeasurement.measuredValue).to.equal(800);
            expect(airQuality.state.carbonDioxideConcentrationMeasurement.levelValue).to.equal(
                ConcentrationMeasurement.LevelValue.Low,
            );
            expect(pressure.state.pressureMeasurement.measuredValue).to.equal(1013);
            expect(power.state.onOff.onOff).to.equal(true);
        });

        it('scales temperature and humidity updates and passes pressure through unchanged', async () => {
            const mounted = await mount(Types.airQuality, {
                AQI: enumeration(AQI_LEVELS, 1),
                ACTUAL: num(0, '°C'),
                HUMIDITY: percent(0),
                PRESSURE: num(0, 'mbar'),
            });
            const [airQuality, pressure] = endpointsOf(mounted);
            await mounted.adapter.pushValue('ACTUAL', -12.34);
            await mounted.adapter.pushValue('HUMIDITY', 43.21);
            await mounted.adapter.pushValue('PRESSURE', 987.6);
            expect(airQuality.state.temperatureMeasurement.measuredValue).to.equal(-1234);
            expect(airQuality.state.relativeHumidityMeasurement.measuredValue).to.equal(4321);
            expect(pressure.state.pressureMeasurement.measuredValue).to.equal(988);
        });
    });

    describe('ContactToMatter', () => {
        it('maps the ioBroker contact state without inverting it', async () => {
            const mounted = await mount(Types.contact, { ACTUAL: bool(true) });
            expect(mounted.converter).to.be.instanceOf(ContactToMatter);
            const [endpoint] = endpointsOf(mounted);
            // ioBroker sensor.contact and Matter BooleanState agree: true = closed
            expect(endpoint.state.booleanState.stateValue).to.equal(true);

            await mounted.adapter.pushValue('ACTUAL', false);
            expect(endpoint.state.booleanState.stateValue).to.equal(false);
        });

        it('differs from the Window converter, which does invert', async () => {
            const contact = await mount(Types.contact, { ACTUAL: bool(true) });
            const window = await mount(Types.window, { ACTUAL: bool(true) });
            expect(endpointsOf(contact)[0].state.booleanState.stateValue).to.equal(true);
            expect(endpointsOf(window)[0].state.booleanState.stateValue).to.equal(false);
        });
    });

    describe('FlowToMatter', () => {
        it('converts m³/h to the Matter 10 x m³/h measured value', async () => {
            const mounted = await mount(Types.flow, { FLOW: num(12.5, 'm³/h') });
            expect(mounted.converter).to.be.instanceOf(FlowToMatter);
            const [endpoint] = endpointsOf(mounted);
            expect(endpoint.state.flowMeasurement.measuredValue).to.equal(125);

            await mounted.adapter.pushValue('FLOW', 3.26);
            expect(endpoint.state.flowMeasurement.measuredValue).to.equal(33);
        });

        it('clamps out-of-range flow into the nullable uint16 range', async () => {
            const mounted = await mount(Types.flow, { FLOW: num(0, 'm³/h') });
            const [endpoint] = endpointsOf(mounted);
            await mounted.adapter.pushValue('FLOW', 1_000_000);
            expect(endpoint.state.flowMeasurement.measuredValue).to.equal(0xfffe);
            await mounted.adapter.pushValue('FLOW', -5);
            expect(endpoint.state.flowMeasurement.measuredValue).to.equal(0);
        });
    });

    describe('PressureToMatter', () => {
        it('passes mbar through unchanged because 10 x kPa and mbar cancel out', async () => {
            const mounted = await mount(Types.pressure, { PRESSURE: num(1013.25, 'mbar') });
            expect(mounted.converter).to.be.instanceOf(PressureToMatter);
            const [endpoint] = endpointsOf(mounted);
            expect(endpoint.state.pressureMeasurement.measuredValue).to.equal(1013);

            await mounted.adapter.pushValue('PRESSURE', 950.4);
            expect(endpoint.state.pressureMeasurement.measuredValue).to.equal(950);
        });

        it('clamps to -32767, the most negative value a nullable int16 can encode', async () => {
            const mounted = await mount(Types.pressure, { PRESSURE: num(0, 'mbar') });
            const [endpoint] = endpointsOf(mounted);
            await mounted.adapter.pushValue('PRESSURE', -40_000);
            expect(endpoint.state.pressureMeasurement.measuredValue).to.equal(-32767);
        });
    });

    describe('PumpToMatter', () => {
        it('initializes a pump that only has the detector-required POWER state', async () => {
            const mounted = await mount(Types.pump, { POWER: bool(true) });
            expect(mounted.converter).to.be.instanceOf(PumpToMatter);
            const [endpoint] = endpointsOf(mounted);
            expect(endpoint.behaviors.has('levelControl')).to.equal(false);
            expect(endpoint.behaviors.has('temperatureMeasurement')).to.equal(false);
            expect(endpoint.behaviors.has('pressureMeasurement')).to.equal(false);
            expect(endpoint.behaviors.has('flowMeasurement')).to.equal(false);
            expect(endpoint.state.onOff.onOff).to.equal(true);
            expect(endpoint.state.pumpConfigurationAndControl.pumpStatus.running).to.equal(true);
        });

        it('initializes a fully equipped pump and converts every measurement', async () => {
            const mounted = await mount(Types.pump, {
                POWER: bool(true),
                LEVEL: percent(50),
                TEMPERATURE: num(21.5, '°C'),
                PRESSURE: num(1013, 'mbar'),
                FLOW: num(12.5, 'm³/h'),
                ELECTRIC_POWER: num(30, 'W'),
                CURRENT: num(1, 'A'),
                VOLTAGE: num(230, 'V'),
                CONSUMPTION: num(8, 'Wh'),
                FREQUENCY: num(50, 'Hz'),
            });
            const [endpoint] = endpointsOf(mounted);
            expect(endpoint.state.levelControl.currentLevel).to.equal(127);
            expect(endpoint.state.temperatureMeasurement.measuredValue).to.equal(2150);
            expect(endpoint.state.pressureMeasurement.measuredValue).to.equal(1013);
            expect(endpoint.state.flowMeasurement.measuredValue).to.equal(125);

            await mounted.adapter.pushValue('TEMPERATURE', -5.5);
            await mounted.adapter.pushValue('FLOW', 4.44);
            expect(endpoint.state.temperatureMeasurement.measuredValue).to.equal(-550);
            expect(endpoint.state.flowMeasurement.measuredValue).to.equal(44);
        });

        it('clears the running bit when the level drops to zero', async () => {
            const mounted = await mount(Types.pump, { POWER: bool(true), LEVEL: percent(50) });
            const [endpoint] = endpointsOf(mounted);
            expect(endpoint.state.pumpConfigurationAndControl.pumpStatus.running).to.equal(true);
            await mounted.adapter.pushValue('LEVEL', 0);
            expect(endpoint.state.pumpConfigurationAndControl.pumpStatus.running).to.equal(false);
        });
    });

    describe('VacuumCleanerToMatter', () => {
        /** Invokes a cluster command the way a controller would, so the command handlers are covered end to end. */
        async function invoke(endpoint: any, cluster: string, command: string, request?: any): Promise<any> {
            return endpoint.act((agent: any) => agent[cluster][command](request));
        }

        it('offers the Idle and Cleaning run modes a robot without RUN_MODE can still be driven with', async () => {
            const mounted = await mount(Types.vacuumCleaner, { POWER: bool(false) });
            expect(mounted.converter).to.be.instanceOf(VacuumCleanerToMatter);
            const [endpoint] = endpointsOf(mounted);
            expect(endpoint.state.rvcRunMode.supportedModes.map((mode: any) => mode.mode)).to.deep.equal([0, 1]);
            expect(endpoint.state.rvcRunMode.currentMode).to.equal(0);
            expect(endpoint.behaviors.has('rvcCleanMode'), 'no MODE state must mean no RvcCleanMode').to.equal(false);
            expect(endpoint.state.rvcOperationalState.operationalState).to.equal(
                RvcOperationalState.OperationalState.Docked,
            );
        });

        it('advertises pause, resume and go home only when the device has the states behind them', async () => {
            const without = await mount(Types.vacuumCleaner, { POWER: bool(false) });
            expect(endpointsOf(without)[0].state.rvcOperationalState.acceptedCommandList).to.deep.equal([]);

            const withPauseOnly = await mount(Types.vacuumCleaner, { POWER: bool(false), PAUSE: bool(false) });
            expect(endpointsOf(withPauseOnly)[0].state.rvcOperationalState.acceptedCommandList).to.deep.equal([0, 3]);

            const withHomeOnly = await mount(Types.vacuumCleaner, { POWER: bool(false), HOME: bool(false) });
            expect(endpointsOf(withHomeOnly)[0].state.rvcOperationalState.acceptedCommandList).to.deep.equal([128]);

            const withBoth = await mount(Types.vacuumCleaner, {
                POWER: bool(false),
                PAUSE: bool(false),
                HOME: bool(false),
            });
            expect(endpointsOf(withBoth)[0].state.rvcOperationalState.acceptedCommandList).to.deep.equal([0, 3, 128]);
        });

        it('initializes a fully equipped robot from its ioBroker states', async () => {
            const mounted = await mount(Types.vacuumCleaner, {
                POWER: bool(true),
                RUN_MODE: enumeration(VACUUM_RUN_MODES, 1),
                MODE: enumeration(VACUUM_MODES, 3),
                STATE: enumeration(VACUUM_STATES, 1),
                PAUSE: bool(false),
                HOME: bool(false),
            });
            const [endpoint] = endpointsOf(mounted);
            expect(endpoint.state.rvcRunMode.supportedModes.map((mode: any) => mode.mode)).to.deep.equal([0, 1, 2]);
            expect(endpoint.state.rvcRunMode.currentMode).to.equal(1);
            expect(endpoint.state.rvcCleanMode.supportedModes.map((mode: any) => mode.label)).to.deep.equal(
                VACUUM_MODES,
            );
            expect(endpoint.state.rvcCleanMode.currentMode).to.equal(3);
            expect(endpoint.state.rvcOperationalState.operationalState).to.equal(
                RvcOperationalState.OperationalState.Running,
            );
        });

        it('tags every clean mode as Vacuum so the cluster stays conformant', async () => {
            const mounted = await mount(Types.vacuumCleaner, {
                POWER: bool(false),
                MODE: enumeration(VACUUM_MODES, 0),
            });
            const [endpoint] = endpointsOf(mounted);
            const tagsOf = (label: string): number[] =>
                endpoint.state.rvcCleanMode.supportedModes
                    .find((mode: any) => mode.label === label)
                    .modeTags.map((tag: any) => tag.value);
            expect(tagsOf('NORMAL')).to.deep.equal([RvcCleanMode.ModeTag.Vacuum]);
            expect(tagsOf('ECO')).to.deep.equal([RvcCleanMode.ModeTag.Vacuum, ModeBase.ModeTag.LowEnergy]);
        });

        it('does not add RvcCleanMode for a device that offers a single mode', async () => {
            const mounted = await mount(Types.vacuumCleaner, {
                POWER: bool(false),
                MODE: enumeration(['AUTO'], 0),
            });
            const [endpoint] = endpointsOf(mounted);
            // The cluster constrains supportedModes to 2 to 255 entries
            expect(endpoint.behaviors.has('rvcCleanMode')).to.equal(false);
        });

        it('offers a repeated ioBroker mode name once, because a write could only ever reach the first', async () => {
            const mounted = await mount(Types.vacuumCleaner, {
                POWER: bool(false),
                MODE: enumeration(['AUTO', 'AUTO', 'TURBO'], 0),
            });
            const [endpoint] = endpointsOf(mounted);
            expect(endpoint.state.rvcCleanMode.supportedModes.map((mode: any) => mode.label)).to.deep.equal([
                'AUTO',
                'TURBO',
            ]);
        });

        it('keeps two mode names apart that only collide once cropped', async () => {
            const shared = 'M'.repeat(64);
            const mounted = await mount(Types.vacuumCleaner, {
                POWER: bool(false),
                MODE: enumeration([`${shared}A`, `${shared}B`], 0),
            });
            const [endpoint] = endpointsOf(mounted);
            const labels = endpoint.state.rvcCleanMode.supportedModes.map((mode: any) => mode.label);
            expect(new Set(labels).size, 'Matter rejects a duplicate label').to.equal(2);
            expect(Math.max(...labels.map((label: string) => label.length))).to.be.at.most(64);
        });

        it('caps the advertised modes at the 255 the cluster holds', async () => {
            const mounted = await mount(Types.vacuumCleaner, {
                POWER: bool(false),
                MODE: enumeration(
                    Array.from({ length: 300 }, (_, index) => `MODE_${index}`),
                    0,
                ),
            });
            const [endpoint] = endpointsOf(mounted);
            expect(endpoint.state.rvcCleanMode.supportedModes).to.have.lengthOf(255);
        });

        it('lets a power change decide the run mode even while RUN_MODE disagrees', async () => {
            const mounted = await mount(Types.vacuumCleaner, {
                POWER: bool(true),
                RUN_MODE: enumeration(VACUUM_RUN_MODES, 1),
            });
            const [endpoint] = endpointsOf(mounted);
            expect(endpoint.state.rvcRunMode.currentMode).to.equal(1);

            // RUN_MODE still says CLEANING, but the robot was just switched off
            await mounted.adapter.pushValue('POWER', false);
            expect(endpoint.state.rvcRunMode.currentMode).to.equal(0);
            expect(endpoint.state.rvcOperationalState.operationalState).to.equal(
                RvcOperationalState.OperationalState.Docked,
            );

            // Switching it on again has to leave it doing something
            await mounted.adapter.pushValue('POWER', true);
            expect(endpoint.state.rvcRunMode.currentMode).to.equal(1);
        });

        it('switches on into cleaning when RUN_MODE still says idle', async () => {
            const mounted = await mount(Types.vacuumCleaner, {
                POWER: bool(false),
                RUN_MODE: enumeration(VACUUM_RUN_MODES, 0),
            });
            const [endpoint] = endpointsOf(mounted);
            await mounted.adapter.pushValue('POWER', true);
            expect(endpoint.state.rvcRunMode.currentMode).to.equal(1);
        });

        it('starts in Error with the error attribute that explains it', async () => {
            const mounted = await mount(Types.vacuumCleaner, {
                POWER: bool(true),
                ERROR: { type: 'string', val: 'Stuck' },
            });
            const [endpoint] = endpointsOf(mounted);
            expect(endpoint.state.rvcOperationalState.operationalState).to.equal(
                RvcOperationalState.OperationalState.Error,
            );
            expect(endpoint.state.rvcOperationalState.operationalError.errorStateId).to.equal(
                RvcOperationalState.ErrorState.UnableToCompleteOperation,
            );
        });

        it('crops a mode name to the 64 characters a Matter label holds', async () => {
            const long = 'M'.repeat(80);
            const mounted = await mount(Types.vacuumCleaner, {
                POWER: bool(false),
                MODE: enumeration([long, 'TURBO'], 0),
            });
            const [endpoint] = endpointsOf(mounted);
            expect(endpoint.state.rvcCleanMode.supportedModes[0].label).to.equal('M'.repeat(64));
        });

        it('drops the Mapping run mode when the device does not offer it', async () => {
            const mounted = await mount(Types.vacuumCleaner, {
                POWER: bool(false),
                RUN_MODE: enumeration(['IDLE', 'CLEANING'], 0),
            });
            const [endpoint] = endpointsOf(mounted);
            expect(endpoint.state.rvcRunMode.supportedModes.map((mode: any) => mode.mode)).to.deep.equal([0, 1]);
        });

        it('follows an ioBroker run mode change into the cluster', async () => {
            const mounted = await mount(Types.vacuumCleaner, {
                POWER: bool(false),
                RUN_MODE: enumeration(VACUUM_RUN_MODES, 0),
                STATE: enumeration(VACUUM_STATES, 0),
            });
            const [endpoint] = endpointsOf(mounted);
            await mounted.adapter.pushValue('RUN_MODE', 2);
            expect(endpoint.state.rvcRunMode.currentMode).to.equal(2);
            await mounted.adapter.pushValue('STATE', 1);
            expect(endpoint.state.rvcOperationalState.operationalState).to.equal(
                RvcOperationalState.OperationalState.Running,
            );
        });

        it('writes a controller run mode change back to RUN_MODE and POWER', async () => {
            const mounted = await mount(Types.vacuumCleaner, {
                POWER: bool(false),
                RUN_MODE: enumeration(VACUUM_RUN_MODES, 0),
            });
            const [endpoint] = endpointsOf(mounted);
            const response = await invoke(endpoint, 'rvcRunMode', 'changeToMode', { newMode: 1 });
            expect(response.status).to.equal(ModeBase.ModeChangeStatus.Success);
            expect(mounted.device.getPropertyValue(PropertyType.RunMode)).to.equal('CLEANING');
            expect(mounted.device.getPropertyValue(PropertyType.Power)).to.equal(true);
        });

        it('writes a controller clean mode change back to MODE', async () => {
            const mounted = await mount(Types.vacuumCleaner, {
                POWER: bool(false),
                MODE: enumeration(VACUUM_MODES, 0),
            });
            const [endpoint] = endpointsOf(mounted);
            await invoke(endpoint, 'rvcCleanMode', 'changeToMode', { newMode: 4 });
            expect(mounted.device.getPropertyValue(PropertyType.Mode)).to.equal('EXPRESS');
        });

        it('turns pause, resume and go home into the ioBroker button states', async () => {
            const mounted = await mount(Types.vacuumCleaner, {
                POWER: bool(true),
                PAUSE: bool(false),
                HOME: bool(false),
            });
            const [endpoint] = endpointsOf(mounted);
            expect(endpoint.state.rvcOperationalState.operationalState).to.equal(
                RvcOperationalState.OperationalState.Running,
            );

            const paused = await invoke(endpoint, 'rvcOperationalState', 'pause');
            expect(paused.commandResponseState.errorStateId).to.equal(RvcOperationalState.ErrorState.NoError);
            expect(await mounted.adapter.getForeignStateAsync(mounted.adapter.idOf('PAUSE'))).to.include({ val: true });
            // Without a STATE state the cluster has to report the result itself, or resume is refused afterwards
            expect(endpoint.state.rvcOperationalState.operationalState).to.equal(
                RvcOperationalState.OperationalState.Paused,
            );

            const resumed = await invoke(endpoint, 'rvcOperationalState', 'resume');
            expect(resumed.commandResponseState.errorStateId).to.equal(RvcOperationalState.ErrorState.NoError);
            expect(await mounted.adapter.getForeignStateAsync(mounted.adapter.idOf('PAUSE'))).to.include({
                val: false,
            });

            await invoke(endpoint, 'rvcOperationalState', 'goHome');
            expect(await mounted.adapter.getForeignStateAsync(mounted.adapter.idOf('HOME'))).to.include({ val: true });
            expect(endpoint.state.rvcOperationalState.operationalState).to.equal(
                RvcOperationalState.OperationalState.Docked,
            );
        });

        it('leaves the operational state to STATE when the device reports one', async () => {
            const mounted = await mount(Types.vacuumCleaner, {
                POWER: bool(true),
                RUN_MODE: enumeration(VACUUM_RUN_MODES, 1),
                STATE: enumeration(VACUUM_STATES, 1),
                PAUSE: bool(false),
                HOME: bool(false),
            });
            const [endpoint] = endpointsOf(mounted);
            expect(endpoint.state.rvcOperationalState.operationalState).to.equal(
                RvcOperationalState.OperationalState.Running,
            );

            // A device that reports its own state must not have it guessed for it from a command or a run mode
            await invoke(endpoint, 'rvcOperationalState', 'pause');
            expect(endpoint.state.rvcOperationalState.operationalState).to.equal(
                RvcOperationalState.OperationalState.Running,
            );
            await invoke(endpoint, 'rvcRunMode', 'changeToMode', { newMode: 0 });
            expect(endpoint.state.rvcOperationalState.operationalState).to.equal(
                RvcOperationalState.OperationalState.Running,
            );

            await mounted.adapter.pushValue('STATE', 2);
            expect(endpoint.state.rvcOperationalState.operationalState).to.equal(
                RvcOperationalState.OperationalState.Paused,
            );
            await mounted.adapter.pushValue('STATE', 0);
            expect(endpoint.state.rvcOperationalState.operationalState).to.equal(
                RvcOperationalState.OperationalState.Docked,
            );
        });

        it('reports an idle ioBroker run mode as the idle Matter mode', async () => {
            const mounted = await mount(Types.vacuumCleaner, {
                POWER: bool(false),
                RUN_MODE: enumeration(VACUUM_RUN_MODES, 0),
            });
            const [endpoint] = endpointsOf(mounted);
            expect(endpoint.state.rvcRunMode.currentMode).to.equal(0);
            expect(endpoint.state.rvcOperationalState.operationalState).to.equal(
                RvcOperationalState.OperationalState.Docked,
            );
        });

        it('falls back to the first clean mode when MODE holds a value the device does not list', async () => {
            const mounted = await mount(Types.vacuumCleaner, {
                POWER: bool(false),
                MODE: { ...enumeration(VACUUM_MODES, 0), val: 99 },
            });
            const [endpoint] = endpointsOf(mounted);
            expect(endpoint.state.rvcCleanMode.currentMode).to.equal(0);
        });

        it('carries every controller run mode into the ioBroker states', async () => {
            const mounted = await mount(Types.vacuumCleaner, {
                POWER: bool(false),
                RUN_MODE: enumeration(VACUUM_RUN_MODES, 0),
            });
            const [endpoint] = endpointsOf(mounted);

            await invoke(endpoint, 'rvcRunMode', 'changeToMode', { newMode: 2 });
            expect(mounted.device.getPropertyValue(PropertyType.RunMode)).to.equal('MAPPING');
            expect(mounted.device.getPropertyValue(PropertyType.Power)).to.equal(true);

            await invoke(endpoint, 'rvcRunMode', 'changeToMode', { newMode: 0 });
            expect(mounted.device.getPropertyValue(PropertyType.RunMode)).to.equal('IDLE');
            expect(mounted.device.getPropertyValue(PropertyType.Power)).to.equal(false);
        });

        it('follows an ioBroker clean mode change into the cluster', async () => {
            const mounted = await mount(Types.vacuumCleaner, {
                POWER: bool(false),
                MODE: enumeration(VACUUM_MODES, 0),
            });
            const [endpoint] = endpointsOf(mounted);
            await mounted.adapter.pushValue('MODE', 4);
            expect(endpoint.state.rvcCleanMode.currentMode).to.equal(4);
        });

        it('does not write an unsupported mode number back to ioBroker', async () => {
            const mounted = await mount(Types.vacuumCleaner, {
                POWER: bool(false),
                RUN_MODE: enumeration(VACUUM_RUN_MODES, 0),
                MODE: enumeration(VACUUM_MODES, 0),
            });
            const [endpoint] = endpointsOf(mounted);

            const runMode = await invoke(endpoint, 'rvcRunMode', 'changeToMode', { newMode: 42 });
            expect(runMode.status).to.equal(ModeBase.ModeChangeStatus.UnsupportedMode);
            expect(mounted.device.getPropertyValue(PropertyType.RunMode)).to.equal('IDLE');

            const cleanMode = await invoke(endpoint, 'rvcCleanMode', 'changeToMode', { newMode: 42 });
            expect(cleanMode.status).to.equal(ModeBase.ModeChangeStatus.UnsupportedMode);
            expect(mounted.device.getPropertyValue(PropertyType.Mode)).to.equal('AUTO');
        });

        it('refuses go home while the robot is already docked', async () => {
            const mounted = await mount(Types.vacuumCleaner, { POWER: bool(false), HOME: bool(false) });
            const [endpoint] = endpointsOf(mounted);
            const response = await invoke(endpoint, 'rvcOperationalState', 'goHome');
            expect(response.commandResponseState.errorStateId).to.equal(
                RvcOperationalState.ErrorState.CommandInvalidInState,
            );
            expect(await mounted.adapter.getForeignStateAsync(mounted.adapter.idOf('HOME'))).to.include({ val: false });
        });

        it('raises and clears the operational error from the ioBroker ERROR state', async () => {
            const mounted = await mount(Types.vacuumCleaner, {
                POWER: bool(true),
                STATE: enumeration(VACUUM_STATES, 1),
                // The detector types ERROR as a string, so an empty text is what "no error" looks like
                ERROR: { type: 'string', val: '' },
            });
            const [endpoint] = endpointsOf(mounted);
            await mounted.adapter.pushValue('ERROR', 'Stuck');
            expect(endpoint.state.rvcOperationalState.operationalState).to.equal(
                RvcOperationalState.OperationalState.Error,
            );
            await mounted.adapter.pushValue('ERROR', '');
            expect(endpoint.state.rvcOperationalState.operationalError.errorStateId).to.equal(
                RvcOperationalState.ErrorState.NoError,
            );
            expect(endpoint.state.rvcOperationalState.operationalState).to.equal(
                RvcOperationalState.OperationalState.Running,
            );
        });
    });

    describe('factory wiring', () => {
        /**
         * The admin UI and the factory live in separate TypeScript projects that must not import each other, so the
         * UI list is read as data. A type offered by the UI without a factory case would let the user pick a device
         * that then silently does nothing.
         */
        function supportedDevicesFromUi(): string[] {
            const source = readFileSync(
                join(__dirname, '..', 'src-admin', 'src', 'components', 'DeviceDialog.tsx'),
                'utf8',
            );
            const list = /export const SUPPORTED_DEVICES: Types\[\] = \[([^\]]*)\]/.exec(source);
            expect(list, 'SUPPORTED_DEVICES not found in DeviceDialog.tsx').to.not.equal(null);
            return Array.from(list![1].matchAll(/Types\.(\w+)/g)).map(match => match[1]);
        }

        it('has a factory case for every device type the admin UI offers', async () => {
            const uiTypes = supportedDevicesFromUi();
            expect(uiTypes.length).to.be.greaterThan(20);

            const unmapped = new Array<string>();
            for (const uiType of uiTypes) {
                const type = Types[uiType as keyof typeof Types];
                expect(type, `unknown Types member ${uiType}`).to.not.equal(undefined);
                // Only the switch statement is under test here, so a stub device is enough: reaching the
                // constructor (even if it throws) already proves the type is not falling through to `default`.
                const stub = { deviceType: type, init: async (): Promise<void> => {} };
                let mapped: boolean;
                try {
                    mapped = (await matterDeviceFabric(stub as unknown as GenericDevice, 'x', 'x')) !== null;
                } catch {
                    mapped = true;
                }
                if (!mapped) {
                    unmapped.push(uiType);
                }
            }
            expect(unmapped, 'UI offers device types without a to-matter converter').to.deep.equal([]);
        });
    });
});
