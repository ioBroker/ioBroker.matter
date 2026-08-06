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

    /**
     * ioBroker unit → Matter hundredths. Matter cluster fields using this encoding are integer types,
     * so the result is rounded to avoid IEEE754 artifacts (e.g. 0.1 * 100 = 10.000000000000002).
     */
    export function toMatterHundredths(value: number): number {
        return Math.round(value * 100);
    }
}
