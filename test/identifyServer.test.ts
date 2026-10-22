import { expect } from 'chai';
import {
    DeviceTypeId,
    type Duration,
    type Environment,
    Lifetime,
    LogLevel,
    Logger,
    ServerNode,
    Time,
    type Timer,
    VendorId,
} from '@matter/main';
import { Identify } from '@matter/main/clusters';
import { StateType, Types } from '@iobroker/type-detector';
import DeviceFactory from '../src/lib/DeviceFactory';
import type { DetectedDevice, DeviceOptions, GenericDevice } from '../src/lib/devices/GenericDevice';
import { SubscribeManager } from '../src/lib/SubscribeManager';
import matterDeviceFabric from '../src/matter/to-matter/matterFactory';
import { createMatterTestEnvironment } from './helpers/matterTestEnvironment';

/** Serves one boolean SET state and records every write to it. */
class LightAdapter {
    readonly namespace = 'matter.0';
    readonly infos = new Array<string>();
    readonly log = {
        silly: (): void => {},
        debug: (): void => {},
        info: (message: string): void => {
            this.infos.push(message);
        },
        warn: (): void => {},
        error: (message: string): void => console.error(message),
    };
    readonly writes = new Array<boolean>();
    failWrites = false;
    /** Delays each write, so a test can check that the caller waits for it. */
    writeDelayMs = 0;
    /** Delays for the next writes in call order, before {@link writeDelayMs} applies; lets a later write finish first. */
    readonly writeDelays = new Array<number>();
    readonly #id: string;
    #value: boolean;

    constructor(id: string, initialPower: boolean) {
        this.#id = id;
        this.#value = initialPower;
    }

    get power(): boolean {
        return this.#value;
    }

    /** A power change from outside the adapter, such as a wall switch, that reaches the device as a state change. */
    async switchFromOutside(value: boolean): Promise<void> {
        this.#value = value;
        await SubscribeManager.observer(this.#id, { val: value, ack: true, ts: Date.now() } as ioBroker.State);
    }

    async getForeignObjectAsync(id: string): Promise<ioBroker.Object | null> {
        if (id !== this.#id) {
            return null;
        }
        return {
            _id: id,
            type: 'state',
            common: { name: id, type: 'boolean', role: 'switch.light', read: true, write: true },
            native: {},
        } as ioBroker.Object;
    }

    async getForeignStateAsync(id: string): Promise<ioBroker.State | null> {
        return id === this.#id ? ({ val: this.#value, ack: true, ts: Date.now() } as ioBroker.State) : null;
    }

    async setForeignStateAsync(id: string, value: boolean): Promise<void> {
        if (id !== this.#id) {
            return;
        }
        if (this.failWrites) {
            throw new Error('write refused');
        }
        const delay = this.writeDelays.shift() ?? this.writeDelayMs;
        if (delay > 0) {
            await sleep(delay);
        }
        this.#value = value;
        this.writes.push(value);
    }

    async sendToGui(): Promise<void> {}
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

/** Name of the timer IoLightingIdentifyServer uses for effect steps. */
const EFFECT_TIMER = 'Identify effect';

/** A one-shot timer that fires only when the test calls {@link fire}. */
class ManualTimer implements Timer {
    utility = false;
    readonly systemId = undefined;
    readonly isPeriodic = false;
    isRunning = false;
    readonly #callback: Timer.Callback;

    constructor(
        readonly name: string,
        public interval: Duration,
        callback: Timer.Callback,
    ) {
        this.#callback = callback;
    }

    start(): Timer {
        this.isRunning = true;
        return this;
    }

    stop(): Timer {
        this.isRunning = false;
        return this;
    }

    fire(): void {
        this.isRunning = false;
        const lifetime = Lifetime(this.name);
        try {
            this.#callback(lifetime);
        } finally {
            lifetime[Symbol.dispose]();
        }
    }
}

/**
 * Replaces the effect step timers with {@link ManualTimer}s so a test steps through an effect without waiting. Every
 * other timer, including the periodic Identify timers, keeps real time because the node itself depends on them.
 */
class EffectClock extends Time {
    readonly effectTimers = new Array<ManualTimer>();
    readonly #real: Time;

    constructor(real: Time) {
        super();
        this.#real = real;
    }

    override getTimer(name: string, duration: Duration, callback: Timer.Callback): Timer {
        if (name !== EFFECT_TIMER) {
            return this.#real.getTimer(name, duration, callback);
        }
        const timer = new ManualTimer(name, duration, callback);
        this.effectTimers.push(timer);
        return timer;
    }

    override getPeriodicTimer(name: string, duration: Duration, callback: Timer.Callback): Timer {
        return this.#real.getPeriodicTimer(name, duration, callback);
    }

    override get macrotask(): Promise<void> {
        return this.#real.macrotask;
    }

    get running(): ManualTimer[] {
        return this.effectTimers.filter(timer => timer.isRunning);
    }
}

interface MountedLight {
    adapter: LightAdapter;
    device: GenericDevice;
    endpoint: any;
    node: ServerNode;
}

let environment: Environment;
let clock: EffectClock;
let instanceCounter = 0;
const cleanups = new Array<() => Promise<void>>();

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/** Generous on purpose: CI runners can be slow, and a passing condition returns at once. */
const WAIT_TIMEOUT_MS = 8000;

async function waitFor(condition: () => boolean, description: string): Promise<void> {
    const deadline = Date.now() + WAIT_TIMEOUT_MS;
    while (!condition()) {
        if (Date.now() > deadline) {
            throw new Error(`Timed out waiting for ${description}`);
        }
        await sleep(10);
    }
}

function waitForWrites(light: MountedLight, count: number): Promise<void> {
    return waitFor(() => light.adapter.writes.length >= count, `${count} writes, got ${light.adapter.writes}`);
}

/** Passes when no write arrives during `ms`; use well past the next step of any real-time timer involved. */
async function expectNoFurtherWrite(light: MountedLight, ms: number, message: string): Promise<void> {
    const writes = light.adapter.writes.length;
    await sleep(ms);
    expect(light.adapter.writes.length, message).to.equal(writes);
}

/** Fires the only running effect timer, waits for the write it causes and returns the step duration. */
async function fireEffectStep(light: MountedLight): Promise<Duration> {
    expect(clock.running, 'exactly one effect timer runs').to.have.length(1);
    const [timer] = clock.running;
    const writes = light.adapter.writes.length;
    timer.fire();
    await waitForWrites(light, writes + 1);
    return timer.interval;
}

/** Steps the running effect to its end and returns the step durations in milliseconds. */
async function runEffect(light: MountedLight): Promise<number[]> {
    const durations = new Array<number>();
    while (clock.running.length > 0) {
        expect(durations.length, 'effect ends').to.be.below(100);
        durations.push(await fireEffectStep(light));
    }
    return durations;
}

async function mountLight(initialPower: boolean, actionAllowedByIdentify = true): Promise<MountedLight> {
    const index = ++instanceCounter;
    const prefix = `0_userdata.0.identify${index}`;
    const adapter = new LightAdapter(`${prefix}.SET`, initialPower);
    SubscribeManager.setAdapter(adapter as unknown as ioBroker.Adapter);

    const detectedDevice: DetectedDevice = {
        type: Types.light,
        isIoBrokerDevice: true,
        states: [{ name: 'SET', id: `${prefix}.SET`, type: StateType.Boolean, read: true, write: true }],
    };
    const options: DeviceOptions = {
        uuid: `identify-${index}`,
        enabled: true,
        name: `Identify ${index}`,
        oid: prefix,
        type: Types.light,
        auto: false,
        noComposed: false,
        actionAllowedByIdentify,
    };
    const device = await DeviceFactory(detectedDevice, adapter as unknown as ioBroker.Adapter, options, false);
    const converter = await matterDeviceFabric(device, `Identify ${index}`, `identify-${index}`);
    expect(converter).to.not.equal(null);

    const node = await ServerNode.create(ServerNode.RootEndpoint, {
        environment,
        id: `identify-${index}`,
        network: { port: 0 },
        productDescription: { name: 'Test', deviceType: DeviceTypeId(0x0100) },
        basicInformation: {
            vendorName: 'ioBroker',
            vendorId: VendorId(0xfff1),
            productName: 'Test',
            productId: 0x8000,
        },
    });
    const [endpoint] = converter!.matterEndpoints;
    await node.add(endpoint);
    await converter!.init();

    cleanups.push(async () => {
        await node.close();
        await converter!.destroy();
    });

    return { adapter, device, endpoint, node };
}

/** Takes a plain number so a test can send an identifier the enum does not define. */
function triggerEffect(light: MountedLight, effectIdentifier: number): Promise<void> {
    return light.endpoint.act((agent: any) =>
        agent.identify.triggerEffect({ effectIdentifier, effectVariant: Identify.EffectVariant.Default }),
    );
}

function identify(light: MountedLight, identifyTime: number): Promise<void> {
    return light.endpoint.act((agent: any) => agent.identify.identify({ identifyTime }));
}

function waitForIdentifyEnd(light: MountedLight): Promise<void> {
    return waitFor(() => !light.endpoint.state.identify.isIdentifying, 'end of identification');
}

describe('IoLightingIdentifyServer', function () {
    this.timeout(30000);

    let previousLogLevel: LogLevel;
    let previousTime: Time;

    before(async () => {
        previousLogLevel = Logger.defaultLogLevel;
        Logger.defaultLogLevel = LogLevel.FATAL;
        previousTime = Time.default;
        clock = new EffectClock(previousTime);
        Time.default = clock;
        environment = await createMatterTestEnvironment('identify-server-test');
    });

    afterEach(async () => {
        while (cleanups.length) {
            await cleanups.pop()!();
        }
        SubscribeManager.subscribes.clear();
        clock.effectTimers.length = 0;
    });

    after(() => {
        Time.default = previousTime;
        Logger.defaultLogLevel = previousLogLevel;
    });

    describe('effects', () => {
        it('flashes once for Blink', async () => {
            const light = await mountLight(false);
            await triggerEffect(light, Identify.EffectIdentifier.Blink);
            await waitForWrites(light, 1);

            expect(await runEffect(light)).to.deep.equal([1000]);
            expect(light.adapter.writes).to.deep.equal([true, false]);
        });

        it('flashes 7 times for Breathe', async () => {
            const light = await mountLight(false);
            await triggerEffect(light, Identify.EffectIdentifier.Breathe);
            await waitForWrites(light, 1);

            expect(await runEffect(light)).to.deep.equal(new Array<number>(13).fill(1000));
            const flash = [true, false];
            expect(light.adapter.writes).to.deep.equal(new Array<boolean[]>(7).fill(flash).flat());
        });

        it('flashes twice for Okay', async () => {
            const light = await mountLight(false);
            await triggerEffect(light, Identify.EffectIdentifier.Okay);
            await waitForWrites(light, 1);

            expect(await runEffect(light)).to.deep.equal([1000, 1000, 1000]);
            expect(light.adapter.writes).to.deep.equal([true, false, true, false]);
        });

        it('switches on for 1 s and off for 7 s for ChannelChange, then restores', async () => {
            const light = await mountLight(true);
            await triggerEffect(light, Identify.EffectIdentifier.ChannelChange);
            await waitForWrites(light, 1);

            expect(await runEffect(light)).to.deep.equal([1000, 7000]);
            expect(light.adapter.writes).to.deep.equal([true, false, true]);
        });

        it('ignores an unknown effect identifier', async () => {
            const light = await mountLight(false);
            await triggerEffect(light, 0x10);

            await expectNoFurtherWrite(light, 300, 'no write for an unknown effect');
            expect(light.adapter.writes).to.deep.equal([]);
            expect(clock.effectTimers).to.deep.equal([]);
        });

        it('ignores StopEffect and FinishEffect while no effect runs', async () => {
            const light = await mountLight(true);
            await triggerEffect(light, Identify.EffectIdentifier.StopEffect);
            await triggerEffect(light, Identify.EffectIdentifier.FinishEffect);

            await expectNoFurtherWrite(light, 300, 'no write without a running effect');
            expect(light.adapter.writes).to.deep.equal([]);
            expect(light.adapter.power).to.equal(true);
        });

        it('stops a running effect at once on StopEffect and restores the power state', async () => {
            const light = await mountLight(false);
            await triggerEffect(light, Identify.EffectIdentifier.Breathe);
            await waitForWrites(light, 1);

            await triggerEffect(light, Identify.EffectIdentifier.StopEffect);
            await waitForWrites(light, 2);
            expect(light.adapter.writes).to.deep.equal([true, false]);
            expect(clock.running, 'step timer stopped').to.deep.equal([]);
            await expectNoFurtherWrite(light, 300, 'no step after StopEffect');
        });

        it('finishes the current step on FinishEffect, then restores the power state', async () => {
            const light = await mountLight(false);
            await triggerEffect(light, Identify.EffectIdentifier.Breathe);
            await waitForWrites(light, 1);

            await triggerEffect(light, Identify.EffectIdentifier.FinishEffect);
            await expectNoFurtherWrite(light, 300, 'the current step continues');
            expect(clock.running, 'the current step continues').to.have.length(1);

            expect(await runEffect(light)).to.deep.equal([1000]);
            expect(light.adapter.writes).to.deep.equal([true, false]);
        });

        it('replaces a running effect and keeps its initial power state', async () => {
            const light = await mountLight(false);
            await triggerEffect(light, Identify.EffectIdentifier.Breathe);
            await waitForWrites(light, 1);

            await triggerEffect(light, Identify.EffectIdentifier.Blink);
            await waitForWrites(light, 2);
            expect(clock.running, 'the Breathe timer stopped').to.have.length(1);

            expect(await runEffect(light)).to.deep.equal([1000]);
            expect(light.adapter.writes).to.deep.equal([true, true, false]);
        });

        it('writes nothing and only logs when identify may not switch the light', async () => {
            const light = await mountLight(false, false);
            await triggerEffect(light, Identify.EffectIdentifier.Blink);

            await expectNoFurtherWrite(light, 300, 'no write');
            expect(light.adapter.writes).to.deep.equal([]);
            expect(clock.effectTimers).to.deep.equal([]);
            expect(light.adapter.infos).to.include('Triggered identify effect for identify-' + instanceCounter);
        });

        it('logs a failed power write instead of rejecting', async () => {
            const light = await mountLight(false);
            light.adapter.failWrites = true;
            await triggerEffect(light, Identify.EffectIdentifier.Blink);

            await waitFor(
                () => light.adapter.infos.some(info => info.startsWith('Can not set power for identify')),
                'log of the failed write',
            );
        });

        it('restores the power state after a step write that is still running when StopEffect arrives', async () => {
            const light = await mountLight(false);
            light.adapter.writeDelays.push(200, 0);
            await triggerEffect(light, Identify.EffectIdentifier.Blink);
            await triggerEffect(light, Identify.EffectIdentifier.StopEffect);

            await waitForWrites(light, 2);
            expect(light.adapter.writes).to.deep.equal([true, false]);
            expect(light.adapter.power).to.equal(false);
        });

        it('keeps the power state from before the effects when one starts while a restore is still queued', async () => {
            const light = await mountLight(false);
            light.adapter.writeDelays.push(1000);
            await triggerEffect(light, Identify.EffectIdentifier.Blink);
            await triggerEffect(light, Identify.EffectIdentifier.StopEffect);
            await triggerEffect(light, Identify.EffectIdentifier.Blink);
            await waitForWrites(light, 3);

            await runEffect(light);
            expect(light.adapter.writes).to.deep.equal([true, false, true, false]);
            expect(light.adapter.power).to.equal(false);
        });

        it('starts the next effect from a power change made outside after all writes are done', async () => {
            const light = await mountLight(false);
            await triggerEffect(light, Identify.EffectIdentifier.Blink);
            await waitForWrites(light, 1);
            await runEffect(light);

            await light.adapter.switchFromOutside(true);
            await triggerEffect(light, Identify.EffectIdentifier.Blink);
            await waitForWrites(light, 3);
            expect(light.adapter.writes[2], 'the flash inverts the power set outside').to.equal(false);
        });

        it('stops a running effect and restores the power state when the node closes', async () => {
            const light = await mountLight(false);
            await triggerEffect(light, Identify.EffectIdentifier.Breathe);
            await waitForWrites(light, 1);

            light.adapter.writeDelayMs = 200;
            await light.node.close();
            expect(light.adapter.writes, 'restore written before close resolves').to.deep.equal([true, false]);
            expect(clock.running).to.deep.equal([]);
        });
    });

    describe('identify', () => {
        it('counts Identify down to 0 after a TriggerEffect and stops toggling', async () => {
            const light = await mountLight(false);
            await triggerEffect(light, Identify.EffectIdentifier.Blink);
            await waitForWrites(light, 1);
            await runEffect(light);
            expect(light.adapter.power, 'Blink restores the light').to.equal(false);

            await identify(light, 1);
            await waitForIdentifyEnd(light);
            expect(light.endpoint.state.identify.identifyTime).to.equal(0);
            await waitFor(() => !light.adapter.power, 'light restored to off');

            await expectNoFurtherWrite(light, 1500, 'no toggle after identification ended');
        });

        it('returns a light that was off to off when Identify is stopped', async () => {
            const light = await mountLight(false);
            await identify(light, 5);
            await waitForWrites(light, 1);
            expect(light.adapter.writes, 'Identify toggled the light on').to.deep.equal([true]);

            await identify(light, 0);
            await waitFor(() => !light.adapter.power, 'light restored to off');
        });

        it('characterization: returns a light that was on to on when Identify is stopped', async () => {
            const light = await mountLight(true);
            await identify(light, 5);
            await waitForWrites(light, 1);
            expect(light.adapter.writes, 'Identify toggled the light off').to.deep.equal([false]);

            await identify(light, 0);
            await waitFor(() => light.adapter.power, 'light restored to on');
        });

        it('ignores TriggerEffect while identifying', async () => {
            const light = await mountLight(false);
            await identify(light, 5);
            await waitForWrites(light, 1);

            await triggerEffect(light, Identify.EffectIdentifier.Blink);
            expect(clock.effectTimers, 'no effect started').to.deep.equal([]);

            await identify(light, 0);
            await waitFor(() => !light.adapter.power, 'light restored to off');
        });

        it('stops a running effect when Identify starts and restores the state from before the effect', async () => {
            const light = await mountLight(false);
            await triggerEffect(light, Identify.EffectIdentifier.Breathe);
            await waitForWrites(light, 1);

            await identify(light, 5);
            await waitForWrites(light, 3);
            expect(light.adapter.writes.slice(0, 3), 'effect restored, then Identify toggled').to.deep.equal([
                true,
                false,
                true,
            ]);
            expect(clock.running, 'effect timer stopped').to.deep.equal([]);

            await identify(light, 0);
            await waitForIdentifyEnd(light);
            await expectNoFurtherWrite(light, 300, 'restore written');
            expect(light.adapter.power).to.equal(false);
        });

        it('toggles for Identify only after a running effect restore write has finished', async () => {
            const light = await mountLight(false);
            await triggerEffect(light, Identify.EffectIdentifier.Blink);
            await waitForWrites(light, 1);

            light.adapter.writeDelays.push(200, 0);
            await identify(light, 5);
            await waitForWrites(light, 3);
            expect(light.adapter.writes, 'effect restored, then Identify toggled').to.deep.equal([true, false, true]);
        });

        it('stops identification and restores the power state when the node closes', async () => {
            const light = await mountLight(false);
            await identify(light, 5);
            await waitForWrites(light, 1);

            light.adapter.writeDelayMs = 200;
            await light.node.close();
            expect(light.adapter.power, 'restore written before close resolves').to.equal(false);
            await expectNoFurtherWrite(light, 1500, 'no toggle after close');
        });
    });
});
