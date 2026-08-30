import { rejects, strictEqual } from 'node:assert';
import { DeviceStateObject, PropertyType, ValueType } from '../src/lib/devices/DeviceStateObject';

function makeAdapter(common: ioBroker.StateCommon): ioBroker.Adapter {
    return {
        log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
        getForeignObjectAsync: async () => ({ _id: 'test.0.state', type: 'state', common }) as ioBroker.Object,
        setForeignStateAsync: async () => {},
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

describe('DeviceStateObject.setValue', function () {
    it('does not cache a percent value rejected for being non-finite', async function () {
        const state = await createState(ValueType.NumberPercent, {
            name: 'test',
            type: 'number',
            role: 'state',
            read: true,
            write: true,
            min: 10,
            max: 20,
        });
        await state.setValue(50);
        strictEqual(state.value, 50);

        await rejects(() => state.setValue('abc'));
        strictEqual(state.value, 50);
    });

    it('does not cache a percent value rejected for being out of the real min/max range', async function () {
        const state = await createState(ValueType.NumberPercent, {
            name: 'test',
            type: 'number',
            role: 'state',
            read: true,
            write: true,
            min: 10,
            max: 20,
        });
        await state.setValue(50);
        strictEqual(state.value, 50);

        // realMin/realMax are 10/20: 200% maps far outside that range
        await rejects(() => state.setValue(200));
        strictEqual(state.value, 50);
    });

    it('does not cache a number value rejected for being out of min/max range', async function () {
        const state = await createState(ValueType.Number, {
            name: 'test',
            type: 'number',
            role: 'state',
            read: true,
            write: true,
            min: 0,
            max: 10,
        });
        await state.setValue(5);
        strictEqual(state.value, 5);

        await rejects(() => state.setValue(50));
        strictEqual(state.value, 5);
    });

    it('does not cache a string-typed write rejected for being out of min/max range', async function () {
        // typeof '5' !== 'number', so this takes the mismatch-repair branch, not the type-matching tail.
        const state = await createState(ValueType.Number, {
            name: 'test',
            type: 'number',
            role: 'state',
            read: true,
            write: true,
            min: 0,
            max: 10,
        });
        await state.setValue('5');
        strictEqual(state.value, '5');

        await rejects(() => state.setValue('50'));
        strictEqual(state.value, '5');
    });
});

describe('DeviceStateObject percent-mapped unit/range consistency', function () {
    it('pairs getRawUnit() with getRawMinMax(), not the fixed 0-100 percent scale', async function () {
        // A dimmer backed by a 0-254 object with its own unit: the Device Manager form (GenericDevice.getStates())
        // binds unit and min/max together onto the raw oid value, so they must describe the same number space.
        const state = await createState(ValueType.NumberPercent, {
            name: 'test',
            type: 'number',
            role: 'state',
            read: true,
            write: true,
            unit: 'lvl',
            min: 0,
            max: 254,
        });
        strictEqual(state.getRawUnit(), 'lvl');
        strictEqual(state.getUnit(), '%');
        strictEqual(state.getRawMinMax()?.min, 0);
        strictEqual(state.getRawMinMax()?.max, 254);
        strictEqual(state.getMinMax()?.min, 0);
        strictEqual(state.getMinMax()?.max, 100);
    });
});
