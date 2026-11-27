import { FanControl as MatterFanControl } from '@matter/main/clusters';
import { AirConditionerSpeed } from '../lib/devices/AirCondition';

/**
 * The fixed SPEED to FanMode mapping of paired (controller) devices. Matter's `FanMode` has no Quiet or Turbo step,
 * so both fold onto the nearest one they degrade to. `reportDegraded` lets the caller decide how loudly to say so — a
 * fan changes speed far more often than an air conditioner does.
 */
export function mapSpeedToFanMode(
    speed: AirConditionerSpeed | undefined,
    reportDegraded?: (speed: AirConditionerSpeed, reportedAs: string) => void,
): MatterFanControl.FanMode | undefined {
    switch (speed) {
        case AirConditionerSpeed.Auto:
            return MatterFanControl.FanMode.Auto;
        case AirConditionerSpeed.Low:
            return MatterFanControl.FanMode.Low;
        case AirConditionerSpeed.Quiet:
            reportDegraded?.(speed, 'Low');
            return MatterFanControl.FanMode.Low;
        case AirConditionerSpeed.Medium:
            return MatterFanControl.FanMode.Medium;
        case AirConditionerSpeed.High:
            return MatterFanControl.FanMode.High;
        case AirConditionerSpeed.Turbo:
            reportDegraded?.(speed, 'High');
            return MatterFanControl.FanMode.High;
    }
}

/**
 * The fixed FanMode to SPEED mapping of paired (controller) devices. `Off` has no speed of its own — the caller turns
 * the device off instead.
 */
export function mapFanModeToSpeed(fanMode: MatterFanControl.FanMode): AirConditionerSpeed | undefined {
    switch (fanMode) {
        case MatterFanControl.FanMode.Auto:
        case MatterFanControl.FanMode.Smart:
            return AirConditionerSpeed.Auto;
        case MatterFanControl.FanMode.Low:
            return AirConditionerSpeed.Low;
        case MatterFanControl.FanMode.Medium:
            return AirConditionerSpeed.Medium;
        case MatterFanControl.FanMode.High:
        case MatterFanControl.FanMode.On:
            return AirConditionerSpeed.High;
        case MatterFanControl.FanMode.Off:
            return undefined;
    }
}

/**
 * The FanModeSequence (spec 4.4.5.6) this implementation offers for a fan with `steps` speed steps besides Off: one
 * step is High, two are Low and High, three or more are Low, Medium and High.
 */
export function fanModeSequenceFor(steps: number, auto: boolean): MatterFanControl.FanModeSequence {
    const { FanModeSequence } = MatterFanControl;
    if (steps >= 3) {
        return auto ? FanModeSequence.OffLowMedHighAuto : FanModeSequence.OffLowMedHigh;
    }
    if (steps === 2) {
        return auto ? FanModeSequence.OffLowHighAuto : FanModeSequence.OffLowHigh;
    }
    return auto ? FanModeSequence.OffHighAuto : FanModeSequence.OffHigh;
}

/**
 * Whether FanMode may hold `fanMode` under `sequence` (spec 4.4.6.1): Low only for a sequence below 4, Medium only
 * for 0 and 2, Auto only for the Auto sequences. On and Smart are never stored, see {@link normalizeFanModeWrite}.
 */
export function isFanModeInSequence(
    sequence: MatterFanControl.FanModeSequence,
    fanMode: MatterFanControl.FanMode,
): boolean {
    const { FanMode, FanModeSequence } = MatterFanControl;
    switch (fanMode) {
        case FanMode.Off:
        case FanMode.High:
            return true;
        case FanMode.Low:
            return sequence < FanModeSequence.OffHighAuto;
        case FanMode.Medium:
            return sequence === FanModeSequence.OffLowMedHigh || sequence === FanModeSequence.OffLowMedHighAuto;
        case FanMode.Auto:
            return sequenceHasAuto(sequence);
        default:
            return false;
    }
}

export function sequenceHasAuto(sequence: MatterFanControl.FanModeSequence): boolean {
    const { FanModeSequence } = MatterFanControl;
    return (
        sequence === FanModeSequence.OffLowMedHighAuto ||
        sequence === FanModeSequence.OffLowHighAuto ||
        sequence === FanModeSequence.OffHighAuto
    );
}

/**
 * The FanMode a client write of `fanMode` stores (spec 4.4.6.1.3, 4.4.6.1.4): On becomes High, Smart becomes Auto
 * when the sequence has Auto and High otherwise. Returns undefined for a mode outside the sequence, which the write
 * must answer with CONSTRAINT_ERROR.
 */
export function normalizeFanModeWrite(
    sequence: MatterFanControl.FanModeSequence,
    fanMode: MatterFanControl.FanMode,
): MatterFanControl.FanMode | undefined {
    const { FanMode } = MatterFanControl;
    if (fanMode === FanMode.On) {
        return FanMode.High;
    }
    if (fanMode === FanMode.Smart) {
        return sequenceHasAuto(sequence) ? FanMode.Auto : FanMode.High;
    }
    return isFanModeInSequence(sequence, fanMode) ? fanMode : undefined;
}

/**
 * The FanMode whose PercentSetting range holds `percent` (spec 4.4.6.3.1 only gives example ranges). This
 * implementation uses 0 = Off, 1..33 = Low, 34..66 = Medium and 67..100 = High; a step the sequence lacks joins the
 * High range, so the ranges stay contiguous and ascending. Auto has the null range, which this never returns.
 */
export function fanModeForPercent(
    sequence: MatterFanControl.FanModeSequence,
    percent: number,
): MatterFanControl.FanMode {
    const { FanMode } = MatterFanControl;
    if (percent <= 0) {
        return FanMode.Off;
    }
    if (percent <= 33 && isFanModeInSequence(sequence, FanMode.Low)) {
        return FanMode.Low;
    }
    if (percent <= 66 && isFanModeInSequence(sequence, FanMode.Medium)) {
        return FanMode.Medium;
    }
    return FanMode.High;
}

/** The highest PercentSetting of a step's range, used when nothing finer than the step is known. */
export function percentForFanMode(fanMode: MatterFanControl.FanMode): number {
    switch (fanMode) {
        case MatterFanControl.FanMode.Off:
            return 0;
        case MatterFanControl.FanMode.Low:
            return 33;
        case MatterFanControl.FanMode.Medium:
            return 66;
        default:
            return 100;
    }
}

/**
 * The PercentSetting that goes with `fanMode` (spec 4.4.6.1.1, 4.4.6.1.2, 4.4.6.3.1): 0 for Off, null for Auto, and
 * otherwise `current` while it lies in the range of `fanMode`, else {@link percentForFanMode}.
 */
export function percentSettingForFanMode(
    sequence: MatterFanControl.FanModeSequence,
    fanMode: MatterFanControl.FanMode,
    current: number | null,
): number | null {
    if (fanMode === MatterFanControl.FanMode.Auto) {
        return null;
    }
    if (current !== null && fanModeForPercent(sequence, current) === fanMode) {
        return current;
    }
    return percentForFanMode(fanMode);
}

export type RockValues = { rockLeftRight: boolean; rockUpDown: boolean; rockRound: boolean };

const ROCK_BITS = ['rockLeftRight', 'rockUpDown', 'rockRound'] as const;

/**
 * The RockSetting a client write of `setting` stores (spec 4.4.6.9), for a device that rocks in one direction at a
 * time: a combination of supported bits keeps the lowest of them. Returns undefined when a bit is set that `support`
 * lacks, which the write must answer with CONSTRAINT_ERROR.
 */
export function normalizeRockSettingWrite(
    support: Partial<RockValues>,
    setting: Partial<RockValues>,
): RockValues | undefined {
    const set = ROCK_BITS.filter(bit => setting[bit]);
    if (set.some(bit => !support[bit])) {
        return undefined;
    }
    const lowest = set[0];
    return {
        rockLeftRight: lowest === 'rockLeftRight',
        rockUpDown: lowest === 'rockUpDown',
        rockRound: lowest === 'rockRound',
    };
}
