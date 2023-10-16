import GenericDevice, { DetectedDevice, DeviceStateObject, PropertyType } from "./GenericDevice";

class WeatherCurrent extends GenericDevice {
    _getValueState: DeviceStateObject<number> | undefined;
    _getIconState: DeviceStateObject<string> | undefined;
    _getPrecipitationChanceState: DeviceStateObject<number> | undefined;
    _getPrecipitationTypeState: DeviceStateObject<number> | undefined;
    _getPressureState: DeviceStateObject<number> | undefined;
    _getPressureTendencyState: DeviceStateObject<string> | undefined;
    _getRealFeelTemperatureState: DeviceStateObject<number> | undefined;
    _getHumidityState: DeviceStateObject<number> | undefined;
    _getUVState: DeviceStateObject<number> | undefined;
    _getWeatherState: DeviceStateObject<string> | undefined;
    _getWindDirectionState: DeviceStateObject<string> | undefined;
    _getWindGustState: DeviceStateObject<number> | undefined;
    _getWindSpeedState: DeviceStateObject<number> | undefined;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter) {
        super(detectedDevice, adapter);

        this.addDeviceStates([
            {name: 'ACTUAL', type: PropertyType.Value, callback: state => this._getValueState = state},
            {name: 'ICON', type: PropertyType.Icon, callback: state => this._getIconState = state},
            {name: 'PRECIPITATION_CHANCE', type: PropertyType.PrecipitationChance, callback: state => this._getPrecipitationChanceState = state},
            {name: 'PRECIPITATION_TYPE', type: PropertyType.PrecipitationType, callback: state => this._getPrecipitationTypeState = state},
            {name: 'PRESSURE', type: PropertyType.Pressure, callback: state => this._getPressureState = state},
            {name: 'PRESSURE_TENDENCY', type: PropertyType.PressureTendency, callback: state => this._getPressureTendencyState = state},
            {name: 'REAL_FEEL_TEMPERATURE', type: PropertyType.RealFeelTemperature, callback: state => this._getRealFeelTemperatureState = state},
            {name: 'HUMIDITY', type: PropertyType.Humidity, callback: state => this._getHumidityState = state},
            {name: 'UV', type: PropertyType.UV, callback: state => this._getUVState = state},
            {name: 'WEATHER', type: PropertyType.Weather, callback: state => this._getWeatherState = state},
            {name: 'WIND_DIRECTION', type: PropertyType.WindDirection, callback: state => this._getWindDirectionState = state},
            {name: 'WIND_GUST', type: PropertyType.WindGust, callback: state => this._getWindGustState = state},
            {name: 'WIND_SPEED', type: PropertyType.WindSpeed, callback: state => this._getWindSpeedState = state},
        ]);
    }

    getValue(): number {
        if (!this._getValueState) {
            throw new Error('Value state not found');
        }
        return this._getValueState.value;
    }

    getIcon(): string {
        if (!this._getIconState) {
            throw new Error('Icon state not found');
        }
        return this._getIconState.value;
    }

    getPrecipitationChance(): number {
        if (!this._getPrecipitationChanceState) {
            throw new Error('PrecipitationChance state not found');
        }
        return this._getPrecipitationChanceState.value;
    }

    getPrecipitationType(): number {
        if (!this._getPrecipitationTypeState) {
            throw new Error('PrecipitationType state not found');
        }
        return this._getPrecipitationTypeState.value;
    }

    getPressure(): number {
        if (!this._getPressureState) {
            throw new Error('Pressure state not found');
        }
        return this._getPressureState.value;
    }

    getPressureTendency(): string {
        if (!this._getPressureTendencyState) {
            throw new Error('PressureTendency state not found');
        }
        return this._getPressureTendencyState.value;
    }

    getRealFeelTemperature(): number {
        if (!this._getRealFeelTemperatureState) {
            throw new Error('RealFeelTemperature state not found');
        }
        return this._getRealFeelTemperatureState.value;
    }

    getHumidity(): number {
        if (!this._getHumidityState) {
            throw new Error('Humidity state not found');
        }
        return this._getHumidityState.value;
    }

    getUV(): number {
        if (!this._getUVState) {
            throw new Error('UV state not found');
        }
        return this._getUVState.value;
    }

    getWeather(): string {
        if (!this._getWeatherState) {
            throw new Error('Weather state not found');
        }
        return this._getWeatherState.value;
    }

    getWindDirection(): string {
        if (!this._getWindDirectionState) {
            throw new Error('WindDirection state not found');
        }
        return this._getWindDirectionState.value;
    }

    getWindGust(): number {
        if (!this._getWindGustState) {
            throw new Error('WindGust state not found');
        }
        return this._getWindGustState.value;
    }

    getWindSpeed(): number {
        if (!this._getWindSpeedState) {
            throw new Error('WindSpeed state not found');
        }
        return this._getWindSpeedState.value;
    }
}

export default WeatherCurrent;