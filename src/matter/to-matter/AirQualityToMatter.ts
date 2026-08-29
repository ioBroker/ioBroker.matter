import { type Behavior, Endpoint } from '@matter/main';
import { AirQualitySensorDevice, OnOffPlugInUnitDevice, PressureSensorDevice } from '@matter/main/devices';
import { AirQuality as MatterAirQuality, ConcentrationMeasurement } from '@matter/main/clusters';
import {
    AirQualityServer,
    CarbonDioxideConcentrationMeasurementServer,
    CarbonMonoxideConcentrationMeasurementServer,
    FormaldehydeConcentrationMeasurementServer,
    NitrogenDioxideConcentrationMeasurementServer,
    OzoneConcentrationMeasurementServer,
    Pm1ConcentrationMeasurementServer,
    Pm10ConcentrationMeasurementServer,
    Pm25ConcentrationMeasurementServer,
    RadonConcentrationMeasurementServer,
    RelativeHumidityMeasurementServer,
    TemperatureMeasurementServer,
    TotalVolatileOrganicCompoundsConcentrationMeasurementServer,
} from '@matter/main/behaviors';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import { type AirQuality, AirQualityIndex, PollutantLevel } from '../../lib/devices/AirQuality';
import { GenericDeviceToMatter } from './GenericDeviceToMatter';
import { IoBrokerEvents } from '../behaviors/IoBrokerEvents';
import { IoIdentifyServer } from '../behaviors/IdentifyServer';
import { IoBrokerContext } from '../behaviors/IoBrokerContext';
import { EventedOnOffPlugInUnitOnOffServer } from '../behaviors/EventedOnOffPlugInUnitOnOffServer';

/**
 * Concentration and level are independently optional on the ioBroker side, but the feature selection is baked into
 * the behavior type. Enabling both keeps it at one specialization per pollutant; the half a device does not deliver
 * stays at the "unknown" value the cluster defines for exactly that case.
 */
const CONCENTRATION_FEATURES = ['NumericMeasurement', 'LevelIndication', 'MediumLevel', 'CriticalLevel'] as const;

/** All concentration measurement aliases share the base cluster's attribute types, so one structural type fits all. */
interface ConcentrationServerType extends Behavior.Type {
    readonly State: new () => {
        measuredValue: number | null;
        levelValue: ConcentrationMeasurement.LevelValue;
        measurementMedium: ConcentrationMeasurement.MeasurementMedium;
        measurementUnit: ConcentrationMeasurement.MeasurementUnit;
    };
}

function concentrationServer(
    server: ConcentrationServerType,
    unit: ConcentrationMeasurement.MeasurementUnit,
): ConcentrationServerType {
    return server.set({
        measurementMedium: ConcentrationMeasurement.MeasurementMedium.Air,
        measurementUnit: unit,
        measuredValue: null,
        levelValue: ConcentrationMeasurement.LevelValue.Unknown,
    });
}

interface PollutantMapping {
    readonly behavior: ConcentrationServerType;
    readonly concentrationProperty: PropertyType;
    readonly levelProperty: PropertyType;
    readonly hasConcentration: (device: AirQuality) => boolean;
    readonly getConcentration: (device: AirQuality) => number | undefined;
    readonly hasLevel: (device: AirQuality) => boolean;
    readonly getLevel: (device: AirQuality) => PollutantLevel | undefined;
}

const { Ppm, Ppb, Ugm3, Bqm3 } = ConcentrationMeasurement.MeasurementUnit;

/**
 * Units follow the type-detector defaults, so no value conversion is needed. Where the detector declares no unit
 * (TVOC, NO2, O3) ppb is assumed, the unit these sensors are conventionally reported in.
 */
const POLLUTANT_MAPPINGS: readonly PollutantMapping[] = [
    {
        behavior: concentrationServer(CarbonDioxideConcentrationMeasurementServer.with(...CONCENTRATION_FEATURES), Ppm),
        concentrationProperty: PropertyType.Co2,
        levelProperty: PropertyType.Co2Level,
        hasConcentration: device => device.hasCo2(),
        getConcentration: device => device.getCo2(),
        hasLevel: device => device.hasCo2Level(),
        getLevel: device => device.getCo2Level(),
    },
    {
        behavior: concentrationServer(
            TotalVolatileOrganicCompoundsConcentrationMeasurementServer.with(...CONCENTRATION_FEATURES),
            Ppb,
        ),
        concentrationProperty: PropertyType.Tvoc,
        levelProperty: PropertyType.TvocLevel,
        hasConcentration: device => device.hasTvoc(),
        getConcentration: device => device.getTvoc(),
        hasLevel: device => device.hasTvocLevel(),
        getLevel: device => device.getTvocLevel(),
    },
    {
        behavior: concentrationServer(Pm1ConcentrationMeasurementServer.with(...CONCENTRATION_FEATURES), Ugm3),
        concentrationProperty: PropertyType.Pm1,
        levelProperty: PropertyType.Pm1Level,
        hasConcentration: device => device.hasPm1(),
        getConcentration: device => device.getPm1(),
        hasLevel: device => device.hasPm1Level(),
        getLevel: device => device.getPm1Level(),
    },
    {
        behavior: concentrationServer(Pm25ConcentrationMeasurementServer.with(...CONCENTRATION_FEATURES), Ugm3),
        concentrationProperty: PropertyType.Pm25,
        levelProperty: PropertyType.Pm25Level,
        hasConcentration: device => device.hasPm25(),
        getConcentration: device => device.getPm25(),
        hasLevel: device => device.hasPm25Level(),
        getLevel: device => device.getPm25Level(),
    },
    {
        behavior: concentrationServer(Pm10ConcentrationMeasurementServer.with(...CONCENTRATION_FEATURES), Ugm3),
        concentrationProperty: PropertyType.Pm10,
        levelProperty: PropertyType.Pm10Level,
        hasConcentration: device => device.hasPm10(),
        getConcentration: device => device.getPm10(),
        hasLevel: device => device.hasPm10Level(),
        getLevel: device => device.getPm10Level(),
    },
    {
        behavior: concentrationServer(
            CarbonMonoxideConcentrationMeasurementServer.with(...CONCENTRATION_FEATURES),
            Ppm,
        ),
        concentrationProperty: PropertyType.Co,
        levelProperty: PropertyType.CoLevel,
        hasConcentration: device => device.hasCo(),
        getConcentration: device => device.getCo(),
        hasLevel: device => device.hasCoLevel(),
        getLevel: device => device.getCoLevel(),
    },
    {
        behavior: concentrationServer(
            NitrogenDioxideConcentrationMeasurementServer.with(...CONCENTRATION_FEATURES),
            Ppb,
        ),
        concentrationProperty: PropertyType.No2,
        levelProperty: PropertyType.No2Level,
        hasConcentration: device => device.hasNo2(),
        getConcentration: device => device.getNo2(),
        hasLevel: device => device.hasNo2Level(),
        getLevel: device => device.getNo2Level(),
    },
    {
        behavior: concentrationServer(OzoneConcentrationMeasurementServer.with(...CONCENTRATION_FEATURES), Ppb),
        concentrationProperty: PropertyType.O3,
        levelProperty: PropertyType.O3Level,
        hasConcentration: device => device.hasO3(),
        getConcentration: device => device.getO3(),
        hasLevel: device => device.hasO3Level(),
        getLevel: device => device.getO3Level(),
    },
    {
        behavior: concentrationServer(FormaldehydeConcentrationMeasurementServer.with(...CONCENTRATION_FEATURES), Ugm3),
        concentrationProperty: PropertyType.Ch2o,
        levelProperty: PropertyType.Ch2oLevel,
        hasConcentration: device => device.hasCh2o(),
        getConcentration: device => device.getCh2o(),
        hasLevel: device => device.hasCh2oLevel(),
        getLevel: device => device.getCh2oLevel(),
    },
    {
        behavior: concentrationServer(RadonConcentrationMeasurementServer.with(...CONCENTRATION_FEATURES), Bqm3),
        concentrationProperty: PropertyType.Rn,
        levelProperty: PropertyType.RnLevel,
        hasConcentration: device => device.hasRn(),
        getConcentration: device => device.getRn(),
        hasLevel: device => device.hasRnLevel(),
        getLevel: device => device.getRnLevel(),
    },
];

/** Every AirQualityEnum value above Good is feature gated, and the ioBroker index uses all of them. */
const IoAirQualityServer = AirQualityServer.with('Fair', 'Moderate', 'VeryPoor', 'ExtremelyPoor').set({
    airQuality: MatterAirQuality.AirQualityEnum.Unknown,
});

const IoAirQualitySensorDevice = AirQualitySensorDevice.with(IoAirQualityServer, IoIdentifyServer);

const IoOnOffPlugInUnitDevice = OnOffPlugInUnitDevice.with(
    EventedOnOffPlugInUnitOnOffServer,
    IoBrokerEvents,
    IoIdentifyServer,
    IoBrokerContext,
);
type IoOnOffPlugInUnitDevice = typeof IoOnOffPlugInUnitDevice;

/** Mapping Logic to map an ioBroker Air Quality device to a Matter AirQualitySensorDevice. */
export class AirQualityToMatter extends GenericDeviceToMatter {
    readonly #ioBrokerDevice: AirQuality;
    readonly #matterEndpoint: Endpoint;
    readonly #matterEndpointPressure?: Endpoint<PressureSensorDevice>;
    readonly #matterEndpointPower?: Endpoint<IoOnOffPlugInUnitDevice>;
    readonly #pollutants: readonly PollutantMapping[];
    readonly #byConcentrationProperty = new Map<PropertyType, PollutantMapping>();
    readonly #byLevelProperty = new Map<PropertyType, PollutantMapping>();
    readonly #hasTemperature: boolean;
    readonly #hasHumidity: boolean;

    constructor(ioBrokerDevice: AirQuality, name: string, uuid: string) {
        super(name, uuid);
        this.#ioBrokerDevice = ioBrokerDevice;

        this.#pollutants = POLLUTANT_MAPPINGS.filter(
            mapping => mapping.hasConcentration(ioBrokerDevice) || mapping.hasLevel(ioBrokerDevice),
        );
        for (const mapping of this.#pollutants) {
            this.#byConcentrationProperty.set(mapping.concentrationProperty, mapping);
            this.#byLevelProperty.set(mapping.levelProperty, mapping);
        }
        if (ioBrokerDevice.hasSo2() || ioBrokerDevice.hasSo2Level()) {
            ioBrokerDevice.adapter.log.info(
                `${uuid}: Matter defines no sulphur dioxide concentration cluster, SO2 is not exposed`,
            );
        }

        const behaviors = new Array<Behavior.Type>();
        behaviors.push(
            IoBrokerContext.set({ device: ioBrokerDevice, adapter: ioBrokerDevice.adapter }),
            ...this.#pollutants.map(mapping => mapping.behavior),
        );
        this.#hasTemperature = ioBrokerDevice.hasTemperature();
        if (this.#hasTemperature) {
            behaviors.push(TemperatureMeasurementServer);
        }
        this.#hasHumidity = ioBrokerDevice.hasHumidity();
        if (this.#hasHumidity) {
            behaviors.push(RelativeHumidityMeasurementServer);
        }

        this.#matterEndpoint = new Endpoint(IoAirQualitySensorDevice.with(...behaviors), {
            id: `${uuid}-AirQuality`,
        });

        if (ioBrokerDevice.hasPressure()) {
            this.#matterEndpointPressure = new Endpoint(PressureSensorDevice, { id: `${uuid}-Pressure` });
        }
        if (ioBrokerDevice.hasPower()) {
            this.#matterEndpointPower = new Endpoint(IoOnOffPlugInUnitDevice, {
                id: `${uuid}-PowerOnOff`,
                ioBrokerContext: { device: ioBrokerDevice, adapter: ioBrokerDevice.adapter },
            });
        }
    }

    get matterEndpoints(): Endpoint[] {
        const endpoints = new Array<Endpoint>(this.#matterEndpoint);
        if (this.#matterEndpointPressure) {
            endpoints.push(this.#matterEndpointPressure);
        }
        if (this.#matterEndpointPower) {
            endpoints.push(this.#matterEndpointPower);
        }
        return endpoints;
    }

    get ioBrokerDevice(): AirQuality {
        return this.#ioBrokerDevice;
    }

    /** The ioBroker index and AirQualityEnum enumerate the same seven steps in the same order. */
    #toMatterAirQuality(value: unknown): MatterAirQuality.AirQualityEnum {
        switch (value) {
            case AirQualityIndex.Good:
                return MatterAirQuality.AirQualityEnum.Good;
            case AirQualityIndex.Fair:
                return MatterAirQuality.AirQualityEnum.Fair;
            case AirQualityIndex.Moderate:
                return MatterAirQuality.AirQualityEnum.Moderate;
            case AirQualityIndex.Poor:
                return MatterAirQuality.AirQualityEnum.Poor;
            case AirQualityIndex.VeryPoor:
                return MatterAirQuality.AirQualityEnum.VeryPoor;
            case AirQualityIndex.ExtremelyPoor:
                return MatterAirQuality.AirQualityEnum.ExtremelyPoor;
            default:
                return MatterAirQuality.AirQualityEnum.Unknown;
        }
    }

    /** The ioBroker pollutant level and the cluster LevelValue enumerate the same five steps in the same order. */
    #toMatterLevel(value: unknown): ConcentrationMeasurement.LevelValue {
        switch (value) {
            case PollutantLevel.Low:
                return ConcentrationMeasurement.LevelValue.Low;
            case PollutantLevel.Medium:
                return ConcentrationMeasurement.LevelValue.Medium;
            case PollutantLevel.High:
                return ConcentrationMeasurement.LevelValue.High;
            case PollutantLevel.Critical:
                return ConcentrationMeasurement.LevelValue.Critical;
            default:
                return ConcentrationMeasurement.LevelValue.Unknown;
        }
    }

    #toNumberOrNull(value: unknown): number | null {
        return typeof value === 'number' ? value : null;
    }

    convertTemperatureValue(value: number): number {
        // Matter MeasuredValue = °C * 100, int16 constrained to -27315..32767.
        return Math.round(this.#ioBrokerDevice.cropValue(value * 100, -27_315, 32_767));
    }

    convertHumidityValue(value: number): number {
        // Matter MeasuredValue = %RH * 100, uint16 constrained to 0..10000.
        return Math.round(this.#ioBrokerDevice.cropValue(value * 100, 0, 10_000));
    }

    /** Matter reports pressure as 10 x kPa, which is numerically identical to the detected mbar/hPa value. */
    #convertPressureValue(value: unknown): number | null {
        return typeof value === 'number' ? Math.round(this.#ioBrokerDevice.cropValue(value, -32_767, 32_767)) : null;
    }

    async #setPressure(value: unknown): Promise<void> {
        if (this.#matterEndpointPressure?.owner === undefined) {
            return;
        }
        await this.#matterEndpointPressure.set({
            pressureMeasurement: { measuredValue: this.#convertPressureValue(value) },
        });
    }

    async #setPower(value: unknown): Promise<void> {
        if (this.#matterEndpointPower?.owner === undefined) {
            return;
        }
        await this.#matterEndpointPower.set({ onOff: { onOff: !!value } });
    }

    async #initializeMatterState(): Promise<void> {
        await this.#matterEndpoint.setStateOf(IoAirQualityServer, {
            airQuality: this.#toMatterAirQuality(this.#ioBrokerDevice.getAqi()),
        });

        for (const mapping of this.#pollutants) {
            await this.#matterEndpoint.setStateOf(mapping.behavior, {
                measuredValue: mapping.hasConcentration(this.#ioBrokerDevice)
                    ? this.#toNumberOrNull(mapping.getConcentration(this.#ioBrokerDevice))
                    : null,
                levelValue: mapping.hasLevel(this.#ioBrokerDevice)
                    ? this.#toMatterLevel(mapping.getLevel(this.#ioBrokerDevice))
                    : ConcentrationMeasurement.LevelValue.Unknown,
            });
        }

        if (this.#hasTemperature) {
            const temperature = this.#ioBrokerDevice.getTemperature();
            await this.#matterEndpoint.setStateOf(TemperatureMeasurementServer, {
                measuredValue: typeof temperature === 'number' ? this.convertTemperatureValue(temperature) : null,
            });
        }
        if (this.#hasHumidity) {
            const humidity = this.#ioBrokerDevice.getHumidity();
            await this.#matterEndpoint.setStateOf(RelativeHumidityMeasurementServer, {
                measuredValue: typeof humidity === 'number' ? this.convertHumidityValue(humidity) : null,
            });
        }

        await this.#setPressure(this.#ioBrokerDevice.hasPressure() ? this.#ioBrokerDevice.getPressure() : undefined);
        await this.#setPower(this.#ioBrokerDevice.hasPower() ? this.#ioBrokerDevice.getPower() : undefined);
    }

    async registerHandlersAndInitialize(): Promise<void> {
        await super.registerHandlersAndInitialize();

        await this.#initializeMatterState();

        if (this.#matterEndpointPower) {
            this.matterEvents.on(
                this.#matterEndpointPower.events.ioBrokerEvents.onOffControlled,
                async on => await this.#ioBrokerDevice.setPower(on),
            );
        }

        this.#ioBrokerDevice.onChange(async event => {
            const concentration = this.#byConcentrationProperty.get(event.property);
            if (concentration !== undefined) {
                await this.#matterEndpoint.setStateOf(concentration.behavior, {
                    measuredValue: this.#toNumberOrNull(event.value),
                });
                return;
            }
            const level = this.#byLevelProperty.get(event.property);
            if (level !== undefined) {
                await this.#matterEndpoint.setStateOf(level.behavior, {
                    levelValue: this.#toMatterLevel(event.value),
                });
                return;
            }

            switch (event.property) {
                case PropertyType.Aqi:
                    await this.#matterEndpoint.setStateOf(IoAirQualityServer, {
                        airQuality: this.#toMatterAirQuality(event.value),
                    });
                    break;
                case PropertyType.Temperature:
                    if (this.#hasTemperature) {
                        await this.#matterEndpoint.setStateOf(TemperatureMeasurementServer, {
                            measuredValue:
                                typeof event.value === 'number' ? this.convertTemperatureValue(event.value) : null,
                        });
                    }
                    break;
                case PropertyType.Humidity:
                    if (this.#hasHumidity) {
                        await this.#matterEndpoint.setStateOf(RelativeHumidityMeasurementServer, {
                            measuredValue:
                                typeof event.value === 'number' ? this.convertHumidityValue(event.value) : null,
                        });
                    }
                    break;
                case PropertyType.Pressure:
                    await this.#setPressure(event.value);
                    break;
                case PropertyType.Power:
                    await this.#setPower(event.value);
                    break;
            }
        });
    }
}
