/**
 * Conversion maps for readings whose canonical unit is fixed by the Matter cluster on the other side, but whose
 * ioBroker object may declare any unit a real device or adapter uses. Shared because more than one device class
 * (Pressure, AirQuality, Pump) exposes the same kind of reading.
 */

export type UnitConversionMap = { [key: string]: (value: number, toDefaultUnit: boolean) => number };

/**
 * Scales a value from an alternate unit into the canonical one (`toDefaultUnit`===true) and back. `factor` is the
 * ratio of the alternate unit to the canonical one, e.g. 10 for `kPa` when the canonical unit is `mbar`.
 */
export const scale =
    (factor: number) =>
    (value: number, toDefaultUnit: boolean): number =>
        toDefaultUnit ? value * factor : value / factor;

/** Canonical unit for pressure readings: Matter's PressureMeasurement MeasuredValue = 10 x kPa, and 1 kPa = 10 mbar, so the wire value equals the mbar reading. */
export const PRESSURE_UNIT = 'mbar';

/**
 * mbar and hPa are the same unit under different names. Pa, kPa and bar scale by powers of ten. mmHg, inHg and
 * psi come from barometric (weather-station) and industrial (pump/water-system) pressure sensors, each derived
 * from its own exact SI definition: 1 mmHg = 133.322387415 Pa, 1 inHg = 25.4 mm of mercury = 3386.38879... Pa,
 * and 1 psi = 6894.75729316836 Pa.
 */
export const PRESSURE_CONVERSION_MAP: UnitConversionMap = {
    Pa: scale(0.01),
    hPa: scale(1),
    kPa: scale(10),
    bar: scale(1000),
    mmHg: scale(1.3332239),
    inHg: scale(33.863886),
    psi: scale(68.947573),
};

/** Canonical unit for flow readings: Matter's FlowMeasurement MeasuredValue = 10 x m³/h, matching the type-detector's own default. */
export const FLOW_UNIT = 'm³/h';

/**
 * l/min, l/h and l/s scale into m³/h via the litres-per-m³ factor (1000) combined with the time-unit factor.
 * The ASCII spelling `m3/h` is accepted alongside the superscript one, since ioBroker objects are not
 * consistent about which one they declare.
 */
export const FLOW_CONVERSION_MAP: UnitConversionMap = {
    'l/min': scale(0.06),
    'l/h': scale(0.001),
    'l/s': scale(3.6),
    'm3/h': scale(1),
};
