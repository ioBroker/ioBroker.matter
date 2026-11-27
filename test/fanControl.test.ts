import { expect } from 'chai';
import { DeviceTypeId, Endpoint, type Environment, LogLevel, Logger, ServerNode, VendorId } from '@matter/main';
import { FanControl } from '@matter/main/clusters';
import { FanDevice } from '@matter/main/devices';
import { Status, StatusResponseError } from '@matter/main/types';
import { FanAirflowDirection, FanSpeed, FanSwing } from '../src/lib/devices/Fan';
import {
    fanModeForPercent,
    fanModeSequenceFor,
    normalizeFanModeWrite,
    normalizeRockSettingWrite,
    percentSettingForFanMode,
} from '../src/matter/FanControlUtils';
import { IoFanControlServer } from '../src/matter/behaviors/IoFanControlServer';
import {
    FanControlMapping,
    type FanControlValues,
    type IoBrokerFanStates,
    type MatterFanControlState,
} from '../src/matter/to-matter/FanControlMapping';
import { createMatterTestEnvironment } from './helpers/matterTestEnvironment';
import { remoteWriteContext } from './helpers/remoteActor';

const { FanMode, FanModeSequence } = FanControl;

const ROCK_NONE = { rockLeftRight: false, rockUpDown: false, rockRound: false };
const ROCK_LR = { ...ROCK_NONE, rockLeftRight: true };
const ROCK_UD = { ...ROCK_NONE, rockUpDown: true };

describe('Fan Control cluster rules', () => {
    it('stores a written On as High and Smart as Auto, or High without Auto (4.4.6.1.3, 4.4.6.1.4)', () => {
        expect(normalizeFanModeWrite(FanModeSequence.OffLowHigh, FanMode.On)).to.equal(FanMode.High);
        expect(normalizeFanModeWrite(FanModeSequence.OffHighAuto, FanMode.Smart)).to.equal(FanMode.Auto);
        expect(normalizeFanModeWrite(FanModeSequence.OffLowMedHigh, FanMode.Smart)).to.equal(FanMode.High);
    });

    it('refuses a written FanMode outside FanModeSequence (4.4.6.1)', () => {
        expect(normalizeFanModeWrite(FanModeSequence.OffHigh, FanMode.Low)).to.equal(undefined);
        expect(normalizeFanModeWrite(FanModeSequence.OffHighAuto, FanMode.Low)).to.equal(undefined);
        expect(normalizeFanModeWrite(FanModeSequence.OffLowHigh, FanMode.Medium)).to.equal(undefined);
        expect(normalizeFanModeWrite(FanModeSequence.OffLowMedHigh, FanMode.Auto)).to.equal(undefined);
        expect(normalizeFanModeWrite(FanModeSequence.OffLowMedHighAuto, FanMode.Medium)).to.equal(FanMode.Medium);
    });

    it('maps PercentSetting ranges onto the steps the sequence offers (4.4.6.3.1)', () => {
        const ranges = (sequence: FanControl.FanModeSequence): FanControl.FanMode[] =>
            [0, 1, 33, 34, 66, 67, 100].map(percent => fanModeForPercent(sequence, percent));
        const { Off, Low, Medium, High } = FanMode;
        expect(ranges(FanModeSequence.OffLowMedHigh)).to.deep.equal([Off, Low, Low, Medium, Medium, High, High]);
        expect(ranges(FanModeSequence.OffLowHigh)).to.deep.equal([Off, Low, Low, High, High, High, High]);
        expect(ranges(FanModeSequence.OffHighAuto)).to.deep.equal([Off, High, High, High, High, High, High]);
    });

    it('keeps a PercentSetting that lies in the range of the new FanMode and else picks one in it', () => {
        expect(percentSettingForFanMode(FanModeSequence.OffLowMedHigh, FanMode.Low, 20)).to.equal(20);
        expect(percentSettingForFanMode(FanModeSequence.OffLowMedHigh, FanMode.Low, 90)).to.equal(33);
        expect(percentSettingForFanMode(FanModeSequence.OffLowMedHigh, FanMode.Off, 90)).to.equal(0);
        expect(percentSettingForFanMode(FanModeSequence.OffHighAuto, FanMode.Auto, 90)).to.equal(null);
    });

    it('refuses a RockSetting bit RockSupport lacks and keeps the lowest of several bits (4.4.6.9)', () => {
        const support = { rockLeftRight: true, rockUpDown: true };
        expect(normalizeRockSettingWrite(support, { rockRound: true })).to.equal(undefined);
        expect(normalizeRockSettingWrite(ROCK_LR, { rockUpDown: true })).to.equal(undefined);
        expect(normalizeRockSettingWrite(support, { rockLeftRight: true, rockUpDown: true })).to.deep.equal(ROCK_LR);
        expect(normalizeRockSettingWrite(support, { rockUpDown: true })).to.deep.equal(ROCK_UD);
        expect(normalizeRockSettingWrite(support, {})).to.deep.equal(ROCK_NONE);
    });

    it('offers High for one step, Low and High for two and Low, Medium and High for three or more', () => {
        expect(fanModeSequenceFor(0, false)).to.equal(FanModeSequence.OffHigh);
        expect(fanModeSequenceFor(1, true)).to.equal(FanModeSequence.OffHighAuto);
        expect(fanModeSequenceFor(2, false)).to.equal(FanModeSequence.OffLowHigh);
        expect(fanModeSequenceFor(2, true)).to.equal(FanModeSequence.OffLowHighAuto);
        expect(fanModeSequenceFor(3, false)).to.equal(FanModeSequence.OffLowMedHigh);
        expect(fanModeSequenceFor(3, true)).to.equal(FanModeSequence.OffLowMedHighAuto);
    });
});

// ---------------------------------------------------------------------------------------------------------------
// FanControlMapping without a Matter node: fake ioBroker states that log their writes and a fake FanControl state.
// ---------------------------------------------------------------------------------------------------------------

interface FakeFan {
    /** Each ioBroker write as it starts. */
    writes: string[];
    power?: boolean;
    speed?: FanSpeed;
    level?: number | null;
    swing?: FanSwing | boolean;
    airflowDirection?: FanAirflowDirection;
    on: boolean;
    /** With `hold`: lets the oldest held write go on and waits until the mapping has reacted. */
    release(): Promise<void>;
}

interface FakeFanOptions {
    power?: boolean;
    speedModes?: FanSpeed[];
    speed?: FanSpeed;
    level?: number | null;
    swingModes?: (FanSwing | boolean)[];
    swing?: FanSwing | boolean;
    airflowDirection?: FanAirflowDirection;
    /** Builds the fan of an air conditioner, which follows `on`. */
    device?: boolean;
    /** All writes fail, or those the function picks by their entry in `writes`. */
    failWrites?: boolean | ((entry: string) => boolean);
    /** Each write waits for {@link FakeFan.release}. */
    hold?: boolean;
}

class FakeMatter implements MatterFanControlState {
    values: FanControlValues = { fanMode: FanMode.Off, percentSetting: 0, percentCurrent: 0 };
    onOff?: boolean;
    fanMode(): FanControl.FanMode {
        return this.values.fanMode;
    }
    percentSetting(): number | null {
        return this.values.percentSetting;
    }
    async set(values: FanControlValues): Promise<void> {
        this.values = { ...this.values, ...values };
    }
    async setOnOff(on: boolean): Promise<void> {
        this.onOff = on;
    }
    /** A client write, after IoFanControlServer applied the Percent Rules. */
    clientWrite(fanMode: FanControl.FanMode, percentSetting: number | null): void {
        this.values = { ...this.values, fanMode, percentSetting };
    }
}

const settle = (): Promise<void> => new Promise(resolve => setImmediate(resolve));

function fakeFan(options: FakeFanOptions): {
    fan: FakeFan;
    matter: FakeMatter;
    mapping: FanControlMapping;
    features: FanControl.Feature[];
} {
    const held = new Array<() => void>();
    const fan: FakeFan = {
        writes: [],
        power: options.power,
        speed: options.speed,
        level: options.level,
        swing: options.swing,
        airflowDirection: options.airflowDirection,
        on: true,
        release: async () => {
            await settle();
            held.shift()?.();
            await settle();
        },
    };
    const fails = (entry: string): boolean =>
        typeof options.failWrites === 'function' ? options.failWrites(entry) : !!options.failWrites;
    const write = async (entry: string, apply: () => void): Promise<void> => {
        fan.writes.push(entry);
        if (options.hold) {
            await new Promise<void>(resolve => held.push(resolve));
        }
        if (fails(entry)) {
            throw new Error('device refused');
        }
        apply();
    };
    const shared = {
        speed:
            options.speedModes !== undefined
                ? {
                      modes: options.speedModes,
                      get: () => fan.speed,
                      set: (speed: FanSpeed) => write(`speed ${speed}`, () => (fan.speed = speed)),
                  }
                : undefined,
        speedLevel:
            options.level !== undefined
                ? {
                      get: () => fan.level,
                      set: (percent: number) => write(`level ${percent}`, () => (fan.level = percent)),
                  }
                : undefined,
        swing:
            options.swingModes !== undefined
                ? {
                      modes: options.swingModes,
                      get: () => fan.swing,
                      set: (swing: FanSwing | boolean) => write(`swing ${swing}`, () => (fan.swing = swing)),
                  }
                : undefined,
        airflowDirection:
            options.airflowDirection !== undefined
                ? {
                      get: () => fan.airflowDirection,
                      set: (direction: FanAirflowDirection) =>
                          write(`airflow ${direction}`, () => (fan.airflowDirection = direction)),
                  }
                : undefined,
    };
    const states: IoBrokerFanStates = options.device
        ? { ...shared, deviceOn: () => fan.on }
        : {
              ...shared,
              power:
                  options.power !== undefined
                      ? { get: () => fan.power, set: on => write(`power ${on}`, () => (fan.power = on)) }
                      : undefined,
          };
    const matter = new FakeMatter();
    const mapping = new FanControlMapping(states, matter, { debug: () => {}, info: () => {} });
    return { fan, matter, mapping, features: FanControlMapping.featuresFor(states) };
}

const ALL_SPEEDS = [FanSpeed.Auto, FanSpeed.Low, FanSpeed.Medium, FanSpeed.High];
const STEP_SPEEDS = [FanSpeed.Low, FanSpeed.Medium, FanSpeed.High];

describe('FanControlMapping (bridge: ioBroker fan states to Matter FanControl)', () => {
    describe('features', () => {
        it('declares Auto only when SPEED lists AUTO', () => {
            expect(fakeFan({ speedModes: ALL_SPEEDS }).features).to.include(FanControl.Feature.Auto);
            const { mapping, features } = fakeFan({ speedModes: STEP_SPEEDS });
            expect(features).to.not.include(FanControl.Feature.Auto);
            expect(mapping.initialState.fanModeSequence).to.equal(FanModeSequence.OffLowMedHigh);
        });

        it('gives a swing-only air conditioner neither Auto nor Low/Medium', () => {
            const { mapping, features } = fakeFan({
                device: true,
                swingModes: [FanSwing.Horizontal, FanSwing.Stationary],
            });
            expect(features).to.deep.equal([FanControl.Feature.Rocking]);
            expect(mapping.initialState.fanModeSequence).to.equal(FanModeSequence.OffHigh);
        });

        it('derives RockSupport from HORIZONTAL and VERTICAL, and gives AUTO only or a boolean state RockLeftRight', () => {
            const support = (swingModes: (FanSwing | boolean)[]): unknown =>
                fakeFan({ speedModes: STEP_SPEEDS, swingModes }).mapping.initialState.rockSupport;
            expect(support([FanSwing.Horizontal, FanSwing.Stationary])).to.deep.equal(ROCK_LR);
            expect(support([FanSwing.Vertical, FanSwing.Auto, FanSwing.Stationary])).to.deep.equal(ROCK_UD);
            expect(support([FanSwing.Auto, FanSwing.Stationary])).to.deep.equal(ROCK_LR);
            expect(support([])).to.deep.equal(ROCK_LR);
        });

        it('declares no Rocking for a fan without a swing state', () => {
            const { mapping, features } = fakeFan({ speedModes: STEP_SPEEDS });
            expect(features).to.not.include(FanControl.Feature.Rocking);
            expect(mapping.initialState.rockSupport).to.equal(undefined);
        });

        it('allows a PercentSetting of 1..99 only for a fan with SPEED_LEVEL or at least two steps', () => {
            const variable = (options: FakeFanOptions): boolean => fakeFan(options).mapping.initialState.variableSpeed;
            expect(variable({ speedModes: [FanSpeed.Low, FanSpeed.High] })).to.equal(true);
            expect(variable({ speedModes: STEP_SPEEDS })).to.equal(true);
            expect(variable({ level: 50 })).to.equal(true);
            expect(variable({ speedModes: [FanSpeed.Auto, FanSpeed.High] })).to.equal(false);
            expect(variable({ speedModes: [] })).to.equal(false);
            expect(variable({ power: true })).to.equal(false);
            expect(variable({ device: true, swingModes: [FanSwing.Horizontal] })).to.equal(false);
        });

        it('allows a step or a percent only for a fan that does not run in Auto only', () => {
            const manual = (options: FakeFanOptions): boolean => fakeFan(options).mapping.initialState.manualSpeed;
            expect(manual({ speedModes: [FanSpeed.Auto], power: true })).to.equal(false);
            expect(manual({ speedModes: [FanSpeed.Auto], level: 50 })).to.equal(false);
            expect(manual({ speedModes: [FanSpeed.Auto, FanSpeed.High] })).to.equal(true);
            expect(manual({ power: true })).to.equal(true);
        });

        it('creates the endpoint with the speed values of the ioBroker states', () => {
            const { mapping } = fakeFan({ device: true, speedModes: STEP_SPEEDS, speed: FanSpeed.Medium });
            expect(mapping.initialState).to.include({
                fanMode: FanMode.Medium,
                percentSetting: 66,
                percentCurrent: 66,
            });
        });

        it('declares no Rocking for a swing state that cannot move', () => {
            const { mapping, features } = fakeFan({ speedModes: STEP_SPEEDS, swingModes: [FanSwing.Stationary] });
            expect(features).to.not.include(FanControl.Feature.Rocking);
            expect(mapping.initialState.rockSupport).to.equal(undefined);
        });

        it('allows Off only for a stand-alone fan with a power or level state', () => {
            expect(fakeFan({ speedModes: STEP_SPEEDS, power: true }).mapping.initialState.offAllowed).to.equal(true);
            expect(fakeFan({ level: 50 }).mapping.initialState.offAllowed).to.equal(true);
            expect(fakeFan({ speedModes: STEP_SPEEDS }).mapping.initialState.offAllowed).to.equal(false);
            expect(fakeFan({ device: true, level: 50 }).mapping.initialState.offAllowed).to.equal(false);
        });
    });

    describe('ioBroker to Matter', () => {
        it('takes FanMode from a listed SPEED step and the level as PercentSetting only within that step', async () => {
            const outside = fakeFan({ speedModes: ALL_SPEEDS, speed: FanSpeed.Low, level: 40 });
            await outside.mapping.initialize();
            expect(outside.matter.values).to.include({ fanMode: FanMode.Low, percentSetting: 33, percentCurrent: 40 });
            const inside = fakeFan({ speedModes: ALL_SPEEDS, speed: FanSpeed.Low, level: 20 });
            await inside.mapping.initialize();
            expect(inside.matter.values).to.include({ fanMode: FanMode.Low, percentSetting: 20, percentCurrent: 20 });
        });

        it('takes FanMode from the level when SPEED has no value or one the state does not list', async () => {
            const unlisted = fakeFan({ speedModes: [FanSpeed.Medium, FanSpeed.High], speed: FanSpeed.Low, level: 20 });
            await unlisted.mapping.initialize();
            expect(unlisted.matter.values).to.include({ fanMode: FanMode.Low, percentSetting: 20, percentCurrent: 20 });
            const noValue = fakeFan({ speedModes: ALL_SPEEDS, level: 90 });
            await noValue.mapping.initialize();
            expect(noValue.matter.values).to.include({ fanMode: FanMode.High, percentSetting: 90, percentCurrent: 90 });
        });

        it('reports a running stand-alone fan without a known speed as High, also when its power has no value', async () => {
            const { fan, matter, mapping } = fakeFan({ power: true });
            await mapping.initialize();
            expect(matter.values).to.include({ fanMode: FanMode.High, percentSetting: 100, percentCurrent: 100 });
            fan.power = undefined;
            await mapping.ioBrokerChanged();
            expect(matter.values).to.include({ fanMode: FanMode.High, percentCurrent: 100 });
            expect(matter.onOff).to.equal(true);
        });

        it('reports Auto with a null PercentSetting and the level as PercentCurrent, but a stand-alone level 0 as Off', async () => {
            const { fan, matter, mapping } = fakeFan({ speedModes: ALL_SPEEDS, speed: FanSpeed.Auto, level: 40 });
            await mapping.initialize();
            expect(matter.values).to.include({ fanMode: FanMode.Auto, percentSetting: null, percentCurrent: 40 });
            fan.level = 0;
            await mapping.ioBrokerChanged();
            expect(matter.values).to.include({ fanMode: FanMode.Off, percentSetting: 0, percentCurrent: 0 });
        });

        it('characterization: reports a SPEED step with the percent of the step', async () => {
            const { matter, mapping } = fakeFan({ speedModes: STEP_SPEEDS, speed: FanSpeed.Low });
            await mapping.initialize();
            expect(matter.values).to.include({ fanMode: FanMode.Low, percentSetting: 33, percentCurrent: 33 });
        });

        it('reports a SPEED value the state does not list as High while power is on, and as Off without power', async () => {
            const run = async (options: FakeFanOptions): Promise<FanControlValues> => {
                const fake = fakeFan(options);
                await fake.mapping.initialize();
                return fake.matter.values;
            };
            const twoSteps = [FanSpeed.Medium, FanSpeed.High];
            expect(await run({ speedModes: twoSteps, speed: FanSpeed.Low, power: true })).to.include({
                fanMode: FanMode.High,
                percentSetting: 100,
            });
            expect(await run({ speedModes: STEP_SPEEDS, speed: FanSpeed.Auto, power: true })).to.include({
                fanMode: FanMode.High,
            });
            expect(await run({ speedModes: ALL_SPEEDS, speed: FanSpeed.Quiet, device: true })).to.include({
                fanMode: FanMode.High,
            });
            expect(await run({ speedModes: twoSteps, speed: FanSpeed.Low })).to.include({
                fanMode: FanMode.Off,
                percentCurrent: 0,
            });
            expect(await run({ level: null })).to.include({ fanMode: FanMode.Off, percentCurrent: 0 });
        });

        it('clamps the SPEED_LEVEL into 0..100 and ignores a level that is not finite', async () => {
            const high = fakeFan({ level: 120 });
            await high.mapping.initialize();
            expect(high.matter.values).to.include({ fanMode: FanMode.High, percentSetting: 100, percentCurrent: 100 });
            const low = fakeFan({ level: -5 });
            await low.mapping.initialize();
            expect(low.matter.values).to.include({ fanMode: FanMode.Off, percentSetting: 0 });
            const infinite = fakeFan({ speedModes: STEP_SPEEDS, speed: FanSpeed.Low, level: Infinity });
            await infinite.mapping.initialize();
            expect(infinite.matter.values).to.include({ fanMode: FanMode.Low, percentSetting: 33, percentCurrent: 33 });
        });

        it('reports the Auto fan of a device whose SPEED_LEVEL is 0 with PercentCurrent 0', async () => {
            const { matter, mapping } = fakeFan({ device: true, speedModes: ALL_SPEEDS, level: 0 });
            await mapping.initialize();
            expect(matter.values).to.include({ fanMode: FanMode.Auto, percentSetting: null, percentCurrent: 0 });
        });

        it('reports swing VERTICAL as RockUpDown', async () => {
            const { matter, mapping } = fakeFan({
                speedModes: STEP_SPEEDS,
                swingModes: [FanSwing.Vertical, FanSwing.Stationary],
                swing: FanSwing.Vertical,
            });
            await mapping.initialize();
            expect(matter.values.rockSetting).to.deep.equal(ROCK_UD);
        });

        it('reports swing AUTO as RockLeftRight when RockLeftRight is supported', async () => {
            const { matter, mapping } = fakeFan({
                speedModes: STEP_SPEEDS,
                swingModes: [FanSwing.Horizontal, FanSwing.Auto],
                swing: FanSwing.Auto,
            });
            await mapping.initialize();
            expect(matter.values.rockSetting).to.deep.equal(ROCK_LR);
        });

        it('writes OnOff from the power state', async () => {
            const { fan, matter, mapping } = fakeFan({ speedModes: STEP_SPEEDS, speed: FanSpeed.Low, power: false });
            await mapping.initialize();
            expect(matter.onOff).to.equal(false);
            fan.power = true;
            await mapping.ioBrokerChanged();
            expect(matter.onOff).to.equal(true);
        });

        it('characterization: reports a stand-alone fan whose power is off as Off', async () => {
            const { matter, mapping } = fakeFan({ speedModes: STEP_SPEEDS, speed: FanSpeed.High, power: false });
            await mapping.initialize();
            expect(matter.values).to.include({ fanMode: FanMode.Off, percentSetting: 0, percentCurrent: 0 });
        });

        it('reports a level of 0 of a stand-alone fan as Off', async () => {
            const { matter, mapping } = fakeFan({ speedModes: STEP_SPEEDS, speed: FanSpeed.High, level: 0 });
            await mapping.initialize();
            expect(matter.values).to.include({ fanMode: FanMode.Off, percentSetting: 0, percentCurrent: 0 });
        });

        it('keeps the fan step of an air conditioner that is off and reports PercentCurrent 0', async () => {
            const { fan, matter, mapping } = fakeFan({ device: true, speedModes: STEP_SPEEDS, speed: FanSpeed.Medium });
            fan.on = false;
            await mapping.initialize();
            expect(matter.values).to.include({ fanMode: FanMode.Medium, percentSetting: 66, percentCurrent: 0 });
            fan.on = true;
            await mapping.ioBrokerChanged();
            expect(matter.values.percentCurrent).to.equal(66);
        });

        it('reports a running swing-only air conditioner as High, never as Off', async () => {
            const { matter, mapping } = fakeFan({ device: true, swingModes: [FanSwing.Horizontal] });
            await mapping.initialize();
            expect(matter.values).to.include({ fanMode: FanMode.High, percentSetting: 100, percentCurrent: 100 });
        });

        it('reports an air conditioner without a known speed as Auto when SPEED lists AUTO', async () => {
            const { matter, mapping } = fakeFan({ device: true, speedModes: ALL_SPEEDS });
            await mapping.initialize();
            expect(matter.values).to.include({ fanMode: FanMode.Auto, percentSetting: null });
        });

        it('reports PercentCurrent 0 for an air conditioner fan whose SPEED_LEVEL is 0', async () => {
            const { matter, mapping } = fakeFan({ device: true, level: 0 });
            await mapping.initialize();
            expect(matter.values).to.include({ fanMode: FanMode.High, percentSetting: 100, percentCurrent: 0 });
        });

        it('reports swing AUTO as the lowest supported rock direction', async () => {
            const { matter, mapping } = fakeFan({
                speedModes: STEP_SPEEDS,
                swingModes: [FanSwing.Vertical, FanSwing.Auto, FanSwing.Stationary],
                swing: FanSwing.Auto,
            });
            await mapping.initialize();
            expect(matter.values.rockSetting).to.deep.equal(ROCK_UD);
        });

        it('characterization: reports a boolean swing state as RockLeftRight', async () => {
            const { fan, matter, mapping } = fakeFan({ speedModes: STEP_SPEEDS, swingModes: [], swing: true });
            await mapping.initialize();
            expect(matter.values.rockSetting).to.deep.equal(ROCK_LR);
            fan.swing = false;
            await mapping.ioBrokerChanged();
            expect(matter.values.rockSetting).to.deep.equal(ROCK_NONE);
        });
    });

    describe('Matter to ioBroker', () => {
        it('writes a PercentSetting of a speed-only fan as the SPEED step and reports the step as PercentCurrent', async () => {
            const { fan, matter, mapping } = fakeFan({ speedModes: STEP_SPEEDS, speed: FanSpeed.High });
            await mapping.initialize();
            matter.clientWrite(FanMode.Medium, 50);
            await mapping.matterSpeedChanged();
            expect(fan.writes).to.deep.equal(['speed MEDIUM']);
            expect(matter.values).to.include({ fanMode: FanMode.Medium, percentSetting: 50, percentCurrent: 66 });
        });

        it('writes a PercentSetting of an air conditioner to its SPEED', async () => {
            const { fan, matter, mapping } = fakeFan({ device: true, speedModes: ALL_SPEEDS, speed: FanSpeed.Auto });
            await mapping.initialize();
            matter.clientWrite(FanMode.Low, 20);
            await mapping.matterSpeedChanged();
            expect(fan.writes).to.deep.equal(['speed LOW']);
        });

        it('keeps a TURBO speed when a percent within High is written to a speed-only fan', async () => {
            const { fan, matter, mapping } = fakeFan({
                speedModes: [FanSpeed.Low, FanSpeed.Medium, FanSpeed.High, FanSpeed.Turbo],
                speed: FanSpeed.Turbo,
            });
            await mapping.initialize();
            matter.clientWrite(FanMode.High, 80);
            await mapping.matterSpeedChanged();
            expect(fan.writes).to.deep.equal([]);
            expect(matter.values).to.include({ fanMode: FanMode.High, percentSetting: 80 });
        });

        it('writes SPEED and the level when the client leaves the step SPEED shows', async () => {
            const { fan, matter, mapping } = fakeFan({ speedModes: ALL_SPEEDS, speed: FanSpeed.Low, level: 40 });
            await mapping.initialize();
            matter.clientWrite(FanMode.High, 95);
            await mapping.matterSpeedChanged();
            expect(fan.writes).to.deep.equal(['speed HIGH', 'level 95']);
        });

        it('reports the percent of the step when a swing-only air conditioner gets a percent written', async () => {
            const { fan, matter, mapping } = fakeFan({ device: true, swingModes: [FanSwing.Horizontal] });
            await mapping.initialize();
            matter.clientWrite(FanMode.High, 50);
            await mapping.matterSpeedChanged();
            expect(fan.writes).to.deep.equal([]);
            expect(matter.values).to.include({ fanMode: FanMode.High, percentSetting: 100 });
        });

        it('writes a percent change within the range of the step only to SPEED_LEVEL', async () => {
            const { fan, matter, mapping } = fakeFan({ speedModes: ALL_SPEEDS, speed: FanSpeed.Low, level: 20 });
            await mapping.initialize();
            matter.clientWrite(FanMode.Low, 25);
            await mapping.matterSpeedChanged();
            expect(fan.writes).to.deep.equal(['level 25']);
        });

        it('writes the new step before the level when the percent leaves the range of the step', async () => {
            const { fan, matter, mapping } = fakeFan({ speedModes: ALL_SPEEDS, speed: FanSpeed.Low, level: 20 });
            await mapping.initialize();
            matter.clientWrite(FanMode.High, 90);
            await mapping.matterSpeedChanged();
            expect(fan.writes).to.deep.equal(['speed HIGH', 'level 90']);
        });

        it('leaves Auto through SPEED when a percent is written to a fan with SPEED_LEVEL', async () => {
            const { fan, matter, mapping } = fakeFan({ speedModes: ALL_SPEEDS, speed: FanSpeed.Auto, level: 40 });
            await mapping.initialize();
            matter.clientWrite(FanMode.Medium, 50);
            await mapping.matterSpeedChanged();
            expect(fan.writes).to.deep.equal(['speed MEDIUM', 'level 50']);
            expect(matter.values).to.include({ fanMode: FanMode.Medium, percentSetting: 50 });
        });

        it('writes the step for a SPEED value the state does not list, also when Matter shows that step', async () => {
            const { fan, matter, mapping } = fakeFan({
                speedModes: [FanSpeed.Medium, FanSpeed.High],
                speed: FanSpeed.Low,
                level: 80,
            });
            await mapping.initialize();
            matter.clientWrite(FanMode.High, 90);
            await mapping.matterSpeedChanged();
            expect(fan.writes).to.deep.equal(['speed HIGH', 'level 90']);
        });

        it('writes only SPEED for a FanMode change when the level already lies in the new step', async () => {
            const { fan, matter, mapping } = fakeFan({ speedModes: ALL_SPEEDS, speed: FanSpeed.Low, level: 90 });
            await mapping.initialize();
            expect(matter.values).to.include({ fanMode: FanMode.Low, percentSetting: 33 });
            matter.clientWrite(FanMode.High, 100);
            await mapping.matterSpeedChanged();
            expect(fan.writes).to.deep.equal(['speed HIGH']);
            expect(matter.values).to.include({ fanMode: FanMode.High, percentSetting: 90, percentCurrent: 90 });
        });

        it('starts a stand-alone fan in Auto with its last running level when its level is 0', async () => {
            const { fan, matter, mapping } = fakeFan({ speedModes: ALL_SPEEDS, speed: FanSpeed.Auto, level: 40 });
            await mapping.initialize();
            matter.clientWrite(FanMode.Off, 0);
            await mapping.matterSpeedChanged();
            expect(matter.values.fanMode).to.equal(FanMode.Off);
            matter.clientWrite(FanMode.Auto, null);
            await mapping.matterSpeedChanged();
            expect(fan.writes).to.deep.equal(['level 0', 'level 40']);
            expect(matter.values).to.include({ fanMode: FanMode.Auto, percentCurrent: 40 });
        });

        it('writes the running level before SPEED AUTO, so a level write cannot end Auto', async () => {
            const { fan, matter, mapping } = fakeFan({ speedModes: ALL_SPEEDS, speed: FanSpeed.Low, level: 0 });
            await mapping.initialize();
            expect(matter.values.fanMode).to.equal(FanMode.Off);
            matter.clientWrite(FanMode.Auto, null);
            await mapping.matterSpeedChanged();
            expect(fan.writes).to.deep.equal(['level 100', 'speed AUTO']);
            expect(matter.values.fanMode).to.equal(FanMode.Auto);
        });

        it('starts Auto with the last level written to the device, also when writes were queued', async () => {
            const { fan, matter, mapping } = fakeFan({
                speedModes: ALL_SPEEDS,
                speed: FanSpeed.Low,
                level: 20,
                hold: true,
            });
            await mapping.initialize();
            matter.clientWrite(FanMode.Low, 30);
            const levelWrite = mapping.matterSpeedChanged();
            matter.clientWrite(FanMode.Off, 0);
            const offWrite = mapping.matterSpeedChanged();
            await fan.release();
            await fan.release();
            await Promise.all([levelWrite, offWrite]);
            expect(matter.values.fanMode).to.equal(FanMode.Off);
            matter.clientWrite(FanMode.Auto, null);
            const autoWrite = mapping.matterSpeedChanged();
            await fan.release();
            await fan.release();
            await autoWrite;
            expect(fan.writes).to.deep.equal(['level 30', 'level 0', 'level 30', 'speed AUTO']);
        });

        it('starts Auto with a level the device reported while writes were queued', async () => {
            const { fan, matter, mapping } = fakeFan({
                speedModes: ALL_SPEEDS,
                speed: FanSpeed.Low,
                level: 20,
                swingModes: [FanSwing.Horizontal, FanSwing.Stationary],
                swing: FanSwing.Stationary,
                hold: true,
            });
            await mapping.initialize();
            const rockWrite = mapping.matterRockSettingChanged(ROCK_LR);
            fan.level = 80;
            await mapping.ioBrokerChanged();
            matter.clientWrite(FanMode.Off, 0);
            const offWrite = mapping.matterSpeedChanged();
            await fan.release();
            await fan.release();
            await Promise.all([rockWrite, offWrite]);
            matter.clientWrite(FanMode.Auto, null);
            const autoWrite = mapping.matterSpeedChanged();
            await fan.release();
            await fan.release();
            await autoWrite;
            expect(fan.writes.slice(-3)).to.deep.equal(['level 0', 'level 80', 'speed AUTO']);
        });

        it('keeps no earlier PercentSetting for a fan that cannot vary its speed', async () => {
            const { matter, mapping } = fakeFan({ speedModes: [FanSpeed.Auto, FanSpeed.High], speed: FanSpeed.High });
            matter.values = { ...matter.values, fanMode: FanMode.High, percentSetting: 50 };
            await mapping.initialize();
            expect(matter.values).to.include({ fanMode: FanMode.High, percentSetting: 100 });
        });

        it('writes Auto only to SPEED, not to SPEED_LEVEL', async () => {
            const { fan, matter, mapping } = fakeFan({ speedModes: ALL_SPEEDS, speed: FanSpeed.Low, level: 20 });
            await mapping.initialize();
            matter.clientWrite(FanMode.Auto, null);
            await mapping.matterSpeedChanged();
            expect(fan.writes).to.deep.equal(['speed AUTO']);
        });

        it('writes the first listed step for Low when SPEED lists QUIET and HIGH', async () => {
            const { fan, matter, mapping } = fakeFan({
                speedModes: [FanSpeed.Quiet, FanSpeed.High],
                speed: FanSpeed.High,
            });
            await mapping.initialize();
            matter.clientWrite(FanMode.Low, 33);
            await mapping.matterSpeedChanged();
            expect(fan.writes).to.deep.equal(['speed QUIET']);
        });

        it('characterization: switches a fan off through power, or through SPEED_LEVEL 0 without a power state', async () => {
            const withPower = fakeFan({ speedModes: STEP_SPEEDS, speed: FanSpeed.High, power: true });
            await withPower.mapping.initialize();
            withPower.matter.clientWrite(FanMode.Off, 0);
            await withPower.mapping.matterSpeedChanged();
            expect(withPower.fan.writes).to.deep.equal(['power false']);
            expect(withPower.matter.values).to.include({ fanMode: FanMode.Off, percentCurrent: 0 });

            const levelOnly = fakeFan({ level: 70 });
            await levelOnly.mapping.initialize();
            levelOnly.matter.clientWrite(FanMode.Off, 0);
            await levelOnly.mapping.matterSpeedChanged();
            expect(levelOnly.fan.writes).to.deep.equal(['level 0']);
        });

        it('characterization: switches the power on before it writes the step', async () => {
            const { fan, matter, mapping } = fakeFan({ speedModes: STEP_SPEEDS, speed: FanSpeed.Low, power: false });
            await mapping.initialize();
            matter.clientWrite(FanMode.High, 100);
            await mapping.matterSpeedChanged();
            expect(fan.writes).to.deep.equal(['power true', 'speed HIGH']);
        });

        it('acts once for a write that changed FanMode and PercentSetting together', async () => {
            const { fan, matter, mapping } = fakeFan({ speedModes: ALL_SPEEDS, speed: FanSpeed.Low, level: 20 });
            await mapping.initialize();
            matter.clientWrite(FanMode.High, 90);
            // One client write reports both attribute changes before the first write ends
            await Promise.all([mapping.matterSpeedChanged(), mapping.matterSpeedChanged()]);
            expect(fan.writes).to.deep.equal(['speed HIGH', 'level 90']);
        });

        it('derives the Matter state from the ioBroker states again after a refused write', async () => {
            const { fan, matter, mapping } = fakeFan({
                speedModes: STEP_SPEEDS,
                speed: FanSpeed.Low,
                failWrites: true,
            });
            await mapping.initialize();
            matter.clientWrite(FanMode.High, 100);
            await mapping.matterSpeedChanged().catch(() => undefined);
            expect(fan.writes).to.deep.equal(['speed HIGH']);
            expect(matter.values).to.include({ fanMode: FanMode.Low, percentSetting: 33 });
        });

        it('writes the same client change again after the device refused it once', async () => {
            let refused = false;
            const { fan, matter, mapping } = fakeFan({
                speedModes: STEP_SPEEDS,
                speed: FanSpeed.Low,
                failWrites: () => !refused && (refused = true),
            });
            await mapping.initialize();
            matter.clientWrite(FanMode.High, 100);
            await mapping.matterSpeedChanged().catch(() => undefined);
            matter.clientWrite(FanMode.High, 100);
            await mapping.matterSpeedChanged();
            expect(fan.writes).to.deep.equal(['speed HIGH', 'speed HIGH']);
            expect(matter.values.fanMode).to.equal(FanMode.High);
        });

        it('does not write power false again when the power state already is false', async () => {
            const { fan, matter, mapping } = fakeFan({ speedModes: STEP_SPEEDS, speed: FanSpeed.Low, power: true });
            await mapping.initialize();
            fan.power = false;
            matter.clientWrite(FanMode.Off, 0);
            await mapping.matterSpeedChanged();
            expect(fan.writes).to.deep.equal([]);
            expect(matter.values.fanMode).to.equal(FanMode.Off);
        });

        it('writes an OnOff change to the power state and shows the result', async () => {
            const { fan, matter, mapping } = fakeFan({ speedModes: STEP_SPEEDS, speed: FanSpeed.Low, power: true });
            await mapping.initialize();
            await mapping.matterOnOffChanged(false);
            expect(fan.writes).to.deep.equal(['power false']);
            expect(matter.values.fanMode).to.equal(FanMode.Off);
            expect(matter.onOff).to.equal(false);
        });

        it('writes nothing for an OnOff change of a fan without a power state', async () => {
            const { fan, mapping } = fakeFan({ speedModes: STEP_SPEEDS, speed: FanSpeed.Low });
            await mapping.matterOnOffChanged(false);
            expect(fan.writes).to.deep.equal([]);
        });

        it('writes RockUpDown as VERTICAL', async () => {
            const { fan, mapping } = fakeFan({
                speedModes: STEP_SPEEDS,
                swingModes: [FanSwing.Vertical, FanSwing.Stationary],
            });
            await mapping.matterRockSettingChanged(ROCK_UD);
            expect(fan.writes).to.deep.equal(['swing VERTICAL']);
        });

        it('writes RockLeftRight as AUTO when the swing state lists AUTO but not HORIZONTAL', async () => {
            const { fan, mapping } = fakeFan({
                speedModes: STEP_SPEEDS,
                swingModes: [FanSwing.Auto, FanSwing.Stationary],
            });
            await mapping.matterRockSettingChanged(ROCK_LR);
            await mapping.matterRockSettingChanged(ROCK_NONE);
            expect(fan.writes).to.deep.equal(['swing AUTO', 'swing STATIONARY']);
        });

        it('writes AirflowDirection Forward and Reverse to the airflow direction state', async () => {
            const { fan, mapping } = fakeFan({
                speedModes: STEP_SPEEDS,
                airflowDirection: FanAirflowDirection.Reverse,
            });
            await mapping.matterAirflowDirectionChanged(FanControl.AirflowDirection.Forward);
            await mapping.matterAirflowDirectionChanged(FanControl.AirflowDirection.Reverse);
            expect(fan.writes).to.deep.equal(['airflow FORWARD', 'airflow REVERSE']);
        });

        it('characterization: writes RockSetting to a boolean swing state as true and false', async () => {
            const { fan, mapping } = fakeFan({ speedModes: STEP_SPEEDS, swingModes: [] });
            await mapping.matterRockSettingChanged(ROCK_LR);
            await mapping.matterRockSettingChanged(ROCK_NONE);
            expect(fan.writes).to.deep.equal(['swing true', 'swing false']);
        });
    });
});

describe('FanControlMapping speed steps (each Matter step sets one device step)', () => {
    async function stepFan(speedModes: FanSpeed[], speed?: FanSpeed): Promise<ReturnType<typeof fakeFan>> {
        const fake = fakeFan({ speedModes, speed });
        await fake.mapping.initialize();
        return fake;
    }

    async function clientStep(fake: ReturnType<typeof fakeFan>, fanMode: FanControl.FanMode): Promise<string[]> {
        fake.matter.clientWrite(fanMode, fanMode === FanMode.Auto ? null : percentSettingForFanModeOf(fanMode));
        fake.fan.writes = [];
        await fake.mapping.matterSpeedChanged();
        return fake.fan.writes;
    }

    function percentSettingForFanModeOf(fanMode: FanControl.FanMode): number {
        return fanMode === FanMode.Low ? 33 : fanMode === FanMode.Medium ? 66 : 100;
    }

    it('maps MEDIUM and HIGH to Low and High, so each device step can be set', async () => {
        const fake = await stepFan([FanSpeed.Medium, FanSpeed.High], FanSpeed.Medium);
        expect(fake.mapping.initialState.fanModeSequence).to.equal(FanModeSequence.OffLowHigh);
        expect(fake.matter.values.fanMode).to.equal(FanMode.Low);
        expect(await clientStep(fake, FanMode.High)).to.deep.equal(['speed HIGH']);
        expect(fake.matter.values.fanMode).to.equal(FanMode.High);
        expect(await clientStep(fake, FanMode.Low)).to.deep.equal(['speed MEDIUM']);
        expect(fake.matter.values.fanMode).to.equal(FanMode.Low);
    });

    it('maps a single step to High', async () => {
        const fake = await stepFan([FanSpeed.Auto, FanSpeed.Low], FanSpeed.Auto);
        expect(fake.mapping.initialState.fanModeSequence).to.equal(FanModeSequence.OffHighAuto);
        expect(await clientStep(fake, FanMode.High)).to.deep.equal(['speed LOW']);
        expect(fake.matter.values.fanMode).to.equal(FanMode.High);
    });

    it('maps three steps to Low, Medium and High', async () => {
        const fake = await stepFan([FanSpeed.Quiet, FanSpeed.Medium, FanSpeed.Turbo], FanSpeed.Turbo);
        expect(fake.mapping.initialState.fanModeSequence).to.equal(FanModeSequence.OffLowMedHigh);
        expect(fake.matter.values.fanMode).to.equal(FanMode.High);
        expect(await clientStep(fake, FanMode.Medium)).to.deep.equal(['speed MEDIUM']);
        expect(await clientStep(fake, FanMode.Low)).to.deep.equal(['speed QUIET']);
    });

    it('joins QUIET to the step above it and then TURBO to the step below it until three steps remain', async () => {
        const all = [FanSpeed.Quiet, FanSpeed.Low, FanSpeed.Medium, FanSpeed.High, FanSpeed.Turbo];
        const five = await stepFan(all, FanSpeed.Quiet);
        expect(five.mapping.initialState.fanModeSequence).to.equal(FanModeSequence.OffLowMedHigh);
        expect(five.matter.values.fanMode).to.equal(FanMode.Low);
        expect(await clientStep(five, FanMode.High)).to.deep.equal(['speed HIGH']);
        five.fan.speed = FanSpeed.Turbo;
        await five.mapping.ioBrokerChanged();
        expect(five.matter.values.fanMode).to.equal(FanMode.High);
        expect(await clientStep(five, FanMode.Low)).to.deep.equal(['speed LOW']);

        const four = await stepFan([FanSpeed.Quiet, FanSpeed.Low, FanSpeed.High, FanSpeed.Turbo], FanSpeed.Quiet);
        expect(four.matter.values.fanMode).to.equal(FanMode.Low);
        expect(await clientStep(four, FanMode.Medium)).to.deep.equal(['speed HIGH']);
        expect(await clientStep(four, FanMode.High)).to.deep.equal(['speed TURBO']);
    });

    it('gives a SPEED state that lists no values no step and never writes it', async () => {
        const fake = await stepFan([], FanSpeed.High);
        expect(fake.mapping.initialState.fanModeSequence).to.equal(FanModeSequence.OffHigh);
        expect(fake.mapping.initialState.manualSpeed).to.equal(false);
        expect(fake.matter.values.fanMode).to.equal(FanMode.Off);
        expect(await clientStep(fake, FanMode.High)).to.deep.equal([]);
    });

    it('writes nothing for High when SPEED lists only AUTO and shows Auto again', async () => {
        const fake = await stepFan([FanSpeed.Auto], FanSpeed.Auto);
        expect(fake.mapping.initialState.fanModeSequence).to.equal(FanModeSequence.OffHighAuto);
        expect(await clientStep(fake, FanMode.High)).to.deep.equal([]);
        expect(fake.matter.values).to.include({ fanMode: FanMode.Auto, percentSetting: null });
    });
});

describe('FanControlMapping round trip (a write the server accepts is shown after the device took it)', () => {
    const SPEED_LISTS: (FanSpeed[] | undefined)[] = [
        undefined,
        [],
        [FanSpeed.Auto],
        [FanSpeed.Auto, FanSpeed.High],
        [FanSpeed.Medium, FanSpeed.High],
        STEP_SPEEDS,
        [FanSpeed.Auto, FanSpeed.Quiet, FanSpeed.Low, FanSpeed.Medium, FanSpeed.High, FanSpeed.Turbo],
    ];

    interface Shape {
        device: boolean;
        power: boolean;
        level: boolean;
        speedModes?: FanSpeed[];
    }

    const shapes = new Array<Shape>();
    for (const device of [false, true]) {
        for (const power of device ? [false] : [false, true]) {
            for (const level of [false, true]) {
                for (const speedModes of SPEED_LISTS) {
                    shapes.push({ device, power, level, speedModes });
                }
            }
        }
    }

    /** The client writes `IoFanControlServer` accepts for a fan created with `state`. */
    function acceptedTargets(
        state: ReturnType<typeof fakeFan>['mapping']['initialState'],
    ): [FanControl.FanMode, number | null][] {
        const targets = new Array<[FanControl.FanMode, number | null]>();
        const { fanModeSequence: sequence } = state;
        if (state.offAllowed) {
            targets.push([FanMode.Off, 0]);
        }
        if (
            sequence === FanModeSequence.OffHighAuto ||
            sequence === FanModeSequence.OffLowHighAuto ||
            sequence === FanModeSequence.OffLowMedHighAuto
        ) {
            targets.push([FanMode.Auto, null]);
        }
        if (state.manualSpeed) {
            for (const fanMode of [FanMode.Low, FanMode.Medium, FanMode.High]) {
                if (normalizeFanModeWrite(sequence, fanMode) === fanMode) {
                    targets.push([fanMode, null]);
                }
            }
            if (state.variableSpeed) {
                for (const percent of [10, 50, 90]) {
                    targets.push([fanModeForPercent(sequence, percent), percent]);
                }
            }
        }
        return targets;
    }

    it('shows every accepted client write again after the device took it, from every start state', async () => {
        let checked = 0;
        for (const shape of shapes) {
            const powers = shape.power ? [true, false, undefined] : [undefined];
            const speeds = [undefined, ...(shape.speedModes ?? [])];
            const levels = shape.level ? [undefined, 0, 40] : [undefined];
            for (const power of powers) {
                for (const speed of speeds) {
                    for (const level of levels) {
                        const options: FakeFanOptions = {
                            device: shape.device,
                            power: shape.power ? true : undefined,
                            speedModes: shape.speedModes,
                            level: shape.level ? null : undefined,
                        };
                        for (const [fanMode, percent] of acceptedTargets(fakeFan(options).mapping.initialState)) {
                            const { fan, matter, mapping } = fakeFan(options);
                            fan.power = power;
                            fan.speed = speed;
                            fan.level = level;
                            await mapping.initialize();
                            const before = matter.values.percentSetting;
                            const percentSetting =
                                percent ??
                                percentSettingForFanMode(mapping.initialState.fanModeSequence, fanMode, before);
                            matter.clientWrite(fanMode, percentSetting);
                            await mapping.matterSpeedChanged();
                            const label = `${JSON.stringify({ ...shape, power, speed, level })} -> ${FanMode[fanMode]} ${percent}`;
                            expect(matter.values.fanMode, label).to.equal(fanMode);
                            if (percent !== null) {
                                expect(matter.values.percentSetting, label).to.equal(percent);
                            } else if (fanMode !== FanMode.Auto) {
                                const shown = matter.values.percentSetting ?? -1;
                                expect(fanModeForPercent(mapping.initialState.fanModeSequence, shown), label).to.equal(
                                    fanMode,
                                );
                            }
                            checked++;
                        }
                    }
                }
            }
        }
        expect(checked).to.be.greaterThan(500);
    });
});

describe('FanControlMapping write queue (one queue, one resync when it is empty)', () => {
    it('does not undo a RockSetting change queued behind a speed write', async () => {
        const { fan, matter, mapping } = fakeFan({
            speedModes: STEP_SPEEDS,
            speed: FanSpeed.Low,
            swingModes: [FanSwing.Horizontal, FanSwing.Stationary],
            swing: FanSwing.Stationary,
            hold: true,
        });
        await mapping.initialize();
        matter.clientWrite(FanMode.High, 100);
        const speedWrite = mapping.matterSpeedChanged();
        matter.values = { ...matter.values, rockSetting: ROCK_LR };
        const rockWrite = mapping.matterRockSettingChanged(ROCK_LR);
        await fan.release();
        await speedWrite;
        expect(matter.values.rockSetting).to.deep.equal(ROCK_LR);
        await fan.release();
        await rockWrite;
        expect(fan.writes).to.deep.equal(['speed HIGH', 'swing HORIZONTAL']);
        expect(matter.values).to.include({ fanMode: FanMode.High });
        expect(matter.values.rockSetting).to.deep.equal(ROCK_LR);
    });

    it('shows ioBroker changes that arrive while writes are queued only after the last write', async () => {
        const { fan, matter, mapping } = fakeFan({
            speedModes: STEP_SPEEDS,
            speed: FanSpeed.Low,
            swingModes: [FanSwing.Horizontal, FanSwing.Stationary],
            swing: FanSwing.Stationary,
            hold: true,
        });
        await mapping.initialize();
        matter.clientWrite(FanMode.High, 100);
        const speedWrite = mapping.matterSpeedChanged();
        fan.swing = FanSwing.Horizontal;
        await mapping.ioBrokerChanged();
        expect(matter.values.fanMode).to.equal(FanMode.High);
        expect(matter.values.rockSetting).to.deep.equal(ROCK_NONE);
        await fan.release();
        await speedWrite;
        expect(matter.values.fanMode).to.equal(FanMode.High);
        expect(matter.values.rockSetting).to.deep.equal(ROCK_LR);
    });

    it('shows the swing state again when the device refuses a RockSetting write', async () => {
        const { matter, mapping } = fakeFan({
            speedModes: STEP_SPEEDS,
            swingModes: [FanSwing.Horizontal, FanSwing.Stationary],
            swing: FanSwing.Stationary,
            failWrites: true,
        });
        await mapping.initialize();
        matter.values = { ...matter.values, rockSetting: ROCK_LR };
        await mapping.matterRockSettingChanged(ROCK_LR).catch(() => undefined);
        expect(matter.values.rockSetting).to.deep.equal(ROCK_NONE);
    });

    it('shows the airflow direction again when the device refuses an AirflowDirection write', async () => {
        const { fan, matter, mapping } = fakeFan({
            speedModes: STEP_SPEEDS,
            airflowDirection: FanAirflowDirection.Forward,
            failWrites: true,
        });
        await mapping.initialize();
        matter.values = { ...matter.values, airflowDirection: FanControl.AirflowDirection.Reverse };
        await mapping.matterAirflowDirectionChanged(FanControl.AirflowDirection.Reverse).catch(() => undefined);
        expect(fan.writes).to.deep.equal(['airflow REVERSE']);
        expect(matter.values.airflowDirection).to.equal(FanControl.AirflowDirection.Forward);
    });

    it('keeps OnOff and FanMode consistent when the speed write fails after the power write', async () => {
        const { fan, matter, mapping } = fakeFan({
            speedModes: STEP_SPEEDS,
            speed: FanSpeed.Low,
            power: false,
            failWrites: entry => entry.startsWith('speed'),
        });
        await mapping.initialize();
        matter.clientWrite(FanMode.High, 100);
        await mapping.matterSpeedChanged().catch(() => undefined);
        expect(fan.writes).to.deep.equal(['power true', 'speed HIGH']);
        expect(matter.onOff).to.equal(true);
        expect(matter.values.fanMode).to.equal(FanMode.Low);
    });

    it('queues an OnOff power write behind an earlier speed write', async () => {
        const { fan, matter, mapping } = fakeFan({
            speedModes: STEP_SPEEDS,
            speed: FanSpeed.Low,
            power: true,
            hold: true,
        });
        await mapping.initialize();
        matter.clientWrite(FanMode.High, 100);
        const speedWrite = mapping.matterSpeedChanged();
        const powerWrite = mapping.matterOnOffChanged(false);
        await settle();
        expect(fan.writes).to.deep.equal(['speed HIGH']);
        await fan.release();
        await fan.release();
        await Promise.all([speedWrite, powerWrite]);
        expect(fan.writes).to.deep.equal(['speed HIGH', 'power false']);
        expect(matter.values.fanMode).to.equal(FanMode.Off);
        expect(matter.onOff).to.equal(false);
    });

    it('goes on with the next write after a failed one', async () => {
        const { fan, matter, mapping } = fakeFan({
            speedModes: STEP_SPEEDS,
            speed: FanSpeed.Low,
            swingModes: [FanSwing.Horizontal, FanSwing.Stationary],
            swing: FanSwing.Stationary,
            failWrites: entry => entry.startsWith('speed'),
        });
        await mapping.initialize();
        matter.clientWrite(FanMode.High, 100);
        const speedWrite = mapping.matterSpeedChanged();
        const rockWrite = mapping.matterRockSettingChanged(ROCK_LR);
        expect(
            await speedWrite.then(
                () => 'resolved',
                () => 'rejected',
            ),
        ).to.equal('rejected');
        await rockWrite;
        expect(fan.writes).to.deep.equal(['speed HIGH', 'swing HORIZONTAL']);
        expect(matter.values.rockSetting).to.deep.equal(ROCK_LR);
        expect(matter.values.fanMode).to.equal(FanMode.Low);
    });
});

// ---------------------------------------------------------------------------------------------------------------
// IoFanControlServer: client writes on a real ServerNode, in the context of a remote client.
// ---------------------------------------------------------------------------------------------------------------

describe('IoFanControlServer (client write rules before a write is accepted)', function () {
    this.timeout(30000);

    let environment: Environment;
    let previousLogLevel: LogLevel;
    let counter = 0;
    const nodes = new Array<ServerNode>();

    before(async () => {
        previousLogLevel = Logger.defaultLogLevel;
        Logger.defaultLogLevel = LogLevel.FATAL;
        environment = await createMatterTestEnvironment('fan-control-server-test');
    });

    afterEach(async () => {
        while (nodes.length) {
            await nodes.pop()!.close();
        }
    });

    after(() => {
        Logger.defaultLogLevel = previousLogLevel;
    });

    const RockingServer = IoFanControlServer.with(FanControl.Feature.Rocking);
    const AutoServer = IoFanControlServer.with(FanControl.Feature.Auto);

    async function mountFan(
        server: typeof RockingServer | typeof AutoServer,
        fanControl: Record<string, unknown>,
    ): Promise<{ node: ServerNode; endpoint: Endpoint }> {
        const index = ++counter;
        const node = await ServerNode.create(ServerNode.RootEndpoint, {
            environment,
            id: `fan-server-${index}`,
            network: { port: 0 },
            productDescription: { name: 'Test', deviceType: DeviceTypeId(0x002b) },
            basicInformation: { vendorName: 'ioBroker', vendorId: VendorId(0xfff1), productName: 'Test', productId: 1 },
        });
        nodes.push(node);
        const endpoint = new Endpoint(FanDevice.with(server), { id: `fan-${index}`, fanControl });
        await node.add(endpoint);
        return { node, endpoint };
    }

    /**
     * Writes attributes as a remote client, each in its own transaction like a network write request. Resolves to the
     * first refusing status, if any; the other attributes are still written.
     */
    async function clientWrite(
        mounted: { node: ServerNode; endpoint: Endpoint },
        values: Record<string, unknown>,
    ): Promise<Status | undefined> {
        let refused: Status | undefined;
        for (const [name, value] of Object.entries(values)) {
            try {
                await remoteWriteContext(mounted.node).act(context => {
                    const state = mounted.endpoint.agentFor(context).get(IoFanControlServer).state;
                    Object.assign(state, { [name]: value });
                });
            } catch (error) {
                const status = StatusResponseError.of(error)?.code;
                if (status === undefined) {
                    throw error;
                }
                refused ??= status;
            }
        }
        return refused;
    }

    const fanState = (mounted: { endpoint: Endpoint }): IoFanControlServer.State =>
        mounted.endpoint.stateOf(IoFanControlServer);

    const lowMedHigh = {
        fanModeSequence: FanModeSequence.OffLowMedHigh,
        fanMode: FanMode.Medium,
        percentSetting: 66,
        percentCurrent: 66,
        rockSupport: ROCK_LR,
    };

    it('stores a written On as High, with the PercentSetting of High', async () => {
        const mounted = await mountFan(RockingServer, lowMedHigh);
        expect(await clientWrite(mounted, { fanMode: FanMode.On })).to.equal(undefined);
        expect(fanState(mounted)).to.include({ fanMode: FanMode.High, percentSetting: 100 });
    });

    it('stores a written On as High also when PercentSetting already lies in the High range', async () => {
        const mounted = await mountFan(RockingServer, lowMedHigh);
        await clientWrite(mounted, { percentSetting: 80 });
        expect(await clientWrite(mounted, { fanMode: FanMode.On })).to.equal(undefined);
        expect(fanState(mounted)).to.include({ fanMode: FanMode.High, percentSetting: 80 });
    });

    it('stores a written Smart as High without Auto and as Auto with it', async () => {
        const withoutAuto = await mountFan(RockingServer, lowMedHigh);
        await clientWrite(withoutAuto, { fanMode: FanMode.Smart });
        expect(fanState(withoutAuto).fanMode).to.equal(FanMode.High);

        const withAuto = await mountFan(AutoServer, {
            fanModeSequence: FanModeSequence.OffLowMedHighAuto,
            fanMode: FanMode.Low,
            percentSetting: 20,
        });
        await clientWrite(withAuto, { fanMode: FanMode.Smart });
        expect(fanState(withAuto)).to.include({ fanMode: FanMode.Auto, percentSetting: null });
    });

    it('answers a FanMode outside FanModeSequence with CONSTRAINT_ERROR and keeps the old value', async () => {
        const mounted = await mountFan(RockingServer, { ...lowMedHigh, fanModeSequence: FanModeSequence.OffHigh });
        await clientWrite(mounted, { fanMode: FanMode.High });
        expect(await clientWrite(mounted, { fanMode: FanMode.Low })).to.equal(Status.ConstraintError);
        expect(fanState(mounted).fanMode).to.equal(FanMode.High);
    });

    it('answers a Medium that the sequence lacks with CONSTRAINT_ERROR, which matter.js itself accepts', async () => {
        const mounted = await mountFan(RockingServer, {
            ...lowMedHigh,
            fanModeSequence: FanModeSequence.OffLowHigh,
            fanMode: FanMode.Low,
            percentSetting: 33,
        });
        expect(await clientWrite(mounted, { fanMode: FanMode.Medium })).to.equal(Status.ConstraintError);
        expect(fanState(mounted).fanMode).to.equal(FanMode.Low);
    });

    it('answers a PercentSetting of 1..99 with INVALID_IN_STATE when the fan runs at one speed only', async () => {
        const mounted = await mountFan(RockingServer, {
            ...lowMedHigh,
            fanModeSequence: FanModeSequence.OffHigh,
            fanMode: FanMode.High,
            percentSetting: 100,
            percentCurrent: 100,
            offAllowed: false,
            variableSpeed: false,
        });
        expect(await clientWrite(mounted, { percentSetting: 50 })).to.equal(Status.InvalidInState);
        expect(await clientWrite(mounted, { percentSetting: 100 })).to.equal(undefined);
        expect(await clientWrite(mounted, { fanMode: FanMode.High })).to.equal(undefined);
        expect(fanState(mounted)).to.include({ fanMode: FanMode.High, percentSetting: 100 });
    });

    it('answers a step or a percent with INVALID_IN_STATE when the fan runs in Auto only', async () => {
        const mounted = await mountFan(AutoServer, {
            fanModeSequence: FanModeSequence.OffHighAuto,
            fanMode: FanMode.Auto,
            percentSetting: null,
            percentCurrent: 100,
            variableSpeed: false,
            manualSpeed: false,
        });
        expect(await clientWrite(mounted, { fanMode: FanMode.High })).to.equal(Status.InvalidInState);
        expect(await clientWrite(mounted, { fanMode: FanMode.On })).to.equal(Status.InvalidInState);
        expect(await clientWrite(mounted, { percentSetting: 100 })).to.equal(Status.InvalidInState);
        expect(fanState(mounted)).to.include({ fanMode: FanMode.Auto, percentSetting: null });
        expect(await clientWrite(mounted, { fanMode: FanMode.Off })).to.equal(undefined);
        expect(await clientWrite(mounted, { fanMode: FanMode.Smart })).to.equal(undefined);
        expect(fanState(mounted)).to.include({ fanMode: FanMode.Auto, percentSetting: null });
    });

    it('answers a PercentSetting that keeps the FanMode with INVALID_IN_STATE when the fan runs in Auto only', async () => {
        const mounted = await mountFan(AutoServer, {
            fanModeSequence: FanModeSequence.OffHighAuto,
            fanMode: FanMode.High,
            percentSetting: 40,
            percentCurrent: 40,
            manualSpeed: false,
            offAllowed: false,
        });
        expect(await clientWrite(mounted, { percentSetting: 60 })).to.equal(Status.InvalidInState);
        expect(fanState(mounted)).to.include({ fanMode: FanMode.High, percentSetting: 40 });
    });

    it('answers PercentSetting 0 with INVALID_IN_STATE when the fan is shown Off but cannot be switched off', async () => {
        const mounted = await mountFan(RockingServer, {
            ...lowMedHigh,
            fanModeSequence: FanModeSequence.OffHigh,
            fanMode: FanMode.Off,
            percentSetting: 10,
            percentCurrent: 0,
            offAllowed: false,
        });
        expect(await clientWrite(mounted, { percentSetting: 0 })).to.equal(Status.InvalidInState);
    });

    it('switches a fan off with PercentSetting 0 also when it runs at one speed only', async () => {
        const mounted = await mountFan(RockingServer, {
            ...lowMedHigh,
            fanModeSequence: FanModeSequence.OffHigh,
            fanMode: FanMode.High,
            percentSetting: 100,
            percentCurrent: 100,
            variableSpeed: false,
        });
        expect(await clientWrite(mounted, { percentSetting: 0 })).to.equal(undefined);
        expect(fanState(mounted)).to.include({ fanMode: FanMode.Off, percentSetting: 0, percentCurrent: 0 });
    });

    it('switches a fan without a speed state on with FanMode High', async () => {
        const mounted = await mountFan(RockingServer, {
            ...lowMedHigh,
            fanModeSequence: FanModeSequence.OffHigh,
            fanMode: FanMode.Off,
            percentSetting: 0,
            percentCurrent: 0,
            variableSpeed: false,
        });
        expect(await clientWrite(mounted, { fanMode: FanMode.High })).to.equal(undefined);
        expect(fanState(mounted)).to.include({ fanMode: FanMode.High, percentSetting: 100 });
    });

    it('keeps the null PercentSetting of a written Auto, also when the client writes null with it', async () => {
        const mounted = await mountFan(AutoServer, {
            fanModeSequence: FanModeSequence.OffLowMedHighAuto,
            fanMode: FanMode.Low,
            percentSetting: 20,
        });
        expect(await clientWrite(mounted, { fanMode: FanMode.Auto, percentSetting: null })).to.equal(undefined);
        expect(fanState(mounted)).to.include({ fanMode: FanMode.Auto, percentSetting: null });
    });

    it('answers Off with INVALID_IN_STATE when the fan cannot be switched off on its own', async () => {
        const mounted = await mountFan(RockingServer, { ...lowMedHigh, offAllowed: false });
        expect(await clientWrite(mounted, { fanMode: FanMode.Off })).to.equal(Status.InvalidInState);
        expect(await clientWrite(mounted, { percentSetting: 0 })).to.equal(Status.InvalidInState);
        expect(fanState(mounted)).to.include({ fanMode: FanMode.Medium, percentSetting: 66 });
    });

    it('sets FanMode from a written PercentSetting and PercentSetting from a written FanMode', async () => {
        const mounted = await mountFan(RockingServer, lowMedHigh);
        await clientWrite(mounted, { percentSetting: 90 });
        expect(fanState(mounted)).to.include({ fanMode: FanMode.High, percentSetting: 90 });
        await clientWrite(mounted, { fanMode: FanMode.Low });
        expect(fanState(mounted)).to.include({ fanMode: FanMode.Low, percentSetting: 33 });
        await clientWrite(mounted, { percentSetting: 10 });
        expect(fanState(mounted)).to.include({ fanMode: FanMode.Low, percentSetting: 10 });
    });

    it('keeps PercentSetting when a client writes null', async () => {
        const mounted = await mountFan(RockingServer, lowMedHigh);
        await clientWrite(mounted, { percentSetting: null });
        expect(fanState(mounted)).to.include({ fanMode: FanMode.Medium, percentSetting: 66 });
    });

    it('sets PercentCurrent to 0 when a client switches the fan off', async () => {
        const mounted = await mountFan(RockingServer, lowMedHigh);
        await clientWrite(mounted, { fanMode: FanMode.Off });
        expect(fanState(mounted)).to.include({ fanMode: FanMode.Off, percentSetting: 0, percentCurrent: 0 });
    });

    it('answers a RockSetting bit RockSupport lacks with CONSTRAINT_ERROR', async () => {
        const mounted = await mountFan(RockingServer, lowMedHigh);
        expect(await clientWrite(mounted, { rockSetting: { rockUpDown: true } })).to.equal(Status.ConstraintError);
        expect(mounted.endpoint.stateOf(RockingServer).rockSetting).to.deep.equal(ROCK_NONE);
    });

    it('keeps only the lowest bit of a RockSetting combination the device cannot do', async () => {
        const mounted = await mountFan(RockingServer, {
            ...lowMedHigh,
            rockSupport: { rockLeftRight: true, rockUpDown: true, rockRound: false },
        });
        await clientWrite(mounted, { rockSetting: { rockLeftRight: true, rockUpDown: true } });
        expect(mounted.endpoint.stateOf(RockingServer).rockSetting).to.deep.equal(ROCK_LR);
    });

    it('does not check local writes', async () => {
        const mounted = await mountFan(RockingServer, lowMedHigh);
        await mounted.endpoint.setStateOf(RockingServer, { fanMode: FanMode.Low, percentSetting: 90 });
        expect(fanState(mounted)).to.include({ fanMode: FanMode.Low, percentSetting: 90 });
        await mounted.endpoint.setStateOf(RockingServer, { rockSetting: { ...ROCK_LR, rockRound: true } });
        expect(mounted.endpoint.stateOf(RockingServer).rockSetting).to.deep.equal({ ...ROCK_LR, rockRound: true });
    });
});
