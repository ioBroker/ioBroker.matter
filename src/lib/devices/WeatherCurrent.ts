import { type DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import { GenericDevice, type DetectedDevice, type DeviceOptions, StateAccessType } from './GenericDevice';

export class WeatherCurrent extends GenericDevice {
    #getValueState?: DeviceStateObject<number>;
    #getIconState?: DeviceStateObject<string>;
    #getPrecipitationChanceState?: DeviceStateObject<number>;
    #getPrecipitationTypeState?: DeviceStateObject<number>;
    #getPressureState?: DeviceStateObject<number>;
    #getPressureTendencyState?: DeviceStateObject<string>;
    #getRealFeelTemperatureState?: DeviceStateObject<number>;
    #getHumidityState?: DeviceStateObject<number>;
    #getUVState?: DeviceStateObject<number>;
    #getWeatherState?: DeviceStateObject<string>;
    #getWindDirectionState?: DeviceStateObject<string>;
    #getWindGustState?: DeviceStateObject<number>;
    #getWindSpeedState?: DeviceStateObject<number>;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._construction.push(
            this.addDeviceStates([
                {
                    name: 'ACTUAL',
                    valueType: ValueType.Number,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Value,
                    callback: state => (this.#getValueState = state),
                },
                {
                    name: 'ICON',
                    valueType: ValueType.String,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Icon,
                    callback: state => (this.#getIconState = state),
                },
                {
                    name: 'PRECIPITATION_CHANCE',
                    valueType: ValueType.NumberPercent,
                    accessType: StateAccessType.Read,
                    type: PropertyType.PrecipitationChance,
                    callback: state => (this.#getPrecipitationChanceState = state),
                },
                {
                    name: 'PRECIPITATION_TYPE',
                    valueType: ValueType.NumberPercent,
                    accessType: StateAccessType.Read,
                    type: PropertyType.PrecipitationType,
                    callback: state => (this.#getPrecipitationTypeState = state),
                },
                {
                    name: 'PRESSURE',
                    valueType: ValueType.Number,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Pressure,
                    callback: state => (this.#getPressureState = state),
                },
                {
                    name: 'PRESSURE_TENDENCY',
                    valueType: ValueType.String,
                    accessType: StateAccessType.Read,
                    type: PropertyType.PressureTendency,
                    callback: state => (this.#getPressureTendencyState = state),
                },
                {
                    name: 'REAL_FEEL_TEMPERATURE',
                    valueType: ValueType.Number,
                    accessType: StateAccessType.Read,
                    type: PropertyType.RealFeelTemperature,
                    callback: state => (this.#getRealFeelTemperatureState = state),
                },
                {
                    name: 'HUMIDITY',
                    valueType: ValueType.NumberPercent,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Humidity,
                    callback: state => (this.#getHumidityState = state),
                },
                {
                    name: 'UV',
                    valueType: ValueType.Number,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Uv,
                    callback: state => (this.#getUVState = state),
                },
                {
                    name: 'WEATHER',
                    valueType: ValueType.String,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Weather,
                    callback: state => (this.#getWeatherState = state),
                },
                {
                    name: 'WIND_DIRECTION',
                    valueType: ValueType.String,
                    accessType: StateAccessType.Read,
                    type: PropertyType.WindDirectionString,
                    callback: state => (this.#getWindDirectionState = state),
                },
                {
                    name: 'WIND_GUST',
                    valueType: ValueType.Number,
                    accessType: StateAccessType.Read,
                    type: PropertyType.WindGust,
                    callback: state => (this.#getWindGustState = state),
                },
                {
                    name: 'WIND_SPEED',
                    valueType: ValueType.Number,
                    accessType: StateAccessType.Read,
                    type: PropertyType.WindSpeed,
                    callback: state => (this.#getWindSpeedState = state),
                },
            ]),
        );
    }

    getValue(): number | undefined {
        if (!this.#getValueState) {
            throw new Error('Value state not found');
        }
        return this.#getValueState.value;
    }

    getIcon(): string | undefined {
        if (!this.#getIconState) {
            throw new Error('Icon state not found');
        }
        return this.#getIconState.value;
    }

    getPrecipitationChance(): number | undefined {
        if (!this.#getPrecipitationChanceState) {
            throw new Error('PrecipitationChance state not found');
        }
        return this.#getPrecipitationChanceState.value;
    }

    getPrecipitationType(): number | undefined {
        if (!this.#getPrecipitationTypeState) {
            throw new Error('PrecipitationType state not found');
        }
        return this.#getPrecipitationTypeState.value;
    }

    getPressure(): number | undefined {
        if (!this.#getPressureState) {
            throw new Error('Pressure state not found');
        }
        return this.#getPressureState.value;
    }

    getPressureTendency(): string | undefined {
        if (!this.#getPressureTendencyState) {
            throw new Error('PressureTendency state not found');
        }
        return this.#getPressureTendencyState.value;
    }

    getRealFeelTemperature(): number | undefined {
        if (!this.#getRealFeelTemperatureState) {
            throw new Error('RealFeelTemperature state not found');
        }
        return this.#getRealFeelTemperatureState.value;
    }

    getHumidity(): number | undefined {
        if (!this.#getHumidityState) {
            throw new Error('Humidity state not found');
        }
        return this.#getHumidityState.value;
    }

    getUv(): number | undefined {
        if (!this.#getUVState) {
            throw new Error('UV state not found');
        }
        return this.#getUVState.value;
    }

    getWeather(): string | undefined {
        if (!this.#getWeatherState) {
            throw new Error('Weather state not found');
        }
        return this.#getWeatherState.value;
    }

    getWindDirectionString(): string | undefined {
        if (!this.#getWindDirectionState) {
            throw new Error('WindDirection state not found');
        }
        return this.#getWindDirectionState.value;
    }

    getWindGust(): number | undefined {
        if (!this.#getWindGustState) {
            throw new Error('WindGust state not found');
        }
        return this.#getWindGustState.value;
    }

    getWindSpeed(): number | undefined {
        if (!this.#getWindSpeedState) {
            throw new Error('WindSpeed state not found');
        }
        return this.#getWindSpeedState.value;
    }
}
