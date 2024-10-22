import { DetectorState } from '@iobroker/type-detector';
import SubscribeManager from '../SubscribeManager';

export enum ValueType {
    String = 'string',
    Number = 'number',
    NumberMinMax = 'numberMM',
    NumberPercent = 'numberPercent',
    Boolean = 'boolean',
    Button = 'button',
    Enum = 'enum',
}

export enum PropertyType {
    Accuracy = 'accuracy',
    Album = 'album',
    Artist = 'artist',
    AutoFocus = 'autoFocus',
    AutoWhiteBalance = 'autoWhiteBalance',
    Battery = 'battery',
    Blue = 'blue',
    Boost = 'boost',
    Brightness = 'brightness',
    Brush = 'brush',
    Cie = 'cie', // CIE color
    Close = 'close',
    Connected = 'connected',
    Consumption = 'consumption',
    Cover = 'cover',
    Current = 'current',
    Date = 'date',
    DayOfWeek = 'dayOfWeek',
    Description = 'description',
    Dimmer = 'dimmer',
    Direction = 'direction',
    Duration = 'duration',
    Elapsed = 'elapsed',
    ElectricPower = 'electricPower',
    Elevation = 'elevation',
    EndTime = 'endTime',
    Episode = 'episode',
    Error = 'error',
    FeelsLike = 'feelsLike',
    File = 'file',
    Filter = 'filter',
    ForecastChart = 'forecastChart',
    Frequency = 'frequency',
    GPS = 'gps',
    Green = 'green',
    HistoryChart = 'historyChart',
    Hue = 'hue',
    Humidity = 'humidity',
    Icon = 'icon',
    Info = 'info',
    Latitude = 'latitude',
    Level = 'level', // read/write
    Longitude = 'longitude',
    LowBattery = 'lowBattery',
    Maintenance = 'maintenance',
    MapBase64 = 'mapBase64',
    MapUrl = 'mapUrl',
    Mode = 'mode',
    Mute = 'mute',
    Next = 'next',
    NightMode = 'nightMode',
    Open = 'open',
    PTZ = 'ptz',
    Party = 'party',
    Pause = 'pause',
    Play = 'play',
    Power = 'power',
    Precipitation = 'precipitation',
    PrecipitationChance = 'precipitationChance',
    PrecipitationType = 'precipitationType',
    Press = 'press',
    PressLong = 'pressLong',
    Pressure = 'pressure',
    PressureTendency = 'pressureTendency',
    Previous = 'previous',
    Radius = 'radius',
    RealFeelTemperature = 'realFeelTemperature',
    Red = 'red',
    Repeat = 'repeat',
    Rgb = 'rgb',
    Rgbw = 'rgbw',
    Saturation = 'saturation',
    Season = 'season',
    Seek = 'seek',
    Sensors = 'sensors',
    Shuffle = 'shuffle',
    SideBrush = 'sideBrush',
    Speed = 'speed',
    StartTime = 'startTime',
    State = 'state',
    Stop = 'stop',
    Swing = 'swing',
    TemperatureMax = 'temperatureMax',
    TemperatureMin = 'temperatureMin',
    Temperature = 'temperature',
    TiltClose = 'tiltClose',
    TiltLevel = 'tiltLevel',
    TiltOpen = 'tiltOpen',
    TiltStop = 'tiltStop',
    TimeSunrise = 'timeSunrise',
    TimeSunset = 'timeSunset',
    Title = 'title',
    Track = 'track',
    Uv = 'uv',
    Unreachable = 'unreachable',
    Url = 'url',
    Value = 'value', // read only
    Voltage = 'voltage',
    Volume = 'volume',
    Warning = 'warning',
    Waste = 'waste',
    WasteAlarm = 'wasteAlarm',
    Water = 'water',
    WaterAlarm = 'waterAlarm',
    Weather = 'weather',
    WindChill = 'windChill',
    WindDirectionNumber = 'windDirectionNumber',
    WindDirectionString = 'windDirectionString',
    WindGust = 'windGust',
    WindIcon = 'windIcon',
    WindSpeed = 'windSpeed',
    White = 'white',
    WorkMode = 'workMode',
    Working = 'working',
}

export class DeviceStateObject<T> {
    value?: T;
    updateHandler?: (object: DeviceStateObject<T>) => void;
    isEnum = false;
    object?: ioBroker.Object;
    modes?: { [key: string]: T };

    protected min?: number;
    protected max?: number;
    protected realMin?: number;
    protected realMax?: number;
    protected unit?: string;

    static async create<T>(
        adapter: ioBroker.Adapter,
        state: DetectorState,
        propertyType: PropertyType,
        valueType: ValueType,
        isEnabled: () => boolean,
    ): Promise<DeviceStateObject<T>> {
        const obj = new DeviceStateObject<T>(adapter, state, propertyType, valueType, isEnabled);
        await obj.init(valueType);
        return obj;
    }

    constructor(
        protected adapter: ioBroker.Adapter,
        public state: DetectorState,
        public propertyType: PropertyType,
        valueType: ValueType,
        protected isEnabled: () => boolean,
    ) {
        this.isEnum = valueType === ValueType.Enum;
    }

    async init(valueType: ValueType): Promise<void> {
        const object = await this.adapter.getForeignObjectAsync(this.state.id);
        if (!object) {
            throw new Error(`State ${this.state.id} not found`);
        }
        this.object = object;
        if (this.isEnum) {
            this.parseMode();
        }
        this.parseMinMax(valueType === ValueType.NumberPercent);
    }

    getMinMax(): { min: number; max: number } | null {
        if (this.min === undefined || this.max === undefined) {
            return null;
        }
        return { min: this.min, max: this.max };
    }

    getUnit(): string | undefined {
        return this.unit;
    }

    protected parseMinMax(percent = false): void {
        if (!this.object) {
            throw new Error(`Object not initialized`);
        }
        const obj = this.object;
        if (percent) {
            this.min = 0;
            this.max = 100;
            this.realMin = obj?.common?.min || 0;
            this.realMax = obj?.common?.max === undefined || obj?.common?.max === null ? 100 : obj?.common?.max;
            this.unit = '%';
            if (obj.common.type !== 'number') {
                throw new Error(`State ${this.state.id} is not a number`);
            }
        } else {
            this.min = obj?.common?.min;
            this.max = obj?.common?.max;
            if (this.min !== undefined && this.max === undefined) {
                this.max = 100;
            } else if (this.min === undefined && this.max !== undefined) {
                this.min = 0;
            }
            this.unit = obj?.common?.unit;
        }
    }

    protected parseMode(): void {
        if (!this.object) {
            throw new Error(`Object not initialized`);
        }
        const obj = this.object;
        // {'MODE_VALUE': 'MODE_TEXT'}
        let modes: { [key: string]: T } = obj?.common?.states;
        if (modes) {
            // convert ['Auto'] => {'Auto': 'AUTO'}
            if (Array.isArray(modes)) {
                const _m: { [key: string]: T } = {};
                modes.forEach((mode: T) => (_m[mode as string] = (mode as string).toUpperCase() as T));
                modes = _m;
            }
            this.modes = modes;
        } else {
            this.modes = {};
        }
    }

    getModes(): T[] {
        if (!this.object) {
            throw new Error(`Object not initialized`);
        }
        const modes = this.modes;
        if (!modes) {
            return [];
        }
        return Object.keys(modes).map(key => modes[key]);
    }

    async setValue(value: T): Promise<void> {
        if (value === null || value === undefined) {
            throw new Error(`Value ${value} is not valid`);
        }
        if (!this.object) {
            throw new Error(`Object not initialized`);
        }
        if (!this.isEnabled()) {
            return;
        }

        const object = this.object;
        const valueType = object?.common?.type;

        this.value = value;
        if (this.realMin !== undefined && this.realMax !== undefined) {
            // convert values
            let realValue: number = parseFloat(value as string);
            realValue = (realValue / 100) * (this.realMax - this.realMin) + this.realMin;

            if (object.common.min !== undefined && realValue < object.common.min) {
                throw new Error(`Value ${realValue} is less than min ${object.common.min}`);
            }
            if (object.common.max !== undefined && realValue > object.common.max) {
                throw new Error(`Value ${realValue} is greater than max ${object.common.max}`);
            }

            await this.adapter.setForeignStateAsync(this.state.id, realValue as ioBroker.StateValue);
        } else {
            // convert value
            if (typeof value !== valueType) {
                if (valueType === 'boolean') {
                    const realValue: boolean =
                        value === 'true' ||
                        value === '1' ||
                        value === 1 ||
                        value === true ||
                        value === 'on' ||
                        value === 'ON';
                    await this.adapter.setForeignStateAsync(this.state.id, realValue as ioBroker.StateValue);
                } else if (valueType === 'number') {
                    const realValue: number = parseFloat(value as string);

                    if (object.common.min !== undefined && realValue < object.common.min) {
                        throw new Error(`Value ${value} is less than min ${object.common.min}`);
                    }
                    if (object.common.max !== undefined && realValue > object.common.max) {
                        throw new Error(`Value ${value} is greater than max ${object.common.max}`);
                    }

                    await this.adapter.setForeignStateAsync(this.state.id, realValue as ioBroker.StateValue);
                } else if (valueType === 'string') {
                    const realValue: string = String(value);
                    await this.adapter.setForeignStateAsync(this.state.id, realValue as ioBroker.StateValue);
                } else if (valueType === 'json') {
                    const realValue: string = JSON.stringify(value);
                    await this.adapter.setForeignStateAsync(this.state.id, realValue as ioBroker.StateValue);
                } else if (valueType === 'mixed') {
                    await this.adapter.setForeignStateAsync(this.state.id, value as ioBroker.StateValue);
                }
                return;
            }

            if (valueType === 'number') {
                if (object.common.min !== undefined && value < object.common.min) {
                    throw new Error(`Value ${value} is less than min ${object.common.min}`);
                }
                if (object.common.max !== undefined && value > object.common.max) {
                    throw new Error(`Value ${value} is greater than max ${object.common.max}`);
                }

                if (typeof value === 'number') {
                    value = parseFloat(value.toFixed(4)) as T;
                }
            }

            await this.adapter.setForeignStateAsync(this.state.id, value as ioBroker.StateValue);
        }
    }

    updateState = (state: ioBroker.State, ignoreEnabledStatus = false): void => {
        if (!state.ack || (!this.isEnabled() && !ignoreEnabledStatus)) {
            // For Device implementation only acked values are considered to be forwarded to the controllers
            return;
        }
        // convert value to percent if realMin and realMax are set
        if (this.realMin !== undefined && this.realMax !== undefined) {
            // convert values
            const _value = parseFloat(state.val as string);
            this.value = (((_value - this.realMin) / (this.realMax - this.realMin)) * 100) as T;
        } else {
            this.value = state.val as T;
        }
        if (this.updateHandler) {
            this.updateHandler(this);
        }
    };

    async subscribe(handler: (object: DeviceStateObject<T>) => void): Promise<void> {
        this.updateHandler = handler;
        await SubscribeManager.subscribe(this.state.id, this.updateState);
        // read first time the state
        try {
            const value = await this.adapter.getForeignStateAsync(this.state.id);
            if (value) {
                this.updateState(value);
            }
        } catch (e) {
            this.adapter.log.warn(`Cannot get state ${this.state.id}: ${e}`);
        }
    }

    async unsubscribe(): Promise<void> {
        await SubscribeManager.unsubscribe(this.state.id, this.updateState);
    }

    getIoBrokerState(): DetectorState {
        return this.state;
    }
}
