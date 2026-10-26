/**
 * Shared value converters between ioBroker units and Matter attribute encodings: the "hundredths" integer encoding
 * (centi-degrees Celsius, centi-percent relative humidity, ...) and the LevelControl CurrentLevel scales of lights,
 * speakers and pumps.
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace MatterConverters {
    /** Matter hundredths (int) → ioBroker unit, rounded to 2 decimals. */
    export function fromMatterHundredths(value: number): number {
        return parseFloat((value / 100).toFixed(2));
    }

    /**
     * ioBroker unit → Matter hundredths. Matter cluster fields using this encoding are integer types,
     * so the result is rounded to avoid IEEE754 artifacts (e.g. 0.1 * 100 = 10.000000000000002).
     */
    export function toMatterHundredths(value: number): number {
        return Math.round(value * 100);
    }

    /**
     * ioBroker unit → Matter thousandths (mW, mA, mV, mHz, mWh). The attributes are integers, so the value is
     * rounded; matter.js would keep a fraction in the attribute and cut it off when it encodes the report.
     */
    export function toMatterThousandths(value: number): number {
        return Math.round(value * 1000);
    }

    /**
     * ioBroker measurement → nullable Matter measurement attribute. A value that is not a finite number (null, a
     * missing state, a non-numeric string) is unknown and becomes null, which is what the measurement clusters
     * define null to mean; it is never converted into a number.
     */
    export function toMatterMeasurement<T>(value: unknown, convert: (value: number) => T): T | null {
        return typeof value === 'number' && Number.isFinite(value) ? convert(value) : null;
    }

    /**
     * ioBroker battery percent → PowerSource BatPercentRemaining, which counts half percent in 0..200 and is null
     * when the charge is unknown (Matter 1.6.1 Core 11.7.7.13). A percent outside 0..100 is limited to that range,
     * because matter.js rejects a value above 200 and the endpoint would not start.
     */
    export function toMatterBatPercentRemaining(percent: unknown): number | null {
        return toMatterMeasurement(percent, value => Math.round(Math.min(Math.max(value, 0), 100) * 2));
    }
}

/**
 * Conversion between an ioBroker percent and a LevelControl CurrentLevel; {@link LightingLevel} and
 * {@link PumpLevel} implement it.
 */
export interface LevelScale {
    toPercent(level: number): number;
    fromPercent(percent: number): number;
    /** The percent an On starts from when CurrentLevel is 0; absent when level 0 is a level the device runs at. */
    readonly onPercentForLevelZero?: number;
}

/**
 * LevelControl CurrentLevel scale of lights and speakers, as integer ioBroker percent.
 *
 * With the Lighting feature, MinLevel SHALL be 1 and MaxLevel SHALL be 254 (Matter 1.6.1, Level Control cluster
 * § 1.6.6.4/1.6.6.5). This adapter uses the same scale for the volume of speakers. The Speaker's LevelControl has
 * no Lighting feature, so its MinLevel is 0 and a controller can send level 0, which reads as 0 %.
 *
 * | Direction        | Input   | Output                                    |
 * | ---------------- | ------- | ----------------------------------------- |
 * | `toPercent`      | 0       | 0 (level 0 only exists without Lighting)  |
 * | `toPercent`      | 1..254  | 1..100                                    |
 * | `fromPercent`    | 0..100  | 1..254 (0 % gives MIN)                    |
 *
 * Both directions round to the nearest value, but never map a non-zero value to 0 or to off: in ioBroker 0 means
 * off, in Matter off is the OnOff attribute and level 1 is the dimmest on state. An ioBroker 0 therefore becomes
 * OnOff false with CurrentLevel unchanged, see `OnOffLevelMapping` and `OnOffLevelCommands`. Every integer
 * percent from 1 to 100 survives `toPercent(fromPercent(p))`; a level does not, because 254 levels share 100 percent
 * values (levels 1 and 2 both read as 1 %, which writes back as level 3), but the result is stable after one round
 * trip.
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace LightingLevel {
    export const MIN = 1;
    export const MAX = 254;

    /** Matter CurrentLevel → integer percent; level 0 (only valid outside the Lighting feature) gives 0. */
    export function toPercent(level: number): number {
        if (level <= 0) {
            return 0;
        }
        return Math.max(Math.round((level / MAX) * 100), 1);
    }

    /** Percent → Matter CurrentLevel in MIN..MAX. 0 gives MIN, because off is not a level. */
    export function fromPercent(percent: number): number {
        return Math.min(Math.max(Math.round((percent / 100) * MAX), MIN), MAX);
    }

    /**
     * Percent → StartUpCurrentLevel. Unlike {@link fromPercent}, 0 stays 0, which StartUpCurrentLevel defines as
     * "the minimum value permitted on the device" (Matter 1.6.1, Level Control cluster § 1.6.6.15); null keeps
     * its meaning "the previous value".
     */
    export function startUpFromPercent(percent: number | null): number | null {
        return percent === null || percent === 0 ? percent : fromPercent(percent);
    }

    /** StartUpCurrentLevel → percent; null ("previous value") stays null. */
    export function startUpToPercent(level: number | null): number | null {
        return level === null ? null : toPercent(level);
    }
}

/**
 * LevelControl CurrentLevel scale of the Pump device type (Matter 1.6.1 Device Library § 5.5.6.2, Table 5
 * "Relationship between Level and Setpoint"):
 *
 * | Level   | Setpoint               | Meaning                         |
 * | ------- | ---------------------- | ------------------------------- |
 * | 0       | N/A                    | Pump is stopped.                |
 * | 1–200   | Level / 2 (0.5–100.0%) | Pump setpoint in percent.       |
 * | 201–255 | 100.0%                 | Pump setpoint is 100.0%         |
 *
 * The ioBroker percent keeps the 0.5 % resolution of the spec, so it is not always an integer. A non-zero percent
 * never maps to the stopped level 0.
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace PumpLevel {
    export const STOPPED = 0;
    export const FULL_SPEED = 200;
    /**
     * Off keeps CurrentLevel (Device Library § 5.5.6.1, Table 4: "store the current level"), so a CurrentLevel of 0
     * means the pump was stopped by level 0, not by Off. An On then moves to the maximum, as Table 4 does when no
     * level is stored.
     */
    export const onPercentForLevelZero = 100;

    /** Matter CurrentLevel → percent in 0.5 steps; 201..255 give 100. */
    export function toPercent(level: number): number {
        return (Math.min(level, FULL_SPEED) * 100) / FULL_SPEED;
    }

    /** Percent → Matter CurrentLevel in STOPPED..FULL_SPEED. */
    export function fromPercent(percent: number): number {
        if (percent <= 0) {
            return STOPPED;
        }
        return Math.min(Math.max(Math.round((percent / 100) * FULL_SPEED), 1), FULL_SPEED);
    }
}
