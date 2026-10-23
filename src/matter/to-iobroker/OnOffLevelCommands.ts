import type { Endpoint } from '@matter/main';
import { LevelControlClient, OnOffClient } from '@matter/main/behaviors';
import type { LevelScale } from '../ConversionUtils';

/** The OnOff and LevelControl clusters of a remote Matter device, as {@link OnOffLevelCommands} uses them. */
export interface OnOffLevelTarget {
    /** OnOff as last reported by the device. */
    isOn(): boolean;
    /** CurrentLevel as last reported by the device. */
    currentLevel(): number | null | undefined;
    on(): Promise<void>;
    off(): Promise<void>;
    /** Sends MoveToLevel, also when the device is off; `transitionTime` is in 1/10 s, null for the device default. */
    moveToLevel(level: number, transitionTime: number | null): Promise<void>;
    /** Whether the LevelControl cluster has the OnOff feature, so the "with on/off" commands switch OnOff. */
    hasOnOffCoupling(): boolean;
    /** Sends MoveToLevelWithOnOff, which turns the device on first for a level above MinLevel. */
    moveToLevelWithOnOff(level: number, transitionTime: number | null): Promise<void>;
}

/** MinLevel and MaxLevel of a device. */
export interface LevelRange {
    min: number;
    max: number;
}

/**
 * Turns the ioBroker power and level states of a controlled Matter device into OnOff and LevelControl commands.
 * One instance owns both states, so the two cannot disagree about what "off" means.
 *
 * In ioBroker level 0 means off. In Matter off is OnOff false and CurrentLevel keeps its value, so the ioBroker level
 * always shows the device level and only the power state says whether the device is on:
 *
 * | ioBroker write | Device off                                       | Device on                              |
 * | -------------- | ------------------------------------------------ | -------------------------------------- |
 * | power true     | On                                               | On                                     |
 * | power false    | Off                                              | Off                                    |
 * | level 0        | Off, level state = device level                  | Off, level state = device level        |
 * | level > 0      | MoveToLevelWithOnOff, or On then MoveToLevel (*) | MoveToLevel (with the transition time) |
 *
 * (*) MoveToLevelWithOnOff is used for a level above MinLevel when the LevelControl cluster has the OnOff feature,
 * which couples the command to OnOff (Matter 1.6.1, Level Control cluster § 1.6.4.1.2). It turns the device on
 * before it moves (§ 1.6.7.6). In all other cases the device gets On first and MoveToLevel after it. Both orders keep
 * an On that restores a stored level, like the On of a pump (Device Library § 5.5.6.1, Table 4), from overwriting
 * the new level. A device that is off gets no transition time.
 *
 * A speaker passes "not muted" as power. The level is clamped to {@link levelRange}, which the converter sets from
 * the device's MinLevel and MaxLevel once they are known.
 */
export class OnOffLevelCommands {
    readonly #target: OnOffLevelTarget;
    readonly #scale: LevelScale;
    readonly #updateIoBrokerLevel: (percent: number) => Promise<void>;
    levelRange: LevelRange;

    /**
     * @param target the Matter device
     * @param scale percent to CurrentLevel conversion of the device type
     * @param updateIoBrokerLevel writes the level state with ack, without sending a command
     * @param levelRange initial MinLevel/MaxLevel, until the device reports its own
     */
    constructor(
        target: OnOffLevelTarget,
        scale: LevelScale,
        updateIoBrokerLevel: (percent: number) => Promise<void>,
        levelRange: LevelRange,
    ) {
        this.#target = target;
        this.#scale = scale;
        this.#updateIoBrokerLevel = updateIoBrokerLevel;
        this.levelRange = levelRange;
    }

    async setPower(on: boolean): Promise<void> {
        if (on) {
            await this.#target.on();
        } else {
            await this.#target.off();
        }
    }

    /**
     * @param percent the ioBroker level
     * @param transitionTime ioBroker transition time in ms; used only while the device is on
     */
    async setLevel(percent: number, transitionTime?: number | null): Promise<void> {
        if (percent === 0) {
            await this.#target.off();
            // The device level does not change, so no attribute report would confirm the ioBroker write
            const currentLevel = this.#target.currentLevel();
            if (typeof currentLevel === 'number') {
                await this.#updateIoBrokerLevel(this.#scale.toPercent(currentLevel));
            }
            return;
        }

        const level = Math.min(Math.max(this.#scale.fromPercent(percent), this.levelRange.min), this.levelRange.max);
        if (this.#target.isOn()) {
            await this.#target.moveToLevel(
                level,
                typeof transitionTime === 'number' ? Math.round(transitionTime / 100) : null,
            );
        } else if (level > this.levelRange.min && this.#target.hasOnOffCoupling()) {
            await this.#target.moveToLevelWithOnOff(level, null);
        } else {
            await this.#target.on();
            await this.#target.moveToLevel(level, null);
        }
    }
}

/**
 * The OnOff and LevelControl clusters of a remote endpoint as an {@link OnOffLevelTarget}.
 *
 * @param endpoint the client endpoint of the device
 * @param isOn OnOff as last reported by the device
 */
export function onOffLevelTargetOf(endpoint: Endpoint, isOn: () => boolean): OnOffLevelTarget {
    return {
        isOn,
        currentLevel: () => endpoint.maybeStateOf(LevelControlClient)?.currentLevel,
        on: async () => {
            await endpoint.commandsOf(OnOffClient)?.on();
        },
        off: async () => {
            await endpoint.commandsOf(OnOffClient)?.off();
        },
        moveToLevel: async (level, transitionTime) => {
            await endpoint.commandsOf(LevelControlClient)?.moveToLevel({
                level,
                transitionTime,
                optionsMask: { executeIfOff: true },
                optionsOverride: { executeIfOff: true },
            });
        },
        hasOnOffCoupling: () => endpoint.behaviors.typeFor(LevelControlClient)?.features.onOff ?? false,
        moveToLevelWithOnOff: async (level, transitionTime) => {
            await endpoint.commandsOf(LevelControlClient)?.moveToLevelWithOnOff({
                level,
                transitionTime,
                optionsMask: {},
                optionsOverride: {},
            });
        },
    };
}
