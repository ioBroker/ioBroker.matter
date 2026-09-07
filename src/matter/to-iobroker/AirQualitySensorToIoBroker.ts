import ChannelDetector from '@iobroker/type-detector';
import type { Behavior, ClusterId, Endpoint, ClientNode } from '@matter/main';
import {
    AirQuality as MatterAirQuality,
    CarbonDioxideConcentrationMeasurement,
    CarbonMonoxideConcentrationMeasurement,
    ConcentrationMeasurement,
    FormaldehydeConcentrationMeasurement,
    NitrogenDioxideConcentrationMeasurement,
    OnOff as MatterOnOff,
    OzoneConcentrationMeasurement,
    Pm1ConcentrationMeasurement,
    Pm10ConcentrationMeasurement,
    Pm25ConcentrationMeasurement,
    PressureMeasurement,
    RadonConcentrationMeasurement,
    RelativeHumidityMeasurement,
    TemperatureMeasurement,
    TotalVolatileOrganicCompoundsConcentrationMeasurement,
} from '@matter/main/clusters';
import {
    CarbonDioxideConcentrationMeasurementClient,
    CarbonMonoxideConcentrationMeasurementClient,
    FormaldehydeConcentrationMeasurementClient,
    NitrogenDioxideConcentrationMeasurementClient,
    OnOffClient,
    OzoneConcentrationMeasurementClient,
    Pm1ConcentrationMeasurementClient,
    Pm10ConcentrationMeasurementClient,
    Pm25ConcentrationMeasurementClient,
    RadonConcentrationMeasurementClient,
    TotalVolatileOrganicCompoundsConcentrationMeasurementClient,
} from '@matter/main/behaviors';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { DetectedDevice, DeviceOptions } from '../../lib/devices/GenericDevice';
import { AirQuality, AirQualityIndex, PollutantLevel } from '../../lib/devices/AirQuality';
import { GenericDeviceToIoBroker } from './GenericDeviceToIoBroker';
import type { MatterAdapter } from '../../main';
import { MatterConverters } from '../ConversionUtils';

/**
 * Canonical unit an ioBroker pollutant state is written in. `ppm`/`µg/m³`/`Bq/m³` are the type-detector
 * `airQuality` pattern's declared defaults; TVOC, NO2 and O3 have no declared default there because devices
 * legitimately differ, so `ppb` is used for them instead - the same convention the Matter-bridge side of this
 * adapter already assumes for the same three gases (see AirQualityToMatter.ts).
 */
type ConcentrationTarget = 'ppm' | 'ppb' | 'ugm3' | 'bqm3';

/** Minimal shape shared by every concentration-measurement Client behavior, enough to read the optional unit. */
interface ConcentrationClientType extends Behavior.Type {
    readonly State: new () => {
        measurementUnit?: ConcentrationMeasurement.MeasurementUnit;
    };
}

const { Ppm, Ppb, Ppt, Mgm3, Ugm3, Ngm3, Pm3, Bqm3 } = ConcentrationMeasurement.MeasurementUnit;

const CONCENTRATION_UNIT_LABELS: ReadonlyMap<ConcentrationMeasurement.MeasurementUnit, string> = new Map([
    [Ppm, 'ppm'],
    [Ppb, 'ppb'],
    [Ppt, 'ppt'],
    [Mgm3, 'mg/m³'],
    [Ugm3, 'µg/m³'],
    [Ngm3, 'ng/m³'],
    [Pm3, 'p/m³'],
    [Bqm3, 'Bq/m³'],
]);

/**
 * Multiplier from a reported unit into a pollutant's canonical unit, keyed by that canonical unit. ppm/ppb/ppt
 * scale into each other by powers of 1000, as do mg/µg/ng per m³, but crossing from one family to the other
 * needs the substance's molar mass and is not attempted - a unit outside the target's family is left out of its
 * map on purpose so the lookup fails and the reading is dropped instead of being scaled by the wrong factor.
 */
const CONCENTRATION_CONVERSION: Readonly<
    Record<ConcentrationTarget, ReadonlyMap<ConcentrationMeasurement.MeasurementUnit, number>>
> = {
    ppm: new Map([
        [Ppm, 1],
        [Ppb, 1e-3],
        [Ppt, 1e-6],
    ]),
    ppb: new Map([
        [Ppm, 1e3],
        [Ppb, 1],
        [Ppt, 1e-3],
    ]),
    ugm3: new Map([
        [Mgm3, 1e3],
        [Ugm3, 1],
        [Ngm3, 1e-3],
    ]),
    bqm3: new Map([[Bqm3, 1]]),
};

interface PollutantMapping {
    readonly clusterId: ClusterId;
    readonly concentrationProperty: PropertyType;
    readonly levelProperty: PropertyType;
    readonly client: ConcentrationClientType;
    readonly target: ConcentrationTarget;
}

/** Matter defines no sulphur dioxide concentration cluster, so the ioBroker SO2 states stay unmapped. */
const POLLUTANT_MAPPINGS: readonly PollutantMapping[] = [
    {
        clusterId: CarbonDioxideConcentrationMeasurement.id,
        concentrationProperty: PropertyType.Co2,
        levelProperty: PropertyType.Co2Level,
        client: CarbonDioxideConcentrationMeasurementClient,
        target: 'ppm',
    },
    {
        clusterId: TotalVolatileOrganicCompoundsConcentrationMeasurement.id,
        concentrationProperty: PropertyType.Tvoc,
        levelProperty: PropertyType.TvocLevel,
        client: TotalVolatileOrganicCompoundsConcentrationMeasurementClient,
        target: 'ppb',
    },
    {
        clusterId: Pm1ConcentrationMeasurement.id,
        concentrationProperty: PropertyType.Pm1,
        levelProperty: PropertyType.Pm1Level,
        client: Pm1ConcentrationMeasurementClient,
        target: 'ugm3',
    },
    {
        clusterId: Pm25ConcentrationMeasurement.id,
        concentrationProperty: PropertyType.Pm25,
        levelProperty: PropertyType.Pm25Level,
        client: Pm25ConcentrationMeasurementClient,
        target: 'ugm3',
    },
    {
        clusterId: Pm10ConcentrationMeasurement.id,
        concentrationProperty: PropertyType.Pm10,
        levelProperty: PropertyType.Pm10Level,
        client: Pm10ConcentrationMeasurementClient,
        target: 'ugm3',
    },
    {
        clusterId: CarbonMonoxideConcentrationMeasurement.id,
        concentrationProperty: PropertyType.Co,
        levelProperty: PropertyType.CoLevel,
        client: CarbonMonoxideConcentrationMeasurementClient,
        target: 'ppm',
    },
    {
        clusterId: NitrogenDioxideConcentrationMeasurement.id,
        concentrationProperty: PropertyType.No2,
        levelProperty: PropertyType.No2Level,
        client: NitrogenDioxideConcentrationMeasurementClient,
        target: 'ppb',
    },
    {
        clusterId: OzoneConcentrationMeasurement.id,
        concentrationProperty: PropertyType.O3,
        levelProperty: PropertyType.O3Level,
        client: OzoneConcentrationMeasurementClient,
        target: 'ppb',
    },
    {
        clusterId: FormaldehydeConcentrationMeasurement.id,
        concentrationProperty: PropertyType.Ch2o,
        levelProperty: PropertyType.Ch2oLevel,
        client: FormaldehydeConcentrationMeasurementClient,
        target: 'ugm3',
    },
    {
        clusterId: RadonConcentrationMeasurement.id,
        concentrationProperty: PropertyType.Rn,
        levelProperty: PropertyType.RnLevel,
        client: RadonConcentrationMeasurementClient,
        target: 'bqm3',
    },
];

export class AirQualitySensorToIoBroker extends GenericDeviceToIoBroker {
    readonly #ioBrokerDevice: AirQuality;

    constructor(
        node: ClientNode,
        endpoint: Endpoint,
        rootEndpoint: Endpoint,
        adapter: MatterAdapter,
        endpointDeviceBaseId: string,
        deviceTypeName: string,
        defaultConnectionStateId: string,
        defaultName: string,
    ) {
        super(
            adapter,
            node,
            endpoint,
            rootEndpoint,
            endpointDeviceBaseId,
            deviceTypeName,
            defaultConnectionStateId,
            defaultName,
        );

        this.#ioBrokerDevice = new AirQuality(
            { ...ChannelDetector.getPatterns().airQuality, isIoBrokerDevice: false } as DetectedDevice,
            adapter,
            this.enableDeviceTypeStates(),
        );
    }

    /** The AirQualityEnum and the ioBroker index enumerate the same seven steps in the same order. */
    #toIoBrokerAirQuality(value: MatterAirQuality.AirQualityEnum): AirQualityIndex {
        switch (value) {
            case MatterAirQuality.AirQualityEnum.Good:
                return AirQualityIndex.Good;
            case MatterAirQuality.AirQualityEnum.Fair:
                return AirQualityIndex.Fair;
            case MatterAirQuality.AirQualityEnum.Moderate:
                return AirQualityIndex.Moderate;
            case MatterAirQuality.AirQualityEnum.Poor:
                return AirQualityIndex.Poor;
            case MatterAirQuality.AirQualityEnum.VeryPoor:
                return AirQualityIndex.VeryPoor;
            case MatterAirQuality.AirQualityEnum.ExtremelyPoor:
                return AirQualityIndex.ExtremelyPoor;
            default:
                return AirQualityIndex.Unknown;
        }
    }

    /** The cluster LevelValue and the ioBroker pollutant level enumerate the same five steps in the same order. */
    #toIoBrokerLevel(value: ConcentrationMeasurement.LevelValue): PollutantLevel {
        switch (value) {
            case ConcentrationMeasurement.LevelValue.Low:
                return PollutantLevel.Low;
            case ConcentrationMeasurement.LevelValue.Medium:
                return PollutantLevel.Medium;
            case ConcentrationMeasurement.LevelValue.High:
                return PollutantLevel.High;
            case ConcentrationMeasurement.LevelValue.Critical:
                return PollutantLevel.Critical;
            default:
                return PollutantLevel.Unknown;
        }
    }

    /**
     * Scales a cluster's `measuredValue` into the pollutant's canonical unit using its `measurementUnit`
     * attribute. That attribute is optional even where `measuredValue` is present, so an absent unit is taken
     * to already match the canonical one - the assumption the code made unconditionally before this scaling
     * existed. A unit outside the canonical unit's family (e.g. a ppm-family reading for a mass-family
     * pollutant) can't be scaled without the substance's molar mass, so the reading is dropped rather than
     * written under the wrong unit.
     */
    #convertConcentrationValue(
        value: number | null,
        client: ConcentrationClientType,
        target: ConcentrationTarget,
    ): number | undefined {
        if (value === null) {
            return undefined;
        }
        const measurementUnit = this.appEndpoint.maybeStateOf(client)?.measurementUnit;
        if (measurementUnit === undefined) {
            return value;
        }
        const factor = CONCENTRATION_CONVERSION[target].get(measurementUnit);
        if (factor === undefined) {
            this.#ioBrokerDevice.adapter.log.warn(
                `${this.baseId}: pollutant reported in ${CONCENTRATION_UNIT_LABELS.get(measurementUnit) ?? measurementUnit}, incompatible with ${target}; value not updated`,
            );
            return undefined;
        }
        return value * factor;
    }

    protected enableDeviceTypeStates(): DeviceOptions {
        const endpointId = this.appEndpoint.number;

        this.enableDeviceTypeStateForAttribute(PropertyType.Aqi, {
            endpointId,
            clusterId: MatterAirQuality.id,
            attributeName: 'airQuality',
            convertValue: (value: MatterAirQuality.AirQualityEnum) => this.#toIoBrokerAirQuality(value),
        });

        for (const { clusterId, concentrationProperty, levelProperty, client, target } of POLLUTANT_MAPPINGS) {
            this.enableDeviceTypeStateForAttribute(concentrationProperty, {
                endpointId,
                clusterId,
                attributeName: 'measuredValue',
                convertValue: (value: number | null) => this.#convertConcentrationValue(value, client, target),
            });
            this.enableDeviceTypeStateForAttribute(levelProperty, {
                endpointId,
                clusterId,
                attributeName: 'levelValue',
                convertValue: (value: ConcentrationMeasurement.LevelValue) => this.#toIoBrokerLevel(value),
            });
        }

        this.enableDeviceTypeStateForAttribute(PropertyType.Power, {
            endpointId,
            clusterId: MatterOnOff.id,
            attributeName: 'onOff',
            changeHandler: async value => {
                if (value) {
                    await this.appEndpoint.commandsOf(OnOffClient)?.on();
                } else {
                    await this.appEndpoint.commandsOf(OnOffClient)?.off();
                }
            },
        });

        this.enableDeviceTypeStateForAttribute(PropertyType.Temperature, {
            endpointId,
            clusterId: TemperatureMeasurement.id,
            attributeName: 'measuredValue',
            convertValue: (value: number | null) =>
                value === null ? undefined : MatterConverters.fromMatterHundredths(value),
        });
        this.enableDeviceTypeStateForAttribute(PropertyType.Humidity, {
            endpointId,
            clusterId: RelativeHumidityMeasurement.id,
            attributeName: 'measuredValue',
            convertValue: (value: number | null) =>
                value === null ? undefined : MatterConverters.fromMatterHundredths(value),
        });
        // The Air Quality Sensor device type does not include PressureMeasurement - this covers the devices that
        // co-locate it anyway, the same way temperature and humidity are commonly co-located
        this.enableDeviceTypeStateForAttribute(PropertyType.Pressure, {
            endpointId,
            clusterId: PressureMeasurement.id,
            attributeName: 'measuredValue',
            // Matter MeasuredValue = 10 x Pressure[kPa] and 1 kPa = 10 mbar, so the factors cancel out
            convertValue: (value: number | null) => (value === null ? undefined : value),
        });

        return super.enableDeviceTypeStates();
    }

    get ioBrokerDevice(): AirQuality {
        return this.#ioBrokerDevice;
    }
}
