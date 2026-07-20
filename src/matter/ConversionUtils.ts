/**
 * Shared value converters between ioBroker units and Matter's "hundredths" integer encoding
 * (centi-degrees Celsius, centi-percent relative humidity, ...).
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace MatterConverters {
    /** Matter hundredths (int) → ioBroker unit, rounded to 2 decimals. */
    export function fromMatterHundredths(value: number): number {
        return parseFloat((value / 100).toFixed(2));
    }

    /** ioBroker unit → Matter hundredths, rounded to an integer. */
    export function toMatterHundredthsRounded(value: number): number {
        return Math.round(value * 100);
    }

    /** ioBroker unit → Matter hundredths, unrounded. */
    export function toMatterHundredths(value: number): number {
        return value * 100;
    }
}
