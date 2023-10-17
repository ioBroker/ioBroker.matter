import GenericDevice, { DetectedDevice, DeviceStateObject, PropertyType } from './GenericDevice';

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

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter) {
        super(detectedDevice, adapter);

        this.addDeviceStates([
            {name: 'ICON', type: PropertyType.Icon, callback: state => this._getIconState = state},
            {name: 'TEMP_MIN', type: PropertyType.TempMin, callback: state => this._getTempMinState = state},
            {name: 'TEMP_MAX', type: PropertyType.TempMax, callback: state => this._getTempMaxState = state},
            {name: 'PRECIPITATION_CHANCE', type: PropertyType.PrecipitationChance, callback: state => this._getPrecipitationChanceState = state},
            {name: 'PRECIPITATION', type: PropertyType.Precipitation, callback: state => this._getPrecipitationState = state},
            {name: 'DATE', type: PropertyType.Date, callback: state => this._getDateState = state},
            {name: 'DOW', type: PropertyType.DayOfWeek, callback: state => this._getDowState = state},
            {name: 'STATE', type: PropertyType.State, callback: state => this._getStateState = state},
            {name: 'TEMP', type: PropertyType.Temp, callback: state => this._getTempState = state},
            {name: 'PRESSURE', type: PropertyType.Pressure, callback: state => this._getPressureState = state},
            {name: 'HUMIDITY', type: PropertyType.Humidity, callback: state => this._getHumidityState = state},
            {name: 'TIME_SUNRISE', type: PropertyType.TimeSunrise, callback: state => this._getTimeSunriseState = state},
            {name: 'TIME_SUNSET', type: PropertyType.TimeSunset, callback: state => this._getTimeSunsetState = state},
            {name: 'WIND_CHILL', type: PropertyType.WindChill, callback: state => this._getWindChillState = state},
            {name: 'FEELS_LIKE', type: PropertyType.FeelsLike, callback: state => this._getFeelsLikeState = state},
            {name: 'WIND_SPEED', type: PropertyType.WindSpeed, callback: state => this._getWindSpeedState = state},
            {name: 'WIND_DIRECTION', type: PropertyType.WindDirection, callback: state => this._getWindDirectionState = state},
            {name: 'WIND_DIRECTION_STR', type: PropertyType.WindDirectionStr, callback: state => this._getWindDirectionStrState = state},
            {name: 'WIND_ICON', type: PropertyType.WindIcon, callback: state => this._getWindIconState = state},
            {name: 'HISTORY_CHART', type: PropertyType.HistoryChart, callback: state => this._getHistoryChartState = state},
            {name: 'FORECAST_CHART', type: PropertyType.ForecastChart, callback: state => this._getForecastChartState = state},
        ]);
    }

    getIcon(): string | undefined {
        if (!this._getIconState) {
            throw new Error('Icon state not found');
        }
        return this._getIconState.value;
    }

    getTempMin(): number | undefined {
        if (!this._getTempMinState) {
            throw new Error('TempMin state not found');
        }
        return this._getTempMinState.value;
    }

    getTempMax(): number | undefined {
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

    getDow(): string | undefined {
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

    getTemp(): number | undefined {
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

    getWindDirection(): number | undefined {
        if (!this._getWindDirectionState) {
            throw new Error('WindDirection state not found');
        }
        return this._getWindDirectionState.value;
    }

    getWindDirectionStr(): string | undefined {
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