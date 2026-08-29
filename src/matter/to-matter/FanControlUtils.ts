import { FanControl as MatterFanControl } from '@matter/main/clusters';
import { AirConditionerSpeed } from '../../lib/devices/AirCondition';

/**
 * Matter's `FanMode` has no Quiet or Turbo step, so both fold onto the nearest one they degrade to.
 * `reportDegraded` lets the caller decide how loudly to say so — a fan changes speed far more often
 * than an air conditioner does.
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

/** `Off` has no speed of its own — the caller turns the device off instead. */
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
