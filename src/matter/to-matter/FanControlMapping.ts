import { FanControl as MatterFanControl } from '@matter/main/clusters';
import { FanAirflowDirection, type FanSpeed, FanSwing } from '../../lib/devices/Fan';
import { sequenceHasAuto, type RockValues } from '../FanControlUtils';
import { FanSpeedModel, type SpeedSnapshot, type SpeedValues, type SpeedWrite } from './FanSpeedModel';

interface IoBrokerFanSpeedStates {
    readonly speed?: {
        /** The speeds the state lists; empty when the state lists none. */
        readonly modes: readonly FanSpeed[];
        get(): FanSpeed | undefined;
        set(speed: FanSpeed): Promise<void>;
    };
    readonly speedLevel?: {
        /** Percent; anything but a finite number means the state has no value. */
        get(): unknown;
        set(percent: number): Promise<void>;
    };
    readonly swing?: {
        /** The values the state lists; a boolean swing state lists none. */
        readonly modes: readonly unknown[];
        get(): unknown;
        set(swing: FanSwing | boolean): Promise<void>;
    };
    readonly airflowDirection?: {
        get(): unknown;
        set(direction: FanAirflowDirection): Promise<void>;
    };
}

/** The ioBroker states of a stand-alone fan; absent power means the fan has no power state. */
interface IoBrokerStandaloneFanStates extends IoBrokerFanSpeedStates {
    readonly power?: {
        get(): boolean | undefined;
        set(on: boolean): Promise<void>;
    };
    readonly deviceOn?: never;
}

/**
 * The ioBroker states of a fan that is part of a device that switches it, e.g. an air conditioner. The mapping never
 * sets its FanMode to Off, a client cannot switch the fan off, and PercentCurrent is 0 while `deviceOn` returns false.
 */
interface IoBrokerDeviceFanStates extends IoBrokerFanSpeedStates {
    readonly power?: never;
    readonly deviceOn: () => boolean;
}

/** The ioBroker states of a fan, or of the fan part of a device, as {@link FanControlMapping} uses them. */
export type IoBrokerFanStates = IoBrokerStandaloneFanStates | IoBrokerDeviceFanStates;

export interface FanControlValues {
    fanMode: MatterFanControl.FanMode;
    percentSetting: number | null;
    percentCurrent: number;
    rockSetting?: RockValues;
    airflowDirection?: MatterFanControl.AirflowDirection;
}

/** The FanControl state of the Matter endpoint that {@link FanControlMapping} writes. */
export interface MatterFanControlState {
    fanMode(): MatterFanControl.FanMode;
    percentSetting(): number | null;
    set(values: FanControlValues): Promise<void>;
    /** Writes OnOff from the ioBroker power state; absent when the endpoint shows the power state elsewhere or not. */
    setOnOff?(on: boolean): Promise<void>;
}

/** The FanControl attributes and settings to create an endpoint with, see {@link FanControlMapping.initialState}. */
export interface FanControlInitialState {
    fanMode: MatterFanControl.FanMode;
    percentSetting: number | null;
    percentCurrent: number;
    fanModeSequence: MatterFanControl.FanModeSequence;
    /** `IoFanControlServer.State.offAllowed` */
    offAllowed: boolean;
    /** `IoFanControlServer.State.variableSpeed` */
    variableSpeed: boolean;
    /** `IoFanControlServer.State.manualSpeed` */
    manualSpeed: boolean;
    rockSupport?: RockValues;
    airflowDirection?: MatterFanControl.AirflowDirection;
}

export interface FanControlLog {
    debug(message: string): void;
    info(message: string): void;
}

/**
 * Maps the ioBroker fan states of a bridged device or a device-mode device to the Matter FanControl cluster and back.
 * One instance owns FanMode, PercentSetting and PercentCurrent, so the three always follow the Percent Rules (spec
 * 4.4.6.3.1, 4.4.6.4). The client write rules are applied by `IoFanControlServer` before a write is accepted.
 *
 * Features come from what the states list: Auto (AUT) only when SPEED lists AUTO, Rocking only for a swing state that
 * can move. RockSupport has RockLeftRight for HORIZONTAL and RockUpDown for VERTICAL, and a boolean swing state or one
 * that only lists AUTO gets RockLeftRight.
 *
 * The steps SPEED lists besides AUTO, ordered QUIET < LOW < MEDIUM < HIGH < TURBO, give the Matter steps in that order,
 * so each Matter step sets exactly one device step:
 *
 * | SPEED lists      | Matter steps                              | FanModeSequence                   |
 * | ---------------- | ----------------------------------------- | --------------------------------- |
 * | no values        | High = HIGH                               | OffHigh                           |
 * | AUTO and no step | none; High is refused                     | OffHighAuto                       |
 * | 1 step           | High                                      | OffHigh / OffHighAuto             |
 * | 2 steps          | Low, High                                 | OffLowHigh / OffLowHighAuto       |
 * | 3 steps          | Low, Medium, High                         | OffLowMedHigh / OffLowMedHighAuto |
 * | 4 or 5 steps     | as for 3: QUIET joins the step above it, then TURBO the one below, until 3 remain |
 *
 * A step that joined another one is shown as that step, and Matter sets the first step of the group. This mapping uses
 * the PercentSetting ranges 0 = Off, 1..33 = Low, 34..66 = Medium, 67..100 = High; a step the sequence lacks joins the
 * High range.
 *
 * The speed rules live in {@link FanSpeedModel}. A listed SPEED value decides FanMode, so Matter shows the step the
 * device runs. SPEED_LEVEL gives PercentSetting only while the level lies in the range of that step, so FanMode and
 * PercentSetting cannot disagree. The first matching row gives the values. "Fan of a device" means states with
 * `deviceOn`. "Kept" means the current Matter PercentSetting, which only a fan with `variableSpeed` keeps:
 *
 * | ioBroker                       | FanMode                               | PercentSetting         | PercentCurrent  |
 * | ------------------------------ | ------------------------------------- | ---------------------- | --------------- |
 * | power false                    | Off                                   | 0                      | 0               |
 * | SPEED_LEVEL 0, stand-alone fan | Off                                   | 0                      | 0               |
 * | SPEED AUTO, listed             | Auto                                  | null                   | level, else 100 |
 * | SPEED step, listed             | Matter step, see above                | level or kept if in    | level, else     |
 * |                                |                                       | range, else 33/66/100  | 33/66/100       |
 * | SPEED_LEVEL > 0                | range of the level                    | level                  | level           |
 * | stand-alone fan without a      | Off                                   | 0                      | 0               |
 * | power state, nothing above     |                                       |                        |                 |
 * | SPEED without a value          | Auto with an Auto sequence, else High | null, or as for a step | as for a step   |
 * | SPEED value it does not list   | High                                  | as for a step          | as for a step   |
 *
 * For a fan of a device, PercentCurrent is then set to 0 while `deviceOn` returns false. A SPEED state whose values
 * are no known speed names lists no step, so it is treated like a SPEED value the state does not list.
 *
 * A client change writes only the ioBroker states that do not already fit it, in this order:
 *
 * | Client change          | ioBroker writes                                                                         |
 * | ---------------------- | --------------------------------------------------------------------------------------- |
 * | to Off                 | power false; without a power state SPEED_LEVEL 0                                        |
 * | to Auto                | power true if off; for a stand-alone fan whose level is 0 the last level above 0;       |
 * |                        | SPEED AUTO                                                                              |
 * | to a step or a percent | power true if off; the device step of the Matter step; SPEED_LEVEL = PercentSetting     |
 * |                        | when the client chose the percent or the level lies outside the range of the step       |
 * | OnOff                  | power                                                                                   |
 * | RockSetting            | swing                                                                                   |
 * | AirflowDirection       | airflow direction                                                                       |
 *
 * `IoFanControlServer` only accepts a FanMode these writes reach, see {@link FanSpeedModel}, so an accepted FanMode
 * stays while the device takes the writes.
 *
 * All ioBroker writes of this mapping run one after the other in the order the changes arrive. When the last queued
 * write ends, also after a failed one, the FanControl attributes and OnOff are derived from the ioBroker states again.
 * An ioBroker change that arrives while writes are queued is shown by that resync, and an earlier write cannot undo a
 * later client change in Matter.
 */
export class FanControlMapping {
    readonly #ioBroker: IoBrokerFanStates;
    readonly #matter: MatterFanControlState;
    readonly #log: FanControlLog;
    readonly #model: FanSpeedModel;
    readonly #rockSupport?: RockValues;
    #lastSpeed?: { fanMode: MatterFanControl.FanMode; percentSetting: number | null };
    /** The last level above 0, which starts a stand-alone fan in Auto whose level is 0. */
    #runningLevel = 100;
    #ioBrokerWrites = Promise.resolve();
    #queuedWrites = 0;

    constructor(ioBroker: IoBrokerFanStates, matter: MatterFanControlState, log: FanControlLog) {
        this.#ioBroker = ioBroker;
        this.#matter = matter;
        this.#log = log;

        this.#model = speedModelOf(ioBroker);
        this.#rockSupport = rockSupportOf(ioBroker);
    }

    /** The FanControl features of an endpoint for `ioBroker`, see the class description. */
    static featuresFor(ioBroker: IoBrokerFanStates): MatterFanControl.Feature[] {
        const features = new Array<MatterFanControl.Feature>();
        if (sequenceHasAuto(speedModelOf(ioBroker).sequence)) {
            features.push(MatterFanControl.Feature.Auto);
        }
        if (rockSupportOf(ioBroker) !== undefined) {
            features.push(MatterFanControl.Feature.Rocking);
        }
        if (ioBroker.airflowDirection !== undefined) {
            features.push(MatterFanControl.Feature.AirflowDirection);
        }
        return features;
    }

    /**
     * The FanControl state to create the endpoint with, with the speed values of the ioBroker states. RockSupport and
     * AirflowDirection have to be there from the start: AirflowDirection has no default and the RockSupport default 0
     * violates its "min 1" constraint.
     */
    get initialState(): FanControlInitialState {
        const { airflowDirection } = this.#ioBroker;
        const { sequence, offAllowed, variableSpeed, manualSpeed } = this.#model;
        return {
            ...this.#speedValues(null),
            fanModeSequence: sequence,
            offAllowed,
            variableSpeed,
            manualSpeed,
            ...(this.#rockSupport !== undefined ? { rockSupport: this.#rockSupport } : {}),
            ...(airflowDirection !== undefined
                ? { airflowDirection: this.#airflowDirectionToMatter(airflowDirection.get()) }
                : {}),
        };
    }

    /** Writes all FanControl attributes and OnOff from the ioBroker states. */
    async initialize(): Promise<void> {
        await this.#updateMatter();
    }

    /**
     * Writes all FanControl attributes and OnOff from the ioBroker states after one of them changed. While writes are
     * queued this writes nothing, the resync after the last write shows the change.
     */
    async ioBrokerChanged(): Promise<void> {
        if (this.#queuedWrites === 0) {
            await this.#updateMatter();
        }
    }

    /**
     * Writes a client change of FanMode or PercentSetting to ioBroker, see the table above. One client write can change
     * both attributes, so this is called for each of them and acts once per new pair of values.
     */
    async matterSpeedChanged(): Promise<void> {
        const fanMode = this.#matter.fanMode();
        const percentSetting = this.#matter.percentSetting();
        const last = this.#lastSpeed;
        if (last?.fanMode === fanMode && last.percentSetting === percentSetting) {
            return;
        }
        this.#lastSpeed = { fanMode, percentSetting };
        const previousPercent = last?.percentSetting ?? null;
        await this.#writeIoBroker(async () => {
            const writes = this.#model.plan(
                { fanMode, percentSetting },
                this.#snapshot(),
                previousPercent,
                this.#runningLevel,
            );
            for (const write of writes) {
                await this.#write(write);
            }
        });
    }

    /** Writes a client change of OnOff to the power state; does nothing for a fan without one. */
    async matterOnOffChanged(on: boolean): Promise<void> {
        const power = this.#ioBroker.power;
        if (power === undefined) {
            return;
        }
        await this.#writeIoBroker(() => power.set(on));
    }

    async matterRockSettingChanged(rockSetting: Partial<RockValues>): Promise<void> {
        const swing = this.#ioBroker.swing;
        if (swing === undefined) {
            return;
        }
        await this.#writeIoBroker(() => swing.set(this.#rockToSwing(rockSetting)));
    }

    async matterAirflowDirectionChanged(direction: MatterFanControl.AirflowDirection): Promise<void> {
        const airflowDirection = this.#ioBroker.airflowDirection;
        if (airflowDirection === undefined) {
            return;
        }
        await this.#writeIoBroker(() =>
            airflowDirection.set(
                direction === MatterFanControl.AirflowDirection.Reverse
                    ? FanAirflowDirection.Reverse
                    : FanAirflowDirection.Forward,
            ),
        );
    }

    async #updateMatter(): Promise<void> {
        const values: FanControlValues = { ...this.#speedValues(this.#matter.percentSetting()) };
        const { power, swing, airflowDirection } = this.#ioBroker;
        if (swing !== undefined && this.#rockSupport !== undefined) {
            values.rockSetting = this.#swingToRock(swing.get(), this.#rockSupport);
        }
        if (airflowDirection !== undefined) {
            values.airflowDirection = this.#airflowDirectionToMatter(airflowDirection.get());
        }
        await this.#matter.set(values);
        this.#lastSpeed = { fanMode: values.fanMode, percentSetting: values.percentSetting };
        if (power !== undefined) {
            await this.#matter.setOnOff?.(power.get() ?? true);
        }
    }

    /** @param current the Matter PercentSetting, see {@link FanSpeedModel.derive} */
    #speedValues(current: number | null): SpeedValues {
        const snapshot = this.#snapshot();
        if (snapshot.level !== undefined && snapshot.level > 0) {
            this.#runningLevel = snapshot.level;
        }
        const values = this.#model.derive(snapshot, current);
        return this.#ioBroker.deviceOn?.() === false ? { ...values, percentCurrent: 0 } : values;
    }

    #snapshot(): SpeedSnapshot {
        const { power, speed, speedLevel } = this.#ioBroker;
        return { power: power?.get(), speed: speed?.get(), level: percentValue(speedLevel?.get()) };
    }

    async #write(write: SpeedWrite): Promise<void> {
        const { power, speed, speedLevel } = this.#ioBroker;
        switch (write.state) {
            case 'power':
                return power?.set(write.value);
            case 'speed':
                return speed?.set(write.value);
            case 'level':
                return speedLevel?.set(write.value);
        }
    }

    #swingToRock(swing: unknown, support: RockValues): RockValues {
        const none = { rockLeftRight: false, rockUpDown: false, rockRound: false };
        if (swing === true || swing === FanSwing.Horizontal) {
            return { ...none, rockLeftRight: support.rockLeftRight };
        }
        if (swing === FanSwing.Vertical) {
            return { ...none, rockUpDown: support.rockUpDown };
        }
        if (swing === FanSwing.Auto) {
            this.#log.debug('Matter has no Auto swing, reporting the lowest supported rock direction');
            return support.rockLeftRight ? { ...none, rockLeftRight: true } : { ...none, rockUpDown: true };
        }
        return none;
    }

    #rockToSwing(rock: Partial<RockValues>): FanSwing | boolean {
        const rocking = !!(rock.rockLeftRight || rock.rockUpDown || rock.rockRound);
        if (!isEnumSwing(this.#ioBroker)) {
            return rocking;
        }
        if (!rocking) {
            return FanSwing.Stationary;
        }
        if (rock.rockLeftRight) {
            return this.#ioBroker.swing?.modes.includes(FanSwing.Horizontal) ? FanSwing.Horizontal : FanSwing.Auto;
        }
        return FanSwing.Vertical;
    }

    #airflowDirectionToMatter(direction: unknown): MatterFanControl.AirflowDirection {
        return direction === FanAirflowDirection.Reverse
            ? MatterFanControl.AirflowDirection.Reverse
            : MatterFanControl.AirflowDirection.Forward;
    }

    /**
     * Queues an ioBroker write behind the earlier ones. The last queued write, also a failed one, derives the Matter
     * state again before it settles. A failed write rejects its own promise, and so does the last one when that
     * derivation fails.
     */
    #writeIoBroker(write: () => Promise<void>): Promise<void> {
        this.#queuedWrites++;
        const result = this.#ioBrokerWrites.then(write);
        const settled = result
            .catch(() => undefined)
            .then(async () => {
                this.#queuedWrites--;
                if (this.#queuedWrites === 0) {
                    await this.#updateMatter();
                }
            });
        this.#ioBrokerWrites = settled.catch(() => undefined);
        return settled.then(() => result);
    }
}

function percentValue(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value)
        ? Math.round(Math.min(100, Math.max(0, value)))
        : undefined;
}

function speedModelOf(ioBroker: IoBrokerFanStates): FanSpeedModel {
    return new FanSpeedModel({
        power: ioBroker.power !== undefined,
        speedModes: ioBroker.speed?.modes,
        level: ioBroker.speedLevel !== undefined,
        partOfDevice: ioBroker.deviceOn !== undefined,
    });
}

/** Only the enum swing state lists modes; the boolean one lists none. */
function isEnumSwing(ioBroker: IoBrokerFanStates): boolean {
    return (ioBroker.swing?.modes ?? []).some(mode => typeof mode === 'string');
}

/** Undefined when the device has no swing state that can move. */
function rockSupportOf(ioBroker: IoBrokerFanStates): RockValues | undefined {
    const modes = ioBroker.swing?.modes;
    if (modes === undefined) {
        return undefined;
    }
    if (!isEnumSwing(ioBroker)) {
        return { rockLeftRight: true, rockUpDown: false, rockRound: false };
    }
    const horizontal = modes.includes(FanSwing.Horizontal);
    const vertical = modes.includes(FanSwing.Vertical);
    const autoOnly = !horizontal && !vertical && modes.includes(FanSwing.Auto);
    if (!horizontal && !vertical && !autoOnly) {
        return undefined;
    }
    return { rockLeftRight: horizontal || autoOnly, rockUpDown: vertical, rockRound: false };
}
