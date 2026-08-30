import ChannelDetector from '@iobroker/type-detector';
import type { ClusterId, Endpoint } from '@matter/main';
import {
    AirQuality as MatterAirQuality,
    CarbonDioxideConcentrationMeasurement,
    CarbonMonoxideConcentrationMeasurement,
    ConcentrationMeasurement,
    FormaldehydeConcentrationMeasurement,
    NitrogenDioxideConcentrationMeasurement,
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
import type { PairedNode } from '@project-chip/matter.js/device';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { DetectedDevice, DeviceOptions } from '../../lib/devices/GenericDevice';
import { AirQuality, AirQualityIndex, PollutantLevel } from '../../lib/devices/AirQuality';
import { GenericDeviceToIoBroker } from './GenericDeviceToIoBroker';
import type { MatterAdapter } from '../../main';
import { MatterConverters } from '../ConversionUtils';

interface PollutantMapping {
    readonly clusterId: ClusterId;
    readonly concentrationProperty: PropertyType;
    readonly levelProperty: PropertyType;
}

/** Matter defines no sulphur dioxide concentration cluster, so the ioBroker SO2 states stay unmapped. */
const POLLUTANT_MAPPINGS: readonly PollutantMapping[] = [
    {
        clusterId: CarbonDioxideConcentrationMeasurement.id,
        concentrationProperty: PropertyType.Co2,
        levelProperty: PropertyType.Co2Level,
    },
    {
        clusterId: TotalVolatileOrganicCompoundsConcentrationMeasurement.id,
        concentrationProperty: PropertyType.Tvoc,
        levelProperty: PropertyType.TvocLevel,
    },
    {
        clusterId: Pm1ConcentrationMeasurement.id,
        concentrationProperty: PropertyType.Pm1,
        levelProperty: PropertyType.Pm1Level,
    },
    {
        clusterId: Pm25ConcentrationMeasurement.id,
        concentrationProperty: PropertyType.Pm25,
        levelProperty: PropertyType.Pm25Level,
    },
    {
        clusterId: Pm10ConcentrationMeasurement.id,
        concentrationProperty: PropertyType.Pm10,
        levelProperty: PropertyType.Pm10Level,
    },
    {
        clusterId: CarbonMonoxideConcentrationMeasurement.id,
        concentrationProperty: PropertyType.Co,
        levelProperty: PropertyType.CoLevel,
    },
    {
        clusterId: NitrogenDioxideConcentrationMeasurement.id,
        concentrationProperty: PropertyType.No2,
        levelProperty: PropertyType.No2Level,
    },
    {
        clusterId: OzoneConcentrationMeasurement.id,
        concentrationProperty: PropertyType.O3,
        levelProperty: PropertyType.O3Level,
    },
    {
        clusterId: FormaldehydeConcentrationMeasurement.id,
        concentrationProperty: PropertyType.Ch2o,
        levelProperty: PropertyType.Ch2oLevel,
    },
    {
        clusterId: RadonConcentrationMeasurement.id,
        concentrationProperty: PropertyType.Rn,
        levelProperty: PropertyType.RnLevel,
    },
];

export class AirQualitySensorToIoBroker extends GenericDeviceToIoBroker {
    readonly #ioBrokerDevice: AirQuality;

    constructor(
        node: PairedNode,
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

    protected enableDeviceTypeStates(): DeviceOptions {
        const endpointId = this.appEndpoint.number;

        this.enableDeviceTypeStateForAttribute(PropertyType.Aqi, {
            endpointId,
            clusterId: MatterAirQuality.id,
            attributeName: 'airQuality',
            convertValue: (value: MatterAirQuality.AirQualityEnum) => this.#toIoBrokerAirQuality(value),
        });

        for (const { clusterId, concentrationProperty, levelProperty } of POLLUTANT_MAPPINGS) {
            // The concentration units follow the type-detector defaults, which is what the Matter side declares
            this.enableDeviceTypeStateForAttribute(concentrationProperty, {
                endpointId,
                clusterId,
                attributeName: 'measuredValue',
                convertValue: (value: number | null) => (value === null ? undefined : value),
            });
            this.enableDeviceTypeStateForAttribute(levelProperty, {
                endpointId,
                clusterId,
                attributeName: 'levelValue',
                convertValue: (value: ConcentrationMeasurement.LevelValue) => this.#toIoBrokerLevel(value),
            });
        }

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
