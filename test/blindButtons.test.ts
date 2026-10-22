import { expect } from 'chai';
import { StateType, Types } from '@iobroker/type-detector';
import DeviceFactory from '../src/lib/DeviceFactory';
import type { BlindButtons } from '../src/lib/devices/BlindButtons';
import type { DetectedDevice, DeviceOptions } from '../src/lib/devices/GenericDevice';
import { SubscribeManager } from '../src/lib/SubscribeManager';

const BUTTONS = ['OPEN', 'CLOSE', 'STOP'];

/** ioBroker adapter serving the given states: buttons are booleans, everything else a percent number. */
class MockAdapter {
    readonly namespace = 'matter.0';
    readonly log = {
        silly: (): void => {},
        debug: (): void => {},
        info: (): void => {},
        warn: (): void => {},
        error: (): void => {},
    };
    readonly #prefix: string;
    readonly #values: Record<string, number>;

    constructor(prefix: string, values: Record<string, number>) {
        this.#prefix = prefix;
        this.#values = values;
    }

    #nameOf(id: string): string | undefined {
        const name = id.substring(this.#prefix.length + 1);
        return id.startsWith(`${this.#prefix}.`) && (BUTTONS.includes(name) || name in this.#values) ? name : undefined;
    }

    async getForeignObjectAsync(id: string): Promise<ioBroker.Object | null> {
        const name = this.#nameOf(id);
        if (name === undefined) {
            return null;
        }
        return {
            _id: id,
            type: 'state',
            common: {
                name: id,
                type: BUTTONS.includes(name) ? 'boolean' : 'number',
                role: 'state',
                read: true,
                write: true,
                ...(BUTTONS.includes(name) ? {} : { min: 0, max: 100, unit: '%' }),
            },
            native: {},
        } as ioBroker.Object;
    }

    async getForeignStateAsync(id: string): Promise<ioBroker.State | null> {
        const name = this.#nameOf(id);
        if (name === undefined) {
            return null;
        }
        return {
            val: BUTTONS.includes(name) ? false : this.#values[name],
            ack: true,
            ts: Date.now(),
        } as ioBroker.State;
    }

    async setForeignStateAsync(): Promise<void> {}
    async subscribeForeignStatesAsync(): Promise<void> {}
    async unsubscribeForeignStatesAsync(): Promise<void> {}
    subscribeStates(): void {}
    unsubscribeStates(): void {}
    async extendObjectAsync(): Promise<void> {}
    extendObject(): void {}
}

let instanceCounter = 0;

async function createBlind(values: Record<string, number>): Promise<BlindButtons> {
    const index = ++instanceCounter;
    const prefix = `0_userdata.0.blindButtons${index}`;
    const adapter = new MockAdapter(prefix, values);
    SubscribeManager.setAdapter(adapter as unknown as ioBroker.Adapter);

    const detectedDevice: DetectedDevice = {
        type: Types.blindButtons,
        isIoBrokerDevice: true,
        states: [...BUTTONS, ...Object.keys(values)].map(name => ({
            name,
            id: `${prefix}.${name}`,
            type: BUTTONS.includes(name) ? StateType.Boolean : StateType.Number,
            read: true,
            write: true,
        })),
    };
    const options: DeviceOptions = {
        uuid: `blind-buttons-${index}`,
        enabled: true,
        name: `Blind ${index}`,
        oid: prefix,
        type: Types.blindButtons,
        auto: false,
        noComposed: false,
    };
    const device = await DeviceFactory(detectedDevice, adapter as unknown as ioBroker.Adapter, options, false);
    await device.init();
    return device as BlindButtons;
}

describe('BlindButtons tilt getters', () => {
    afterEach(() => {
        SubscribeManager.subscribes.clear();
    });

    describe('only TILT_SET', () => {
        it('getTiltLevel falls back to the set value', async () => {
            const device = await createBlind({ TILT_SET: 30 });
            expect(device.getTiltLevel()).to.equal(30);
        });

        it('getTiltLevelActual throws because no actual state exists', async () => {
            const device = await createBlind({ TILT_SET: 30 });
            expect(() => device.getTiltLevelActual()).to.throw('Level state not found');
        });
    });

    describe('only TILT_ACTUAL', () => {
        it('getTiltLevel returns the actual value', async () => {
            const device = await createBlind({ TILT_ACTUAL: 70 });
            expect(device.getTiltLevel()).to.equal(70);
        });

        it('getTiltLevelActual returns the actual value', async () => {
            const device = await createBlind({ TILT_ACTUAL: 70 });
            expect(device.getTiltLevelActual()).to.equal(70);
        });
    });

    describe('TILT_SET and TILT_ACTUAL', () => {
        it('getTiltLevel prefers the actual value over the set value', async () => {
            const device = await createBlind({ TILT_SET: 30, TILT_ACTUAL: 70 });
            expect(device.getTiltLevel()).to.equal(70);
        });

        it('getTiltLevelActual returns the actual value, not the set value', async () => {
            const device = await createBlind({ TILT_SET: 30, TILT_ACTUAL: 70 });
            expect(device.getTiltLevelActual()).to.equal(70);
        });
    });

    describe('neither tilt state', () => {
        it('characterization: getTiltLevel throws', async () => {
            const device = await createBlind({});
            expect(() => device.getTiltLevel()).to.throw('Tilt state not found');
        });

        it('characterization: getTiltLevelActual throws', async () => {
            const device = await createBlind({});
            expect(() => device.getTiltLevelActual()).to.throw('Level state not found');
        });
    });
});
