import { deepStrictEqual, strictEqual } from 'node:assert';
import { type DetectorState, StateType, Types } from '@iobroker/type-detector';
import { SubscribeManager } from '../src/lib/SubscribeManager';
import { type DeviceStateObject, PropertyType, ValueType } from '../src/lib/devices/DeviceStateObject';
import { type DetectedDevice, GenericDevice, StateAccessType } from '../src/lib/devices/GenericDevice';
import { Electricity } from '../src/lib/devices/Electricity';

const STATE_ID = '0_userdata.0.current';

const milliConversion = (value: number, toDeviceUnit: boolean): number => (toDeviceUnit ? value * 0.001 : value * 1000);

interface MockAdapter {
    adapter: ioBroker.Adapter;
    written: Array<{ id: string; value: ioBroker.StateValue; ack: boolean }>;
    extended: Array<Partial<ioBroker.Object>>;
}

function makeAdapter(common: ioBroker.StateCommon, value: number): MockAdapter {
    const written = new Array<{ id: string; value: ioBroker.StateValue; ack: boolean }>();
    const extended = new Array<Partial<ioBroker.Object>>();
    const adapter = {
        namespace: 'matter.0',
        log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
        getForeignObjectAsync: async () => ({ _id: STATE_ID, type: 'state', common, native: {} }) as ioBroker.Object,
        getForeignStateAsync: async () => ({ val: value, ack: true, ts: Date.now(), lc: Date.now(), from: 'test' }),
        setForeignStateAsync: async (id: string, val: ioBroker.StateValue, ack: boolean) => {
            written.push({ id, value: val, ack });
        },
        extendObjectAsync: async (_id: string, obj: Partial<ioBroker.Object>) => {
            extended.push(obj);
        },
        subscribeForeignStatesAsync: async () => {},
        unsubscribeForeignStatesAsync: async () => {},
    } as unknown as ioBroker.Adapter;
    SubscribeManager.setAdapter(adapter);
    return { adapter, written, extended };
}

/** Minimal device exposing one numeric reading whose device unit may differ from the object unit. */
class UnitTestDevice extends GenericDevice {
    currentState?: DeviceStateObject<number>;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, deviceUnit: string) {
        super(detectedDevice, adapter, {
            uuid: 'test',
            enabled: true,
            name: 'test',
            oid: STATE_ID,
            type: Types.electricity,
            auto: false,
            noComposed: true,
        });

        this._construction.push(
            this.addDeviceStates([
                {
                    name: 'CURRENT',
                    valueType: ValueType.Number,
                    unit: deviceUnit,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.Current,
                    callback: state => (this.currentState = state),
                    unitConversionMap: { mA: milliConversion },
                },
            ]),
        );
    }
}

function detectedDevice(isIoBrokerDevice = true): DetectedDevice {
    const state: DetectorState = {
        name: 'CURRENT',
        id: STATE_ID,
        type: StateType.Number,
        defaultRole: 'value.current',
        defaultUnit: 'mA',
        write: true,
        read: true,
    };
    return { type: Types.electricity, states: [state], isIoBrokerDevice };
}

function objectCommon(unit: string): ioBroker.StateCommon {
    return {
        name: 'CURRENT',
        type: 'number',
        role: 'value.current',
        read: true,
        write: true,
        unit,
        min: 0,
        max: 16000,
    };
}

async function createDevice(
    objectUnit: string,
    deviceUnit: string,
    isIoBrokerDevice = true,
): Promise<{ state: DeviceStateObject<number>; device: UnitTestDevice } & Omit<MockAdapter, 'adapter'>> {
    const mock = makeAdapter(objectCommon(objectUnit), 0);
    const device = new UnitTestDevice(detectedDevice(isIoBrokerDevice), mock.adapter, deviceUnit);
    await device.init();
    if (!device.currentState) {
        throw new Error('CURRENT state was not registered');
    }
    return { state: device.currentState, device, written: mock.written, extended: mock.extended };
}

describe('Device unit conversion', function () {
    afterEach(function () {
        SubscribeManager.subscribes.clear();
    });

    it('converts an object value into the declared device unit when reading', async function () {
        const { state } = await createDevice('mA', 'A');
        await state.updateState({ val: 1500, ack: true, ts: Date.now(), lc: Date.now(), from: 'test' });
        strictEqual(state.value, 1.5);
    });

    it('converts a value in the declared device unit back into the object unit when writing', async function () {
        const { state, written } = await createDevice('mA', 'A');
        await state.setValue(0.5);
        deepStrictEqual(written, [{ id: STATE_ID, value: 500, ack: false }]);
    });

    it('reports min/max in the declared device unit', async function () {
        const { state } = await createDevice('mA', 'A');
        deepStrictEqual(state.getMinMax(), { min: 0, max: 16, step: undefined });
    });

    it('creates the ioBroker object of a Matter device with the declared device unit', async function () {
        const { extended } = await createDevice('mA', 'A', false);
        deepStrictEqual(
            extended.map(obj => obj.common?.unit),
            ['A'],
        );
    });

    it('surfaces the device unit to the Device Manager', async function () {
        const { device } = await createDevice('mA', 'A');
        const states = device.getStates();
        deepStrictEqual(
            Object.values(states).map(entry => (entry as { unit?: string }).unit),
            ['A'],
        );
    });

    it('reads a mA object as amperes, the unit ElectricityDataDevice declares for CURRENT', async function () {
        // The ioBroker current state is amperes, so the detector's mA default has to be converted away
        const mock = makeAdapter(objectCommon('mA'), 1500);
        const device = new Electricity(detectedDevice(), mock.adapter);
        await device.init();

        strictEqual(device.getCurrent(), 1.5);
    });
});
