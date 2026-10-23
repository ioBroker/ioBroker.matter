import type { LevelScale } from '../ConversionUtils';

/** The ioBroker power and level states of a bridged device, as {@link OnOffLevelMapping} uses them. */
export interface IoBrokerOnOffLevelStates {
    /** Absent when the device has no power state. A speaker passes "not muted". */
    readonly power?: {
        get(): boolean;
        /** Absent when the power state cannot be written, e.g. a device with only an ACTUAL state. */
        readonly set?: (on: boolean) => Promise<void>;
    };
    /** Absent when the device has no level state. */
    readonly level?: {
        /** Percent; anything but a number means the state has no value. */
        get(): unknown;
        set(percent: number): Promise<void>;
    };
}

/** The OnOff and LevelControl state of the Matter endpoint that {@link OnOffLevelMapping} writes. */
export interface MatterOnOffLevelState {
    /** Writes OnOff; `value` is called when the write happens, so it gives the value at that time. */
    setOnOff(value: () => boolean): Promise<void>;
    currentLevel(): number | null | undefined;
    setCurrentLevel(level: number): Promise<void>;
}

/**
 * Maps the ioBroker power and level states of a bridged device to Matter OnOff and CurrentLevel and back. One
 * instance owns both states, so OnOff is always derived from both of them.
 *
 * In ioBroker level 0 means off. In Matter off is OnOff false and CurrentLevel keeps its value, so turning on
 * restores that level:
 *
 * | Change                 | Result                                                                          |
 * | ---------------------- | ------------------------------------------------------------------------------- |
 * | ioBroker power / level | OnOff = (power, or true without one) and (level > 0, or true without one)       |
 * | ioBroker level > 0     | CurrentLevel = level; a level 0 leaves CurrentLevel unchanged                   |
 * | Matter OnOff -> true   | power = true if writable; a level of 0 becomes the level the device turns on at |
 * | Matter OnOff -> false  | power = false if writable, otherwise level = 0                                  |
 * | Matter level command   | level = commanded level                                                         |
 *
 * The Matter OnOff rows are for changes of the OnOff attribute that this mapping did not write: On/Off/Toggle
 * commands, timers of the OnOff cluster and the on/off part of level commands "with on/off". A change to the
 * OnOff value the ioBroker states already give writes nothing, and a power state that already has the new value is
 * not written again. All ioBroker writes run one after the other in the order the changes arrive.
 *
 * The level a device turns on at is CurrentLevel. A CurrentLevel of 0 gives {@link LevelScale.onPercentForLevelZero}
 * (0 % when the scale has none), an unknown CurrentLevel gives 100 %. The On of a "with on/off" level command arrives
 * before its level, so at ioBroker level 0 the old level is written first and then the commanded one. A level state
 * without a value (null or not a number) does not turn the device off and does not set CurrentLevel. A speaker passes
 * "not muted" as power.
 */
export class OnOffLevelMapping {
    readonly #ioBroker: IoBrokerOnOffLevelStates;
    readonly #matter: MatterOnOffLevelState;
    readonly #scale: LevelScale;
    #power?: boolean;
    #level?: number;
    #ioBrokerWrites = Promise.resolve();

    constructor(ioBroker: IoBrokerOnOffLevelStates, matter: MatterOnOffLevelState, scale: LevelScale) {
        this.#ioBroker = ioBroker;
        this.#matter = matter;
        this.#scale = scale;
    }

    /** The OnOff value derived from the last known ioBroker power and level. */
    get onOff(): boolean {
        const power = this.#ioBroker.power === undefined || !!this.#power;
        const level = this.#level === undefined || this.#level > 0;
        return power && level;
    }

    /**
     * Reads both ioBroker states and writes OnOff and CurrentLevel. A device that starts without a level above 0 keeps
     * the stored CurrentLevel, or gets 100 % when there is none.
     */
    async initialize(): Promise<void> {
        this.#power = this.#ioBroker.power?.get();
        this.#level = levelValue(this.#ioBroker.level?.get());
        const wroteLevel = await this.#updateCurrentLevel();
        if (!wroteLevel && this.#ioBroker.level !== undefined && typeof this.#matter.currentLevel() !== 'number') {
            await this.#matter.setCurrentLevel(this.#scale.fromPercent(100));
        }
        await this.#writeOnOff();
    }

    async ioBrokerPowerChanged(on: boolean): Promise<void> {
        this.#power = on;
        await this.#writeOnOff();
    }

    /** @param value the new level state value; anything but a number means "no value" */
    async ioBrokerLevelChanged(value: unknown): Promise<void> {
        this.#level = levelValue(value);
        await this.#updateCurrentLevel();
        await this.#writeOnOff();
    }

    /**
     * Writes a change of the Matter OnOff attribute to ioBroker, see the table above.
     *
     * @param on the new OnOff value
     */
    async matterOnOffChanged(on: boolean): Promise<void> {
        if (on === this.onOff) {
            return;
        }
        const { power, level } = this.#ioBroker;
        const writes = new Array<Promise<void>>();
        if (power?.set !== undefined && this.#power !== on) {
            this.#power = on;
            const setPower = power.set;
            writes.push(this.#writeIoBroker(() => setPower(on)));
        }
        if (level !== undefined) {
            if (on && this.#level === 0) {
                const percent = this.#onPercent(this.#matter.currentLevel());
                if (percent > 0) {
                    this.#level = percent;
                    writes.push(this.#writeIoBroker(() => level.set(percent)));
                }
            } else if (!on && power?.set === undefined) {
                this.#level = 0;
                writes.push(this.#writeIoBroker(() => level.set(0)));
            }
        }
        await Promise.all(writes);
    }

    /**
     * Writes a Matter level command to ioBroker; the ioBroker device runs the transition. OnOff is written only when
     * the new level turns the derived value on or off, e.g. level 0 of a speaker or pump.
     *
     * @param level the CurrentLevel the command moves to
     * @param beforeLevelWrite runs right before the ioBroker level write, e.g. to write the transition time first
     */
    async matterLevelControlled(level: number, beforeLevelWrite?: () => Promise<void>): Promise<void> {
        const levelState = this.#ioBroker.level;
        if (levelState === undefined) {
            return;
        }
        const onOff = this.onOff;
        const percent = this.#scale.toPercent(level);
        this.#level = percent;
        const write = this.#writeIoBroker(async () => {
            await beforeLevelWrite?.();
            await levelState.set(percent);
        });
        if (this.onOff !== onOff) {
            await this.#writeOnOff();
        }
        await write;
    }

    async #writeOnOff(): Promise<void> {
        await this.#matter.setOnOff(() => this.onOff);
    }

    #onPercent(currentLevel: number | null | undefined): number {
        if (typeof currentLevel !== 'number') {
            return 100;
        }
        if (currentLevel === 0) {
            return this.#scale.onPercentForLevelZero ?? 0;
        }
        return this.#scale.toPercent(currentLevel);
    }

    /** Queues an ioBroker write behind the earlier ones. A failed write rejects its own promise only. */
    #writeIoBroker(write: () => Promise<void>): Promise<void> {
        const result = this.#ioBrokerWrites.then(write);
        this.#ioBrokerWrites = result.catch(() => undefined);
        return result;
    }

    /** Writes CurrentLevel for a level above 0 and returns whether it did. */
    async #updateCurrentLevel(): Promise<boolean> {
        const level = this.#level;
        if (level === undefined || level <= 0) {
            return false;
        }
        await this.#matter.setCurrentLevel(this.#scale.fromPercent(level));
        return true;
    }
}

function levelValue(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
