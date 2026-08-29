import { strictEqual, deepStrictEqual, rejects } from 'node:assert';
import { Types } from '@iobroker/type-detector';
import { SetpointKind } from '../src/lib/devices/ClimateControlDevice';
import { Thermostat } from '../src/lib/devices/Thermostat';
import { SubscribeManager } from '../src/lib/SubscribeManager';

const SET = 'test.0.set';
const SET_HEATING = 'test.0.set_heating';
const SET_COOLING = 'test.0.set_cooling';
const MODE = 'test.0.mode';

const MODE_STATES = { 0: 'HEAT', 1: 'COOL', 2: 'AUTO' };

class Adapter {
    readonly log = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
    readonly namespace = 'matter.0';
    readonly values = new Map<string, ioBroker.StateValue>();

    async getForeignObjectAsync(id: string): Promise<ioBroker.Object> {
        const common: ioBroker.StateCommon =
            id === MODE
                ? { name: id, type: 'number', role: 'level.mode.thermostat', read: true, write: true, states: MODE_STATES }
                : { name: id, type: 'number', role: 'level.temperature', read: true, write: true, min: 5, max: 35, unit: '°C' };
        return { _id: id, type: 'state', common, native: {} } as ioBroker.Object;
    }

    async getForeignStateAsync(id: string): Promise<ioBroker.State> {
        return { val: this.values.get(id) ?? 0, ack: true, ts: Date.now(), lc: Date.now(), from: 'test' };
    }

    async setForeignStateAsync(id: string, value: ioBroker.StateValue): Promise<void> {
        this.values.set(id, value);
    }

    async subscribeForeignStatesAsync(): Promise<void> {}

    async unsubscribeForeignStatesAsync(): Promise<void> {}

    extendObject(): void {}
}

/** Builds a thermostat over exactly the given detector states, with the mode state reporting `currentMode`. */
async function makeThermostat(
    stateIds: { name: string; id: string }[],
    currentMode?: string,
): Promise<{ device: Thermostat; adapter: Adapter }> {
    const adapter = new Adapter();
    if (currentMode !== undefined) {
        const key = Object.entries(MODE_STATES).find(([, label]) => label === currentMode)?.[0];
        adapter.values.set(MODE, Number(key));
    }
    SubscribeManager.setAdapter(adapter as unknown as ioBroker.Adapter);

    const device = new Thermostat(
        {
            type: Types.thermostat,
            isIoBrokerDevice: true,
            states: stateIds.map(state => ({ ...state, write: true, read: true, defaultRole: 'level.temperature' })),
        } as never,
        adapter as unknown as ioBroker.Adapter,
        { enabled: true } as never,
    );
    await device.init();
    return { device, adapter };
}

describe('ClimateControlDevice setpoint resolution', function () {
    it('serves both kinds from a single untyped setpoint when nothing says which it is', async function () {
        const { device } = await makeThermostat([{ name: 'SET', id: SET }]);

        deepStrictEqual(device.supportedSetpointKinds(), []);
        strictEqual(device.hasSetpoint(SetpointKind.Heating), true);
        strictEqual(device.hasSetpoint(SetpointKind.Cooling), true);
    });

    it('lets the current mode decide which kind a single untyped setpoint stands for', async function () {
        const heating = await makeThermostat([{ name: 'SET', id: SET }, { name: 'MODE', id: MODE }], 'HEAT');
        strictEqual(heating.device.hasSetpoint(SetpointKind.Heating), true);
        strictEqual(heating.device.hasSetpoint(SetpointKind.Cooling), false);

        const cooling = await makeThermostat([{ name: 'SET', id: SET }, { name: 'MODE', id: MODE }], 'COOL');
        strictEqual(cooling.device.hasSetpoint(SetpointKind.Heating), false);
        strictEqual(cooling.device.hasSetpoint(SetpointKind.Cooling), true);
    });

    it('serves every supported kind from a single untyped setpoint while the mode selects neither', async function () {
        const { device } = await makeThermostat([{ name: 'SET', id: SET }, { name: 'MODE', id: MODE }], 'AUTO');

        deepStrictEqual(device.supportedSetpointKinds(), [SetpointKind.Heating, SetpointKind.Cooling]);
        strictEqual(device.hasSetpoint(SetpointKind.Heating), true);
        strictEqual(device.hasSetpoint(SetpointKind.Cooling), true);
    });

    it('offers only the kind a lone dedicated setpoint names', async function () {
        const { device } = await makeThermostat([{ name: 'SET_HEATING', id: SET_HEATING }]);

        deepStrictEqual(device.supportedSetpointKinds(), [SetpointKind.Heating]);
        strictEqual(device.hasSetpoint(SetpointKind.Heating), true);
        strictEqual(device.hasSetpoint(SetpointKind.Cooling), false);
        await rejects(() => device.setSetpoint(SetpointKind.Cooling, 20));
    });

    it('routes each kind to its own dedicated setpoint', async function () {
        const { device, adapter } = await makeThermostat([
            { name: 'SET_HEATING', id: SET_HEATING },
            { name: 'SET_COOLING', id: SET_COOLING },
        ]);

        await device.setSetpoint(SetpointKind.Heating, 21);
        await device.setSetpoint(SetpointKind.Cooling, 26);

        strictEqual(adapter.values.get(SET_HEATING), 21);
        strictEqual(adapter.values.get(SET_COOLING), 26);
    });

    it('leaves the untyped setpoint alone when both dedicated setpoints exist', async function () {
        const { device, adapter } = await makeThermostat([
            { name: 'SET', id: SET },
            { name: 'SET_HEATING', id: SET_HEATING },
            { name: 'SET_COOLING', id: SET_COOLING },
        ]);

        await device.setSetpoint(SetpointKind.Heating, 21);
        await device.setSetpoint(SetpointKind.Cooling, 26);

        strictEqual(adapter.values.get(SET_HEATING), 21);
        strictEqual(adapter.values.get(SET_COOLING), 26);
        strictEqual(adapter.values.has(SET), false);
    });
});
