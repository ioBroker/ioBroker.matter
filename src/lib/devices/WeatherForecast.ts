import { type DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import { GenericDevice, type DetectedDevice, type DeviceOptions, StateAccessType } from './GenericDevice';

export class WeatherForecast extends GenericDevice {
    #getIconState?: DeviceStateObject<string>;
    #getTempMinState?: DeviceStateObject<number>;
    #getTempMaxState?: DeviceStateObject<number>;
    #getPrecipitationChanceState?: DeviceStateObject<number>;
    #getPrecipitationState?: DeviceStateObject<number>;
    #getDateState?: DeviceStateObject<string>;
    #getDowState?: DeviceStateObject<string>;
    #getStateState?: DeviceStateObject<string>;
    #getTempState?: DeviceStateObject<number>;
    #getPressureState?: DeviceStateObject<number>;
    #getHumidityState?: DeviceStateObject<number>;
    #getTimeSunriseState?: DeviceStateObject<string>;
    #getTimeSunsetState?: DeviceStateObject<string>;
    #getWindChillState?: DeviceStateObject<number>;
    #getFeelsLikeState?: DeviceStateObject<number>;
    #getWindSpeedState?: DeviceStateObject<number>;
    #getWindDirectionState?: DeviceStateObject<number>;
    #getWindDirectionStrState?: DeviceStateObject<string>;
    #getWindIconState?: DeviceStateObject<string>;
    #getHistoryChartState?: DeviceStateObject<string>;
    #getForecastChartState?: DeviceStateObject<string>;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._construction.push(
            this.addDeviceStates([
                {
                    name: 'ICON',
                    valueType: ValueType.String,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Icon,
                    callback: state => (this.#getIconState = state),
                },
                {
                    name: 'TEMP_MIN',
                    valueType: ValueType.Number,
                    accessType: StateAccessType.Read,
                    type: PropertyType.TemperatureMin,
                    callback: state => (this.#getTempMinState = state),
                },
                {
                    name: 'TEMP_MAX',
                    valueType: ValueType.Number,
                    accessType: StateAccessType.Read,
                    type: PropertyType.TemperatureMax,
                    callback: state => (this.#getTempMaxState = state),
                },
                {
                    name: 'PRECIPITATION_CHANCE',
                    valueType: ValueType.Number,
                    accessType: StateAccessType.Read,
                    type: PropertyType.PrecipitationChance,
                    callback: state => (this.#getPrecipitationChanceState = state),
                },
                {
                    name: 'PRECIPITATION',
                    valueType: ValueType.Number,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Precipitation,
                    callback: state => (this.#getPrecipitationState = state),
                },
                {
                    name: 'DATE',
                    valueType: ValueType.String,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Date,
                    callback: state => (this.#getDateState = state),
                },
                {
                    name: 'DOW',
                    valueType: ValueType.String,
                    accessType: StateAccessType.Read,
                    type: PropertyType.DayOfWeek,
                    callback: state => (this.#getDowState = state),
                },
                {
                    name: 'STATE',
                    valueType: ValueType.String,
                    accessType: StateAccessType.Read,
                    type: PropertyType.State,
                    callback: state => (this.#getStateState = state),
                },
                {
                    name: 'TEMP',
                    valueType: ValueType.Number,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Temperature,
                    callback: state => (this.#getTempState = state),
                },
                {
                    name: 'PRESSURE',
                    valueType: ValueType.Number,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Pressure,
                    callback: state => (this.#getPressureState = state),
                },
                {
                    name: 'HUMIDITY',
                    valueType: ValueType.NumberPercent,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Humidity,
                    callback: state => (this.#getHumidityState = state),
                },
                {
                    name: 'TIME_SUNRISE',
                    valueType: ValueType.String,
                    accessType: StateAccessType.Read,
                    type: PropertyType.TimeSunrise,
                    callback: state => (this.#getTimeSunriseState = state),
                },
                {
                    name: 'TIME_SUNSET',
                    valueType: ValueType.String,
                    accessType: StateAccessType.Read,
                    type: PropertyType.TimeSunset,
                    callback: state => (this.#getTimeSunsetState = state),
                },
                {
                    name: 'WIND_CHILL',
                    valueType: ValueType.Number,
                    accessType: StateAccessType.Read,
                    type: PropertyType.WindChill,
                    callback: state => (this.#getWindChillState = state),
                },
                {
                    name: 'FEELS_LIKE',
                    valueType: ValueType.Number,
                    accessType: StateAccessType.Read,
                    type: PropertyType.FeelsLike,
                    callback: state => (this.#getFeelsLikeState = state),
                },
                {
                    name: 'WIND_SPEED',
                    valueType: ValueType.Number,
                    accessType: StateAccessType.Read,
                    type: PropertyType.WindSpeed,
                    callback: state => (this.#getWindSpeedState = state),
                },
                {
                    name: 'WIND_DIRECTION',
                    valueType: ValueType.Number,
                    accessType: StateAccessType.Read,
                    type: PropertyType.WindDirectionNumber,
                    callback: state => (this.#getWindDirectionState = state),
                },
                {
                    name: 'WIND_DIRECTION_STR',
                    valueType: ValueType.String,
                    accessType: StateAccessType.Read,
                    type: PropertyType.WindDirectionString,
                    callback: state => (this.#getWindDirectionStrState = state),
                },
                {
                    name: 'WIND_ICON',
                    valueType: ValueType.String,
                    accessType: StateAccessType.Read,
                    type: PropertyType.WindIcon,
                    callback: state => (this.#getWindIconState = state),
                },
                {
                    name: 'HISTORY_CHART',
                    valueType: ValueType.String,
                    accessType: StateAccessType.Read,
                    type: PropertyType.HistoryChart,
                    callback: state => (this.#getHistoryChartState = state),
                },
                {
                    name: 'FORECAST_CHART',
                    valueType: ValueType.String,
                    accessType: StateAccessType.Read,
                    type: PropertyType.ForecastChart,
                    callback: state => (this.#getForecastChartState = state),
                },
            ]),
        );
    }

    getIcon(): string | undefined {
        if (!this.#getIconState) {
            throw new Error('Icon state not found');
        }
        return this.#getIconState.value;
    }

    getTemperatureMin(): number | undefined {
        if (!this.#getTempMinState) {
            throw new Error('TempMin state not found');
        }
        return this.#getTempMinState.value;
    }

    getTemperatureMax(): number | undefined {
        if (!this.#getTempMaxState) {
            throw new Error('TempMax state not found');
        }
        return this.#getTempMaxState.value;
    }

    getPrecipitationChance(): number | undefined {
        if (!this.#getPrecipitationChanceState) {
            throw new Error('PrecipitationChance state not found');
        }
        return this.#getPrecipitationChanceState.value;
    }

    getPrecipitation(): number | undefined {
        if (!this.#getPrecipitationState) {
            throw new Error('Precipitation state not found');
        }
        return this.#getPrecipitationState.value;
    }

    getDate(): string | undefined {
        if (!this.#getDateState) {
            throw new Error('Date state not found');
        }
        return this.#getDateState.value;
    }

    getDayOfWeek(): string | undefined {
        if (!this.#getDowState) {
            throw new Error('Dow state not found');
        }
        return this.#getDowState.value;
    }

    getState(): string | undefined {
        if (!this.#getStateState) {
            throw new Error('State state not found');
        }
        return this.#getStateState.value;
    }

    getTemperature(): number | undefined {
        if (!this.#getTempState) {
            throw new Error('Temp state not found');
        }
        return this.#getTempState.value;
    }

    getPressure(): number | undefined {
        if (!this.#getPressureState) {
            throw new Error('Pressure state not found');
        }
        return this.#getPressureState.value;
    }

    getHumidity(): number | undefined {
        if (!this.#getHumidityState) {
            throw new Error('Humidity state not found');
        }
        return this.#getHumidityState.value;
    }

    getTimeSunrise(): string | undefined {
        if (!this.#getTimeSunriseState) {
            throw new Error('TimeSunrise state not found');
        }
        return this.#getTimeSunriseState.value;
    }

    getTimeSunset(): string | undefined {
        if (!this.#getTimeSunsetState) {
            throw new Error('TimeSunset state not found');
        }
        return this.#getTimeSunsetState.value;
    }

    getWindChill(): number | undefined {
        if (!this.#getWindChillState) {
            throw new Error('WindChill state not found');
        }
        return this.#getWindChillState.value;
    }

    getFeelsLike(): number | undefined {
        if (!this.#getFeelsLikeState) {
            throw new Error('FeelsLike state not found');
        }
        return this.#getFeelsLikeState.value;
    }

    getWindSpeed(): number | undefined {
        if (!this.#getWindSpeedState) {
            throw new Error('WindSpeed state not found');
        }
        return this.#getWindSpeedState.value;
    }

    getWindDirectionNumber(): number | undefined {
        if (!this.#getWindDirectionState) {
            throw new Error('WindDirection state not found');
        }
        return this.#getWindDirectionState.value;
    }

    getWindDirectionString(): string | undefined {
        if (!this.#getWindDirectionStrState) {
            throw new Error('WindDirectionStr state not found');
        }
        return this.#getWindDirectionStrState.value;
    }

    getWindIcon(): string | undefined {
        if (!this.#getWindIconState) {
            throw new Error('WindIcon state not found');
        }
        return this.#getWindIconState.value;
    }

    getHistoryChart(): string | undefined {
        if (!this.#getHistoryChartState) {
            throw new Error('HistoryChart state not found');
        }
        return this.#getHistoryChartState.value;
    }

    getForecastChart(): string | undefined {
        if (!this.#getForecastChartState) {
            throw new Error('ForecastChart state not found');
        }
        return this.#getForecastChartState.value;
    }
}
