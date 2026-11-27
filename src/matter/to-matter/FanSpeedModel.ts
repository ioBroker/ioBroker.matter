import { FanControl as MatterFanControl } from '@matter/main/clusters';
import { FanSpeed } from '../../lib/devices/Fan';
import {
    fanModeForPercent,
    fanModeSequenceFor,
    percentForFanMode,
    percentSettingForFanMode,
    sequenceHasAuto,
} from '../FanControlUtils';

/** Which speed states a fan has. */
export interface FanSpeedStates {
    readonly power: boolean;
    /** The values the SPEED state lists; undefined without a SPEED state. */
    readonly speedModes?: readonly FanSpeed[];
    readonly level: boolean;
    /** The fan of a device that switches it, see `IoBrokerDeviceFanStates`. */
    readonly partOfDevice: boolean;
}

/** The ioBroker values the speed attributes come from; a value is undefined when unknown or without its state. */
export interface SpeedSnapshot {
    readonly power?: boolean;
    readonly speed?: FanSpeed;
    /** Percent, 0..100. */
    readonly level?: number;
}

export interface SpeedValues {
    fanMode: MatterFanControl.FanMode;
    percentSetting: number | null;
    percentCurrent: number;
}

/** A Matter speed state a client asked for, after `IoFanControlServer` applied the Percent Rules. */
export interface SpeedTarget {
    readonly fanMode: MatterFanControl.FanMode;
    readonly percentSetting: number | null;
}

export type SpeedWrite =
    | { readonly state: 'power'; readonly value: boolean }
    | { readonly state: 'speed'; readonly value: FanSpeed }
    | { readonly state: 'level'; readonly value: number };

const OFF: SpeedValues = { fanMode: MatterFanControl.FanMode.Off, percentSetting: 0, percentCurrent: 0 };

/** The device speed steps from slow to fast. AUTO is no step. */
const SPEED_STEPS: readonly FanSpeed[] = [FanSpeed.Quiet, FanSpeed.Low, FanSpeed.Medium, FanSpeed.High, FanSpeed.Turbo];

/** The Matter steps for one, two and three device steps. */
const MATTER_STEPS: readonly (readonly MatterFanControl.FanMode[])[] = [
    [MatterFanControl.FanMode.High],
    [MatterFanControl.FanMode.Low, MatterFanControl.FanMode.High],
    [MatterFanControl.FanMode.Low, MatterFanControl.FanMode.Medium, MatterFanControl.FanMode.High],
];

/** The running level {@link FanSpeedModel} tests its rules with. */
const SAMPLE_LEVEL = 50;

interface SpeedSteps {
    /** The Matter step each device step is shown as. */
    readonly fanModes: ReadonlyMap<FanSpeed, MatterFanControl.FanMode>;
    /** The device step a Matter step sets. */
    readonly speeds: ReadonlyMap<MatterFanControl.FanMode, FanSpeed>;
}

/**
 * The speed rules of one fan, see the class description of `FanControlMapping`: how the ioBroker values give FanMode,
 * PercentSetting and PercentCurrent ({@link derive}), and which ioBroker writes a client change needs ({@link plan}).
 *
 * The client write rules {@link offAllowed} and {@link manualSpeed} are not chosen per device kind but tested: a
 * FanMode is allowed only when the writes {@link plan} gives for it make {@link derive} return that FanMode again,
 * from each sample of values: power on, off and unknown; each listed SPEED value and no value; level unknown, 0 and
 * 50. So an accepted FanMode stays while the device takes the writes. PercentSetting can still move to the level
 * within the range of that FanMode, see {@link plan}.
 */
export class FanSpeedModel {
    readonly sequence: MatterFanControl.FanModeSequence;
    /** `IoFanControlServer.State.variableSpeed`: a SPEED_LEVEL state or at least two steps. */
    readonly variableSpeed: boolean;
    /** `IoFanControlServer.State.offAllowed` */
    readonly offAllowed: boolean;
    /** `IoFanControlServer.State.manualSpeed` */
    readonly manualSpeed: boolean;
    readonly #states: FanSpeedStates;
    readonly #steps: SpeedSteps;

    constructor(states: FanSpeedStates) {
        this.#states = states;
        this.#steps = speedStepsOf(states.speedModes);
        const auto = states.speedModes?.includes(FanSpeed.Auto) ?? false;
        this.sequence = fanModeSequenceFor(this.#steps.speeds.size, auto);
        this.variableSpeed = states.level || this.#steps.speeds.size >= 2;
        this.offAllowed = this.#canRun() && this.#alwaysReaches(MatterFanControl.FanMode.Off);
        const steps = MATTER_STEPS[this.#steps.speeds.size - 1] ?? [MatterFanControl.FanMode.High];
        this.manualSpeed = steps.every(fanMode => this.#alwaysReaches(fanMode));
    }

    /**
     * The speed attributes for `snapshot`, see the class description of `FanControlMapping`.
     *
     * @param snapshot the ioBroker values
     * @param current the Matter PercentSetting, kept while it lies in the range of the step
     */
    derive(snapshot: SpeedSnapshot, current: number | null): SpeedValues {
        const { FanMode } = MatterFanControl;
        const { level } = snapshot;
        const { power, partOfDevice } = this.#states;
        if (snapshot.power === false || (level === 0 && !partOfDevice)) {
            return OFF;
        }
        const listed = this.#listedFanMode(snapshot.speed);
        const running = power || partOfDevice || listed !== undefined || (level !== undefined && level > 0);
        if (!running) {
            return OFF;
        }
        const fanMode = listed ?? this.#unlistedSpeedFanMode(snapshot.speed, level);
        if (fanMode === FanMode.Auto) {
            return { fanMode, percentSetting: null, percentCurrent: level ?? 100 };
        }
        const kept = this.variableSpeed ? current : null;
        const percentSetting =
            percentSettingForFanMode(this.sequence, fanMode, level ?? kept) ?? percentForFanMode(fanMode);
        return { fanMode, percentSetting, percentCurrent: level ?? percentForFanMode(fanMode) };
    }

    /**
     * The ioBroker writes, in order, that bring a fan in `snapshot` to `target`; a value that already fits is not
     * written. SPEED_LEVEL is written when the client chose a percent, or when the level does not lie in the range of
     * the new step. A PercentSetting that a FanMode write alone gives (spec 4.4.6.3.1) counts as no chosen percent, so
     * a written percent that equals it is only written when the level lies outside the step.
     *
     * @param target the Matter values the client asked for
     * @param snapshot the ioBroker values before the writes
     * @param previousPercent the PercentSetting before the client change
     * @param runningLevel the level that starts a stand-alone fan whose level is 0 in Auto
     */
    plan(
        target: SpeedTarget,
        snapshot: SpeedSnapshot,
        previousPercent: number | null,
        runningLevel: number,
    ): SpeedWrite[] {
        const { FanMode } = MatterFanControl;
        const { fanMode } = target;
        const { power, speedModes, level: hasLevel, partOfDevice } = this.#states;
        const { level } = snapshot;
        const writes = new Array<SpeedWrite>();
        if (fanMode === FanMode.Off) {
            if (power) {
                if (snapshot.power !== false) {
                    writes.push({ state: 'power', value: false });
                }
            } else if (hasLevel) {
                writes.push({ state: 'level', value: 0 });
            }
            return writes;
        }
        if (snapshot.power === false) {
            writes.push({ state: 'power', value: true });
        }
        if (fanMode === FanMode.Auto && hasLevel && level === 0 && !partOfDevice) {
            writes.push({ state: 'level', value: runningLevel });
        }
        const speed = fanMode === FanMode.Auto ? this.#autoSpeed() : this.#steps.speeds.get(fanMode);
        if (speedModes !== undefined && speed !== undefined && this.#listedFanMode(snapshot.speed) !== fanMode) {
            writes.push({ state: 'speed', value: speed });
        }
        if (!hasLevel || fanMode === FanMode.Auto) {
            return writes;
        }
        const percent = target.percentSetting ?? percentForFanMode(fanMode);
        const levelInStep = level !== undefined && fanModeForPercent(this.sequence, level) === fanMode;
        const chosenPercent = percent !== percentSettingForFanMode(this.sequence, fanMode, previousPercent);
        if (level !== percent && (chosenPercent || !levelInStep)) {
            writes.push({ state: 'level', value: percent });
        }
        return writes;
    }

    /** `snapshot` after the device took `writes`. */
    static apply(snapshot: SpeedSnapshot, writes: readonly SpeedWrite[]): SpeedSnapshot {
        return writes.reduce<SpeedSnapshot>((values, write) => ({ ...values, [write.state]: write.value }), snapshot);
    }

    /** Whether a client write of `fanMode` reaches it from every combination of values the states can hold. */
    #alwaysReaches(fanMode: MatterFanControl.FanMode): boolean {
        return this.#possibleSnapshots().every(snapshot => {
            const before = this.derive(snapshot, null).percentSetting;
            const percentSetting = percentSettingForFanMode(this.sequence, fanMode, before);
            const writes = this.plan({ fanMode, percentSetting }, snapshot, before, SAMPLE_LEVEL);
            return this.derive(FanSpeedModel.apply(snapshot, writes), percentSetting).fanMode === fanMode;
        });
    }

    /** A fan that always shows Off has nothing a client could switch off. */
    #canRun(): boolean {
        return this.#possibleSnapshots().some(
            snapshot => this.derive(snapshot, null).fanMode !== MatterFanControl.FanMode.Off,
        );
    }

    #possibleSnapshots(): SpeedSnapshot[] {
        const { power, speedModes, level } = this.#states;
        const powers = power ? [true, false, undefined] : [undefined];
        const speeds = [undefined, ...(speedModes ?? [])];
        const levels = level ? [undefined, 0, SAMPLE_LEVEL] : [undefined];
        return powers.flatMap(power => speeds.flatMap(speed => levels.map(level => ({ power, speed, level }))));
    }

    #autoSpeed(): FanSpeed | undefined {
        return sequenceHasAuto(this.sequence) ? FanSpeed.Auto : undefined;
    }

    /** The FanMode of a running fan whose SPEED has no value or one the state does not list as a step. */
    #unlistedSpeedFanMode(speed: FanSpeed | undefined, level: number | undefined): MatterFanControl.FanMode {
        if (level !== undefined && level > 0) {
            return fanModeForPercent(this.sequence, level);
        }
        return speed === undefined && sequenceHasAuto(this.sequence)
            ? MatterFanControl.FanMode.Auto
            : MatterFanControl.FanMode.High;
    }

    /** The FanMode of a SPEED value the state lists; undefined for no value and for a value it does not list. */
    #listedFanMode(speed: FanSpeed | undefined): MatterFanControl.FanMode | undefined {
        if (speed === FanSpeed.Auto) {
            return sequenceHasAuto(this.sequence) ? MatterFanControl.FanMode.Auto : undefined;
        }
        return speed === undefined ? undefined : this.#steps.fanModes.get(speed);
    }
}

/** See the class description of `FanControlMapping`. */
function speedStepsOf(modes: readonly FanSpeed[] | undefined): SpeedSteps {
    const listed = SPEED_STEPS.filter(step => modes?.includes(step));
    // The first step of a group is the one its Matter step sets
    const groups = listed.map(step => [step]);
    if (groups.length > 3 && listed[0] === FanSpeed.Quiet) {
        const [quiet] = groups.splice(0, 1);
        groups[0].push(...quiet);
    }
    if (groups.length > 3) {
        const [turbo] = groups.splice(-1, 1);
        groups[groups.length - 1].push(...turbo);
    }
    const matterSteps = MATTER_STEPS[groups.length - 1] ?? [];
    const fanModes = new Map<FanSpeed, MatterFanControl.FanMode>();
    const speeds = new Map<MatterFanControl.FanMode, FanSpeed>();
    groups.forEach((group, index) => {
        const fanMode = matterSteps[index];
        speeds.set(fanMode, group[0]);
        group.forEach(step => fanModes.set(step, fanMode));
    });
    return { fanModes, speeds };
}
