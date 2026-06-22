import { expect } from 'chai';
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
        expect(state.getRawEnumValue('Off')).to.equal(0);
        expect(state.getRawEnumValue('On')).to.equal(1);
        expect(state.getRawEnumValue('Toggle')).to.equal(2);
    });

    it('coerces a numeric string to a number when the state is numeric', async function () {
        const state = await createState(ValueType.Enum, numberEnumCommon);
        expect(state.getRawEnumValue('1')).to.equal(1);
    });

    it('passes null through unchanged (nullable Matter attribute)', async function () {
        const state = await createState(ValueType.Enum, numberEnumCommon);
        expect(state.getRawEnumValue(null)).to.equal(null);
    });

    it('passes an already-numeric value through unchanged', async function () {
        const state = await createState(ValueType.Enum, numberEnumCommon);
        expect(state.getRawEnumValue(0)).to.equal(0);
        expect(state.getRawEnumValue(2)).to.equal(2);
    });

    it('passes an unknown non-numeric string through unchanged', async function () {
        const state = await createState(ValueType.Enum, numberEnumCommon);
        expect(state.getRawEnumValue('unknown')).to.equal('unknown');
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
        expect(state.getRawEnumValue('Open')).to.equal('open');
        expect(state.getRawEnumValue('Closed')).to.equal('closed');
    });

    it('is a no-op for non-enum states', async function () {
        const state = await createState(ValueType.Number, {
            name: 'test',
            type: 'number',
            role: 'state',
            read: true,
            write: true,
        });
        expect(state.getRawEnumValue(42)).to.equal(42);
        expect(state.getRawEnumValue('Off')).to.equal('Off');
        expect(state.getRawEnumValue(null)).to.equal(null);
    });
});
