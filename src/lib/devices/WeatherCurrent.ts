import GenericDevice, {
    DetectedDevice,
    DeviceStateObject,
    PropertyType,
    StateAccessType,
    ValueType
} from './GenericDevice';

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

        this._ready.push(this.addDeviceStates([
            { name: 'ACTUAL', valueType: ValueType.Number, accessType: StateAccessType.Read, type: PropertyType.Value, callback: state => this._getValueState = state },
            { name: 'ICON', valueType: ValueType.String, accessType: StateAccessType.Read, type: PropertyType.Icon, callback: state => this._getIconState = state },
            { name: 'PRECIPITATION_CHANCE', valueType: ValueType.NumberPercent, accessType: StateAccessType.Read, type: PropertyType.PrecipitationChance, callback: state => this._getPrecipitationChanceState = state },
            { name: 'PRECIPITATION_TYPE', valueType: ValueType.NumberPercent, accessType: StateAccessType.Read, type: PropertyType.PrecipitationType, callback: state => this._getPrecipitationTypeState = state },
            { name: 'PRESSURE', valueType: ValueType.Number, accessType: StateAccessType.Read, type: PropertyType.Pressure, callback: state => this._getPressureState = state },
            { name: 'PRESSURE_TENDENCY', valueType: ValueType.String, accessType: StateAccessType.Read, type: PropertyType.PressureTendency, callback: state => this._getPressureTendencyState = state },
            { name: 'REAL_FEEL_TEMPERATURE', valueType: ValueType.Number, accessType: StateAccessType.Read, type: PropertyType.RealFeelTemperature, callback: state => this._getRealFeelTemperatureState = state },
            { name: 'HUMIDITY', valueType: ValueType.NumberPercent, accessType: StateAccessType.Read, type: PropertyType.Humidity, callback: state => this._getHumidityState = state },
            { name: 'UV', valueType: ValueType.Number, accessType: StateAccessType.Read, type: PropertyType.Uv, callback: state => this._getUVState = state },
            { name: 'WEATHER', valueType: ValueType.String, accessType: StateAccessType.Read, type: PropertyType.Weather, callback: state => this._getWeatherState = state },
            { name: 'WIND_DIRECTION', valueType: ValueType.String, accessType: StateAccessType.Read, type: PropertyType.WindDirectionString, callback: state => this._getWindDirectionState = state },
            { name: 'WIND_GUST', valueType: ValueType.Number, accessType: StateAccessType.Read, type: PropertyType.WindGust, callback: state => this._getWindGustState = state },
            { name: 'WIND_SPEED', valueType: ValueType.Number, accessType: StateAccessType.Read, type: PropertyType.WindSpeed, callback: state => this._getWindSpeedState = state },
        ]));
    }

    getValue(): number | undefined {
        if (!this._getValueState) {
            throw new Error('Value state not found');
        }
        return this._getValueState.value;
    }

    getIcon(): string | undefined {
        if (!this._getIconState) {
            throw new Error('Icon state not found');
        }
        return this._getIconState.value;
    }

    getPrecipitationChance(): number | undefined {
        if (!this._getPrecipitationChanceState) {
            throw new Error('PrecipitationChance state not found');
        }
        return this._getPrecipitationChanceState.value;
    }

    getPrecipitationType(): number | undefined {
        if (!this._getPrecipitationTypeState) {
            throw new Error('PrecipitationType state not found');
        }
        return this._getPrecipitationTypeState.value;
    }

    getPressure(): number | undefined {
        if (!this._getPressureState) {
            throw new Error('Pressure state not found');
        }
        return this._getPressureState.value;
    }

    getPressureTendency(): string | undefined {
        if (!this._getPressureTendencyState) {
            throw new Error('PressureTendency state not found');
        }
        return this._getPressureTendencyState.value;
    }

    getRealFeelTemperature(): number | undefined {
        if (!this._getRealFeelTemperatureState) {
            throw new Error('RealFeelTemperature state not found');
        }
        return this._getRealFeelTemperatureState.value;
    }

    getHumidity(): number | undefined {
        if (!this._getHumidityState) {
            throw new Error('Humidity state not found');
        }
        return this._getHumidityState.value;
    }

    getUv(): number | undefined {
        if (!this._getUVState) {
            throw new Error('UV state not found');
        }
        return this._getUVState.value;
    }

    getWeather(): string | undefined {
        if (!this._getWeatherState) {
            throw new Error('Weather state not found');
        }
        return this._getWeatherState.value;
    }

    getWindDirectionString(): string | undefined {
        if (!this._getWindDirectionState) {
            throw new Error('WindDirection state not found');
        }
        return this._getWindDirectionState.value;
    }

    getWindGust(): number | undefined {
        if (!this._getWindGustState) {
            throw new Error('WindGust state not found');
        }
        return this._getWindGustState.value;
    }

    getWindSpeed(): number | undefined {
        if (!this._getWindSpeedState) {
            throw new Error('WindSpeed state not found');
        }
        return this._getWindSpeedState.value;
    }
}

export default WeatherCurrent;