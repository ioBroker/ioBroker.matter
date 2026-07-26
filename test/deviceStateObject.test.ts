import { strictEqual } from 'node:assert';
import { DeviceStateObject, PropertyType, ValueType } from '../src/lib/devices/DeviceStateObject';

function makeAdapter(common: ioBroker.StateCommon): ioBroker.Adapter {
    return {
        log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
        getForeignObjectAsync: async () => ({ _id: 'test.0.state', type: 'state', common }) as ioBroker.Object,
    } as unknown as ioBroker.Adapter;
}

async function createState(valueType: ValueType, common: ioBroker.StateCommon): Promise<DeviceStateObject<any>> {
    return DeviceStateObject.create<any>(
        makeAdapter(common),
        { name: 'test', id: 'test.0.state', isIoBrokerState: true },
        PropertyType.Custom,
        valueType,
        true,
    );
}

const numberEnumCommon: ioBroker.StateCommon = {
    name: 'test',
    type: 'number',
    role: 'state',
    read: true,
    write: true,
    states: { 0: 'Off', 1: 'On', 2: 'Toggle' },
};

describe('DeviceStateObject.getRawEnumValue', function () {
    it('maps an enum label back to its numeric key', async function () {
        const state = await createState(ValueType.Enum, numberEnumCommon);
        strictEqual(state.getRawEnumValue('Off'), 0);
        strictEqual(state.getRawEnumValue('On'), 1);
        strictEqual(state.getRawEnumValue('Toggle'), 2);
    });

    it('coerces a numeric string to a number when the state is numeric', async function () {
        const state = await createState(ValueType.Enum, numberEnumCommon);
        strictEqual(state.getRawEnumValue('1'), 1);
    });

    it('passes null through unchanged (nullable Matter attribute)', async function () {
        const state = await createState(ValueType.Enum, numberEnumCommon);
        strictEqual(state.getRawEnumValue(null), null);
    });

    it('passes an already-numeric value through unchanged', async function () {
        const state = await createState(ValueType.Enum, numberEnumCommon);
        strictEqual(state.getRawEnumValue(0), 0);
        strictEqual(state.getRawEnumValue(2), 2);
    });

    it('passes an unknown non-numeric string through unchanged', async function () {
        const state = await createState(ValueType.Enum, numberEnumCommon);
        strictEqual(state.getRawEnumValue('unknown'), 'unknown');
    });

    it('keeps string keys as strings for non-numeric enum states', async function () {
        const state = await createState(ValueType.Enum, {
            name: 'test',
            type: 'string',
            role: 'state',
            read: true,
            write: true,
            states: { open: 'Open', closed: 'Closed' },
        });
        strictEqual(state.getRawEnumValue('Open'), 'open');
        strictEqual(state.getRawEnumValue('Closed'), 'closed');
    });

    it('is a no-op for non-enum states', async function () {
        const state = await createState(ValueType.Number, {
            name: 'test',
            type: 'number',
            role: 'state',
            read: true,
            write: true,
        });
        strictEqual(state.getRawEnumValue(42), 42);
        strictEqual(state.getRawEnumValue('Off'), 'Off');
        strictEqual(state.getRawEnumValue(null), null);
    });
});
