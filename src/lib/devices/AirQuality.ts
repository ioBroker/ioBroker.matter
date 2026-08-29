import { type DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import {
    GenericDevice,
    type DetectedDevice,
    type DeviceOptions,
    StateAccessType,
    type DeviceStateDescription,
} from './GenericDevice';

export enum AirQualityIndex {
    Unknown = 'UNKNOWN',
    Good = 'GOOD',
    Fair = 'FAIR',
    Moderate = 'MODERATE',
    Poor = 'POOR',
    VeryPoor = 'VERY_POOR',
    ExtremelyPoor = 'EXTREMELY_POOR',
}

export enum AirQualityIndexNumbers {
    UNKNOWN = 0,
    GOOD = 1,
    FAIR = 2,
    MODERATE = 3,
    POOR = 4,
    VERY_POOR = 5,
    EXTREMELY_POOR = 6,
}

export enum PollutantLevel {
    Unknown = 'UNKNOWN',
    Low = 'LOW',
    Medium = 'MEDIUM',
    High = 'HIGH',
    Critical = 'CRITICAL',
}

export enum PollutantLevelNumbers {
    UNKNOWN = 0,
    LOW = 1,
    MEDIUM = 2,
    HIGH = 3,
    CRITICAL = 4,
}

/** Pollutants exposed by the `airQuality` type-detector pattern; each contributes a concentration and a level state. */
type PollutantKey = 'Co2' | 'Tvoc' | 'Pm1' | 'Pm25' | 'Pm10' | 'Co' | 'No2' | 'O3' | 'Ch2o' | 'Rn' | 'So2';

interface PollutantDefinition {
    key: PollutantKey;
    stateName: string;
    concentrationType: PropertyType;
    levelType: PropertyType;
}

const POLLUTANT_DEFINITIONS: readonly PollutantDefinition[] = [
    {
        key: 'Co2',
        stateName: 'CO2',
        concentrationType: PropertyType.Co2,
        levelType: PropertyType.Co2Level,
    },
    { key: 'Tvoc', stateName: 'TVOC', concentrationType: PropertyType.Tvoc, levelType: PropertyType.TvocLevel },
    {
        key: 'Pm1',
        stateName: 'PM1',
        concentrationType: PropertyType.Pm1,
        levelType: PropertyType.Pm1Level,
    },
    {
        key: 'Pm25',
        stateName: 'PM25',
        concentrationType: PropertyType.Pm25,
        levelType: PropertyType.Pm25Level,
    },
    {
        key: 'Pm10',
        stateName: 'PM10',
        concentrationType: PropertyType.Pm10,
        levelType: PropertyType.Pm10Level,
    },
    { key: 'Co', stateName: 'CO', concentrationType: PropertyType.Co, levelType: PropertyType.CoLevel },
    { key: 'No2', stateName: 'NO2', concentrationType: PropertyType.No2, levelType: PropertyType.No2Level },
    { key: 'O3', stateName: 'O3', concentrationType: PropertyType.O3, levelType: PropertyType.O3Level },
    {
        key: 'Ch2o',
        stateName: 'CH2O',
        concentrationType: PropertyType.Ch2o,
        levelType: PropertyType.Ch2oLevel,
    },
    { key: 'Rn', stateName: 'RN', concentrationType: PropertyType.Rn, levelType: PropertyType.RnLevel },
    { key: 'So2', stateName: 'SO2', concentrationType: PropertyType.So2, levelType: PropertyType.So2Level },
] as const;

export class AirQuality extends GenericDevice {
    #aqiState?: DeviceStateObject<AirQualityIndex>;
    #powerState?: DeviceStateObject<boolean>;
    #pressureState?: DeviceStateObject<number>;
    #temperatureState?: DeviceStateObject<number>;
    #humidityState?: DeviceStateObject<number>;
    #concentrationStates = new Map<PollutantKey, DeviceStateObject<number>>();
    #levelStates = new Map<PollutantKey, DeviceStateObject<PollutantLevel>>();

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._construction.push(
            this.addDeviceStates([
                {
                    name: 'AQI',
                    valueType: ValueType.Enum,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Aqi,
                    callback: state => (this.#aqiState = state),
                },
                {
                    name: 'POWER',
                    valueType: ValueType.Boolean,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.Power,
                    callback: state => (this.#powerState = state),
                },
                ...POLLUTANT_DEFINITIONS.flatMap(definition => this.#pollutantStateDescriptions(definition)),
                {
                    name: 'PRESSURE',
                    valueType: ValueType.Number,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Pressure,
                    callback: state => (this.#pressureState = state),
                },
                {
                    name: 'ACTUAL',
                    valueType: ValueType.Number,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Temperature,
                    callback: state => (this.#temperatureState = state),
                },
                {
                    name: 'HUMIDITY',
                    valueType: ValueType.NumberPercent,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Humidity,
                    callback: state => (this.#humidityState = state),
                },
            ]),
        );
    }

    #pollutantStateDescriptions(definition: PollutantDefinition): DeviceStateDescription[] {
        return [
            {
                name: definition.stateName,
                valueType: ValueType.Number,
                accessType: StateAccessType.Read,
                type: definition.concentrationType,
                callback: state => {
                    if (state) {
                        this.#concentrationStates.set(definition.key, state);
                    }
                },
            },
            {
                name: `${definition.stateName}_LEVEL`,
                valueType: ValueType.Enum,
                accessType: StateAccessType.Read,
                type: definition.levelType,
                callback: state => {
                    if (state) {
                        this.#levelStates.set(definition.key, state);
                    }
                },
            },
        ];
    }

    #getConcentration(key: PollutantKey): number | undefined {
        const state = this.#concentrationStates.get(key);
        if (!state) {
            throw new Error(`${key} state not found`);
        }
        return state.value;
    }

    #hasConcentration(key: PollutantKey): boolean {
        return this.#concentrationStates.has(key);
    }

    #updateConcentration(key: PollutantKey, value: number): Promise<void> {
        const state = this.#concentrationStates.get(key);
        if (!state) {
            throw new Error(`${key} state not found`);
        }
        return state.updateValue(value);
    }

    #getLevel(key: PollutantKey): PollutantLevel | undefined {
        const state = this.#levelStates.get(key);
        if (!state) {
            throw new Error(`${key}_LEVEL state not found`);
        }
        return state.value;
    }

    #hasLevel(key: PollutantKey): boolean {
        return this.#levelStates.has(key);
    }

    #updateLevel(key: PollutantKey, value: PollutantLevel): Promise<void> {
        const state = this.#levelStates.get(key);
        if (!state) {
            throw new Error(`${key}_LEVEL state not found`);
        }
        return state.updateValue(value);
    }

    getAqi(): AirQualityIndex | undefined {
        if (!this.#aqiState) {
            throw new Error('AQI state not found');
        }
        return this.#aqiState.value;
    }

    updateAqi(value: AirQualityIndex): Promise<void> {
        if (!this.#aqiState) {
            throw new Error('AQI state not found');
        }
        return this.#aqiState.updateValue(value);
    }

    getAqiModes(): AirQualityIndex[] {
        if (!this.#aqiState) {
            throw new Error('AQI state not found');
        }
        return this.#aqiState.getModes();
    }

    updateAqiModes(modes: { [key: string]: AirQualityIndex }): Promise<void> {
        if (!this.#aqiState) {
            throw new Error('AQI state not found');
        }
        return this.#aqiState.updateModes(modes);
    }

    hasPower(): boolean {
        return !!this.#powerState;
    }

    getPower(): boolean | undefined {
        if (!this.#powerState) {
            throw new Error('Power state not found');
        }
        return this.#powerState.value;
    }

    setPower(value: boolean): Promise<void> {
        if (!this.#powerState) {
            throw new Error('Power state not found');
        }
        return this.#powerState.setValue(value);
    }

    updatePower(value: boolean): Promise<void> {
        if (!this.#powerState) {
            throw new Error('Power state not found');
        }
        return this.#powerState.updateValue(value);
    }

    hasPressure(): boolean {
        return !!this.#pressureState;
    }

    getPressure(): number | undefined {
        if (!this.#pressureState) {
            throw new Error('Pressure state not found');
        }
        return this.#pressureState.value;
    }

    updatePressure(value: number): Promise<void> {
        if (!this.#pressureState) {
            throw new Error('Pressure state not found');
        }
        return this.#pressureState.updateValue(value);
    }

    hasTemperature(): boolean {
        return !!this.#temperatureState;
    }

    getTemperature(): number | undefined {
        if (!this.#temperatureState) {
            throw new Error('Temperature state not found');
        }
        return this.#temperatureState.value;
    }

    updateTemperature(value: number): Promise<void> {
        if (!this.#temperatureState) {
            throw new Error('Temperature state not found');
        }
        return this.#temperatureState.updateValue(value);
    }

    hasHumidity(): boolean {
        return !!this.#humidityState;
    }

    getHumidity(): number | undefined {
        if (!this.#humidityState) {
            throw new Error('Humidity state not found');
        }
        return this.#humidityState.value;
    }

    updateHumidity(value: number): Promise<void> {
        if (!this.#humidityState) {
            throw new Error('Humidity state not found');
        }
        return this.#humidityState.updateValue(value);
    }

    hasCo2(): boolean {
        return this.#hasConcentration('Co2');
    }

    getCo2(): number | undefined {
        return this.#getConcentration('Co2');
    }

    updateCo2(value: number): Promise<void> {
        return this.#updateConcentration('Co2', value);
    }

    hasCo2Level(): boolean {
        return this.#hasLevel('Co2');
    }

    getCo2Level(): PollutantLevel | undefined {
        return this.#getLevel('Co2');
    }

    updateCo2Level(value: PollutantLevel): Promise<void> {
        return this.#updateLevel('Co2', value);
    }

    hasTvoc(): boolean {
        return this.#hasConcentration('Tvoc');
    }

    getTvoc(): number | undefined {
        return this.#getConcentration('Tvoc');
    }

    updateTvoc(value: number): Promise<void> {
        return this.#updateConcentration('Tvoc', value);
    }

    hasTvocLevel(): boolean {
        return this.#hasLevel('Tvoc');
    }

    getTvocLevel(): PollutantLevel | undefined {
        return this.#getLevel('Tvoc');
    }

    updateTvocLevel(value: PollutantLevel): Promise<void> {
        return this.#updateLevel('Tvoc', value);
    }

    hasPm1(): boolean {
        return this.#hasConcentration('Pm1');
    }

    getPm1(): number | undefined {
        return this.#getConcentration('Pm1');
    }

    updatePm1(value: number): Promise<void> {
        return this.#updateConcentration('Pm1', value);
    }

    hasPm1Level(): boolean {
        return this.#hasLevel('Pm1');
    }

    getPm1Level(): PollutantLevel | undefined {
        return this.#getLevel('Pm1');
    }

    updatePm1Level(value: PollutantLevel): Promise<void> {
        return this.#updateLevel('Pm1', value);
    }

    hasPm25(): boolean {
        return this.#hasConcentration('Pm25');
    }

    getPm25(): number | undefined {
        return this.#getConcentration('Pm25');
    }

    updatePm25(value: number): Promise<void> {
        return this.#updateConcentration('Pm25', value);
    }

    hasPm25Level(): boolean {
        return this.#hasLevel('Pm25');
    }

    getPm25Level(): PollutantLevel | undefined {
        return this.#getLevel('Pm25');
    }

    updatePm25Level(value: PollutantLevel): Promise<void> {
        return this.#updateLevel('Pm25', value);
    }

    hasPm10(): boolean {
        return this.#hasConcentration('Pm10');
    }

    getPm10(): number | undefined {
        return this.#getConcentration('Pm10');
    }

    updatePm10(value: number): Promise<void> {
        return this.#updateConcentration('Pm10', value);
    }

    hasPm10Level(): boolean {
        return this.#hasLevel('Pm10');
    }

    getPm10Level(): PollutantLevel | undefined {
        return this.#getLevel('Pm10');
    }

    updatePm10Level(value: PollutantLevel): Promise<void> {
        return this.#updateLevel('Pm10', value);
    }

    hasCo(): boolean {
        return this.#hasConcentration('Co');
    }

    getCo(): number | undefined {
        return this.#getConcentration('Co');
    }

    updateCo(value: number): Promise<void> {
        return this.#updateConcentration('Co', value);
    }

    hasCoLevel(): boolean {
        return this.#hasLevel('Co');
    }

    getCoLevel(): PollutantLevel | undefined {
        return this.#getLevel('Co');
    }

    updateCoLevel(value: PollutantLevel): Promise<void> {
        return this.#updateLevel('Co', value);
    }

    hasNo2(): boolean {
        return this.#hasConcentration('No2');
    }

    getNo2(): number | undefined {
        return this.#getConcentration('No2');
    }

    updateNo2(value: number): Promise<void> {
        return this.#updateConcentration('No2', value);
    }

    hasNo2Level(): boolean {
        return this.#hasLevel('No2');
    }

    getNo2Level(): PollutantLevel | undefined {
        return this.#getLevel('No2');
    }

    updateNo2Level(value: PollutantLevel): Promise<void> {
        return this.#updateLevel('No2', value);
    }

    hasO3(): boolean {
        return this.#hasConcentration('O3');
    }

    getO3(): number | undefined {
        return this.#getConcentration('O3');
    }

    updateO3(value: number): Promise<void> {
        return this.#updateConcentration('O3', value);
    }

    hasO3Level(): boolean {
        return this.#hasLevel('O3');
    }

    getO3Level(): PollutantLevel | undefined {
        return this.#getLevel('O3');
    }

    updateO3Level(value: PollutantLevel): Promise<void> {
        return this.#updateLevel('O3', value);
    }

    hasCh2o(): boolean {
        return this.#hasConcentration('Ch2o');
    }

    getCh2o(): number | undefined {
        return this.#getConcentration('Ch2o');
    }

    updateCh2o(value: number): Promise<void> {
        return this.#updateConcentration('Ch2o', value);
    }

    hasCh2oLevel(): boolean {
        return this.#hasLevel('Ch2o');
    }

    getCh2oLevel(): PollutantLevel | undefined {
        return this.#getLevel('Ch2o');
    }

    updateCh2oLevel(value: PollutantLevel): Promise<void> {
        return this.#updateLevel('Ch2o', value);
    }

    hasRn(): boolean {
        return this.#hasConcentration('Rn');
    }

    getRn(): number | undefined {
        return this.#getConcentration('Rn');
    }

    updateRn(value: number): Promise<void> {
        return this.#updateConcentration('Rn', value);
    }

    hasRnLevel(): boolean {
        return this.#hasLevel('Rn');
    }

    getRnLevel(): PollutantLevel | undefined {
        return this.#getLevel('Rn');
    }

    updateRnLevel(value: PollutantLevel): Promise<void> {
        return this.#updateLevel('Rn', value);
    }

    hasSo2(): boolean {
        return this.#hasConcentration('So2');
    }

    getSo2(): number | undefined {
        return this.#getConcentration('So2');
    }

    updateSo2(value: number): Promise<void> {
        return this.#updateConcentration('So2', value);
    }

    hasSo2Level(): boolean {
        return this.#hasLevel('So2');
    }

    getSo2Level(): PollutantLevel | undefined {
        return this.#getLevel('So2');
    }

    updateSo2Level(value: PollutantLevel): Promise<void> {
        return this.#updateLevel('So2', value);
    }
}
