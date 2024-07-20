import GenericDevice, {
    DetectedDevice,
    DeviceOptions,
    DeviceStateObject,
    PropertyType,
    StateAccessType,
    ValueType,
} from './GenericDevice';

class WeatherForecast extends GenericDevice {
    protected _getIconState: DeviceStateObject<string> | undefined;
    protected _getTempMinState: DeviceStateObject<number> | undefined;
    protected _getTempMaxState: DeviceStateObject<number> | undefined;
    protected _getPrecipitationChanceState: DeviceStateObject<number> | undefined;
    protected _getPrecipitationState: DeviceStateObject<number> | undefined;
    protected _getDateState: DeviceStateObject<string> | undefined;
    protected _getDowState: DeviceStateObject<string> | undefined;
    protected _getStateState: DeviceStateObject<string> | undefined;
    protected _getTempState: DeviceStateObject<number> | undefined;
    protected _getPressureState: DeviceStateObject<number> | undefined;
    protected _getHumidityState: DeviceStateObject<number> | undefined;
    protected _getTimeSunriseState: DeviceStateObject<string> | undefined;
    protected _getTimeSunsetState: DeviceStateObject<string> | undefined;
    protected _getWindChillState: DeviceStateObject<number> | undefined;
    protected _getFeelsLikeState: DeviceStateObject<number> | undefined;
    protected _getWindSpeedState: DeviceStateObject<number> | undefined;
    protected _getWindDirectionState: DeviceStateObject<number> | undefined;
    protected _getWindDirectionStrState: DeviceStateObject<string> | undefined;
    protected _getWindIconState: DeviceStateObject<string> | undefined;
    protected _getHistoryChartState: DeviceStateObject<string> | undefined;
    protected _getForecastChartState: DeviceStateObject<string> | undefined;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._ready.push(
            this.addDeviceStates([
                {
                    name: 'ICON',
                    valueType: ValueType.String,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Icon,
                    callback: state => (this._getIconState = state),
                },
                {
                    name: 'TEMP_MIN',
                    valueType: ValueType.Number,
                    accessType: StateAccessType.Read,
                    type: PropertyType.TemperatureMin,
                    callback: state => (this._getTempMinState = state),
                },
                {
                    name: 'TEMP_MAX',
                    valueType: ValueType.Number,
                    accessType: StateAccessType.Read,
                    type: PropertyType.TemperatureMax,
                    callback: state => (this._getTempMaxState = state),
                },
                {
                    name: 'PRECIPITATION_CHANCE',
                    valueType: ValueType.Number,
                    accessType: StateAccessType.Read,
                    type: PropertyType.PrecipitationChance,
                    callback: state => (this._getPrecipitationChanceState = state),
                },
                {
                    name: 'PRECIPITATION',
                    valueType: ValueType.Number,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Precipitation,
                    callback: state => (this._getPrecipitationState = state),
                },
                {
                    name: 'DATE',
                    valueType: ValueType.String,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Date,
                    callback: state => (this._getDateState = state),
                },
                {
                    name: 'DOW',
                    valueType: ValueType.String,
                    accessType: StateAccessType.Read,
                    type: PropertyType.DayOfWeek,
                    callback: state => (this._getDowState = state),
                },
                {
                    name: 'STATE',
                    valueType: ValueType.String,
                    accessType: StateAccessType.Read,
                    type: PropertyType.State,
                    callback: state => (this._getStateState = state),
                },
                {
                    name: 'TEMP',
                    valueType: ValueType.Number,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Temperature,
                    callback: state => (this._getTempState = state),
                },
                {
                    name: 'PRESSURE',
                    valueType: ValueType.Number,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Pressure,
                    callback: state => (this._getPressureState = state),
                },
                {
                    name: 'HUMIDITY',
                    valueType: ValueType.NumberPercent,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Humidity,
                    callback: state => (this._getHumidityState = state),
                },
                {
                    name: 'TIME_SUNRISE',
                    valueType: ValueType.String,
                    accessType: StateAccessType.Read,
                    type: PropertyType.TimeSunrise,
                    callback: state => (this._getTimeSunriseState = state),
                },
                {
                    name: 'TIME_SUNSET',
                    valueType: ValueType.String,
                    accessType: StateAccessType.Read,
                    type: PropertyType.TimeSunset,
                    callback: state => (this._getTimeSunsetState = state),
                },
                {
                    name: 'WIND_CHILL',
                    valueType: ValueType.Number,
                    accessType: StateAccessType.Read,
                    type: PropertyType.WindChill,
                    callback: state => (this._getWindChillState = state),
                },
                {
                    name: 'FEELS_LIKE',
                    valueType: ValueType.Number,
                    accessType: StateAccessType.Read,
                    type: PropertyType.FeelsLike,
                    callback: state => (this._getFeelsLikeState = state),
                },
                {
                    name: 'WIND_SPEED',
                    valueType: ValueType.Number,
                    accessType: StateAccessType.Read,
                    type: PropertyType.WindSpeed,
                    callback: state => (this._getWindSpeedState = state),
                },
                {
                    name: 'WIND_DIRECTION',
                    valueType: ValueType.Number,
                    accessType: StateAccessType.Read,
                    type: PropertyType.WindDirectionNumber,
                    callback: state => (this._getWindDirectionState = state),
                },
                {
                    name: 'WIND_DIRECTION_STR',
                    valueType: ValueType.String,
                    accessType: StateAccessType.Read,
                    type: PropertyType.WindDirectionString,
                    callback: state => (this._getWindDirectionStrState = state),
                },
                {
                    name: 'WIND_ICON',
                    valueType: ValueType.String,
                    accessType: StateAccessType.Read,
                    type: PropertyType.WindIcon,
                    callback: state => (this._getWindIconState = state),
                },
                {
                    name: 'HISTORY_CHART',
                    valueType: ValueType.String,
                    accessType: StateAccessType.Read,
                    type: PropertyType.HistoryChart,
                    callback: state => (this._getHistoryChartState = state),
                },
                {
                    name: 'FORECAST_CHART',
                    valueType: ValueType.String,
                    accessType: StateAccessType.Read,
                    type: PropertyType.ForecastChart,
                    callback: state => (this._getForecastChartState = state),
                },
            ]),
        );
    }

    getIcon(): string | undefined {
        if (!this._getIconState) {
            throw new Error('Icon state not found');
        }
        return this._getIconState.value;
    }

    getTemperatureMin(): number | undefined {
        if (!this._getTempMinState) {
            throw new Error('TempMin state not found');
        }
        return this._getTempMinState.value;
    }

    getTemperatureMax(): number | undefined {
        if (!this._getTempMaxState) {
            throw new Error('TempMax state not found');
        }
        return this._getTempMaxState.value;
    }

    getPrecipitationChance(): number | undefined {
        if (!this._getPrecipitationChanceState) {
            throw new Error('PrecipitationChance state not found');
        }
        return this._getPrecipitationChanceState.value;
    }

    getPrecipitation(): number | undefined {
        if (!this._getPrecipitationState) {
            throw new Error('Precipitation state not found');
        }
        return this._getPrecipitationState.value;
    }

    getDate(): string | undefined {
        if (!this._getDateState) {
            throw new Error('Date state not found');
        }
        return this._getDateState.value;
    }

    getDayOfWeek(): string | undefined {
        if (!this._getDowState) {
            throw new Error('Dow state not found');
        }
        return this._getDowState.value;
    }

    getState(): string | undefined {
        if (!this._getStateState) {
            throw new Error('State state not found');
        }
        return this._getStateState.value;
    }

    getTemperature(): number | undefined {
        if (!this._getTempState) {
            throw new Error('Temp state not found');
        }
        return this._getTempState.value;
    }

    getPressure(): number | undefined {
        if (!this._getPressureState) {
            throw new Error('Pressure state not found');
        }
        return this._getPressureState.value;
    }

    getHumidity(): number | undefined {
        if (!this._getHumidityState) {
            throw new Error('Humidity state not found');
        }
        return this._getHumidityState.value;
    }

    getTimeSunrise(): string | undefined {
        if (!this._getTimeSunriseState) {
            throw new Error('TimeSunrise state not found');
        }
        return this._getTimeSunriseState.value;
    }

    getTimeSunset(): string | undefined {
        if (!this._getTimeSunsetState) {
            throw new Error('TimeSunset state not found');
        }
        return this._getTimeSunsetState.value;
    }

    getWindChill(): number | undefined {
        if (!this._getWindChillState) {
            throw new Error('WindChill state not found');
        }
        return this._getWindChillState.value;
    }

    getFeelsLike(): number | undefined {
        if (!this._getFeelsLikeState) {
            throw new Error('FeelsLike state not found');
        }
        return this._getFeelsLikeState.value;
    }

    getWindSpeed(): number | undefined {
        if (!this._getWindSpeedState) {
            throw new Error('WindSpeed state not found');
        }
        return this._getWindSpeedState.value;
    }

    getWindDirectionNumber(): number | undefined {
        if (!this._getWindDirectionState) {
            throw new Error('WindDirection state not found');
        }
        return this._getWindDirectionState.value;
    }

    getWindDirectionString(): string | undefined {
        if (!this._getWindDirectionStrState) {
            throw new Error('WindDirectionStr state not found');
        }
        return this._getWindDirectionStrState.value;
    }

    getWindIcon(): string | undefined {
        if (!this._getWindIconState) {
            throw new Error('WindIcon state not found');
        }
        return this._getWindIconState.value;
    }

    getHistoryChart(): string | undefined {
        if (!this._getHistoryChartState) {
            throw new Error('HistoryChart state not found');
        }
        return this._getHistoryChartState.value;
    }

    getForecastChart(): string | undefined {
        if (!this._getForecastChartState) {
            throw new Error('ForecastChart state not found');
        }
        return this._getForecastChartState.value;
    }
}

export default WeatherForecast;
