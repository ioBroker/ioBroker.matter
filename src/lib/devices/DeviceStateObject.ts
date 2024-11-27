import type { DetectorState, StateType } from '@iobroker/type-detector';
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
    LevelActual = 'levelActual', // read/write
    Longitude = 'longitude',
    LowBattery = 'lowBattery',
    LockState = 'lockState',
    LockStateActual = 'lockStateActual',
    Maintenance = 'maintenance',
    MapBase64 = 'mapBase64',
    MapUrl = 'mapUrl',
    Mode = 'mode',
    Motion = 'motion',
    Mute = 'mute',
    Next = 'next',
    NightMode = 'nightMode',
    Open = 'open',
    PTZ = 'ptz',
    Party = 'party',
    Pause = 'pause',
    Play = 'play',
    Power = 'power',
    PowerActual = 'powerActual',
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

interface StateDefinition extends DetectorState {
    isIoBrokerState: boolean;
}

/** Convert a StateType into an ioBroker common type value */
function asCommonType(type: StateType | undefined): ioBroker.CommonType {
    if (type === 'number' || type === 'string' || type === 'boolean') {
        return type;
    }
    return 'mixed';
}

export class DeviceStateObject<T> {
    value?: T;
    updateHandler?: (object: DeviceStateObject<T>) => Promise<void>;
    isEnum = false;
    object?: ioBroker.Object;
    modes?: { [key: string]: T };

    protected min?: number;
    protected max?: number;
    protected realMin?: number;
    protected realMax?: number;
    protected unit?: string;

    #isIoBrokerState: boolean;
    #id: string;

    static async create<T>(
        adapter: ioBroker.Adapter,
        state: StateDefinition,
        propertyType: PropertyType,
        valueType: ValueType,
        isEnabled: () => boolean,
        unitConversionMap: { [key: string]: (value: number, toDefaultUnit: boolean) => number } = {},
    ): Promise<DeviceStateObject<T>> {
        const obj = new DeviceStateObject<T>(adapter, state, propertyType, valueType, isEnabled, unitConversionMap);
        await obj.init();
        return obj;
    }

    constructor(
        protected readonly adapter: ioBroker.Adapter,
        public readonly state: StateDefinition,
        public readonly propertyType: PropertyType,
        protected readonly valueType: ValueType,
        protected readonly isEnabled: () => boolean,
        protected readonly unitConversionMap: { [key: string]: (value: number, toDefaultUnit: boolean) => number } = {},
    ) {
        this.isEnum = valueType === ValueType.Enum;
        this.#isIoBrokerState = state.isIoBrokerState;
        this.#id = state.id;
    }

    async init(): Promise<void> {
        const object = await this.adapter.getForeignObjectAsync(this.#id);
        if (!object) {
            if (this.#isIoBrokerState) {
                throw new Error(`State ${this.#id} not found`);
            }
            this.object = await this.createOrUpdateIoBrokerState();
        } else {
            this.object = this.#isIoBrokerState ? object : await this.createOrUpdateIoBrokerState(object);
        }
        if (this.isEnum) {
            this.parseMode();
        }
        this.parseMinMax(this.valueType === ValueType.NumberPercent);
    }

    async createOrUpdateIoBrokerState(currentObject?: ioBroker.Object): Promise<ioBroker.Object> {
        const type = Array.isArray(this.state.type) ? this.state.type[0] : this.state.type;
        const obj: ioBroker.Object = {
            _id: this.#id,
            type: 'state',
            common: {
                name: this.state.name,
                type: asCommonType(type ?? this.state.defaultType),
                write: this.state.write ?? false,
                read: this.state.read ?? true,
                // enums?
                role: this.state.defaultRole ?? 'state',
                unit: this.state.defaultUnit,
                states: this.state.defaultStates,
            },
            native: {},
        };
        if (currentObject !== undefined) {
            // When common matches the important fields then consider same object
            if (
                currentObject._id === obj._id &&
                currentObject.common.type === obj.common.type &&
                currentObject.common.write === obj.common.write &&
                currentObject.common.read === obj.common.read &&
                currentObject.common.role === obj.common.role &&
                currentObject.common.unit === obj.common.unit &&
                currentObject.common.states === obj.common.states
            ) {
                return currentObject;
            }
        }

        await this.adapter.extendObjectAsync(this.#id, {
            ...obj,
            common: { ...obj.common, name: undefined } as Partial<ioBroker.StateCommon>,
        } as ioBroker.PartialObject);
        return obj;
    }

    getMinMax(): { min: number; max: number } | null {
        if (this.min === undefined || this.max === undefined) {
            return null;
        }

        const min = this.convertValue(this.min, true);
        const max = this.convertValue(this.max, true);

        return { min: Math.min(min, max), max: Math.max(min, max) };
    }

    getUnit(): string | undefined {
        return this.unit;
    }

    get id(): string {
        return this.#id;
    }

    get role(): string {
        return this.object?.common.role ?? 'state';
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
                throw new Error(`State ${this.#id} is not a number`);
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

    /** Convert the value from the unit of the state to the Default unit ("toDefaultUnit"===true) or from default unit */
    convertValue(value: number, toDefaultUnit = false): number {
        if (this.unit && this.state.defaultUnit && this.unit !== this.state.defaultUnit) {
            if (this.unitConversionMap[this.unit]) {
                const convertedValue = this.unitConversionMap[this.unit](value, toDefaultUnit);
                this.adapter.log.debug(
                    `Converted value ${value} with ${this.unit} (to default: ${toDefaultUnit}): ${convertedValue}`,
                );
                return convertedValue;
            }
        }
        return value;
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

    /** Used for Matter devices to update the value */
    updateValue(value: T): Promise<void> {
        return this.setValue(value, true);
    }

    /** Used for ioBroker states to update the value */
    async setValue(value: T, isUpdate = false): Promise<void> {
        if (value === null || value === undefined) {
            throw new Error(`Value ${JSON.stringify(value)} is not valid`);
        }
        if (!this.object) {
            throw new Error(`Object not initialized`);
        }
        if (isUpdate && this.#isIoBrokerState) {
            throw new Error(`Cannot set value for ioBroker state ${this.#id}`);
        }
        if (!this.isEnabled()) {
            return;
        }

        const object = this.object;
        const valueType = object?.common?.type;

        if (typeof value === 'number') {
            // Convert the value from Default unit to the unit of the state
            value = this.convertValue(value, false) as T;
        }

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

            this.adapter.log.debug(`Set ${this.#id} to "${realValue}" (ack = ${!this.#isIoBrokerState})`);
            await this.adapter.setForeignStateAsync(this.#id, realValue as ioBroker.StateValue, !this.#isIoBrokerState);
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
                    this.adapter.log.debug(`Set ${this.#id} to "${realValue}" (ack = ${!this.#isIoBrokerState})`);
                    await this.adapter.setForeignStateAsync(
                        this.#id,
                        realValue as ioBroker.StateValue,
                        !this.#isIoBrokerState,
                    );
                } else if (valueType === 'number') {
                    const realValue: number = parseFloat(value as string);

                    if (object.common.min !== undefined && realValue < object.common.min) {
                        throw new Error(`Value ${JSON.stringify(value)} is less than min ${object.common.min}`);
                    }
                    if (object.common.max !== undefined && realValue > object.common.max) {
                        throw new Error(`Value ${JSON.stringify(value)} is greater than max ${object.common.max}`);
                    }

                    this.adapter.log.debug(`Set ${this.#id} to "${realValue}" (ack = ${!this.#isIoBrokerState})`);
                    await this.adapter.setForeignStateAsync(
                        this.#id,
                        realValue as ioBroker.StateValue,
                        !this.#isIoBrokerState,
                    );
                } else if (valueType === 'string') {
                    const realValue = String(value);
                    this.adapter.log.debug(`Set ${this.#id} to "${realValue}" (ack = ${!this.#isIoBrokerState})`);
                    await this.adapter.setForeignStateAsync(
                        this.#id,
                        realValue as ioBroker.StateValue,
                        !this.#isIoBrokerState,
                    );
                } else if (valueType === 'json') {
                    const realValue: string = JSON.stringify(value);
                    this.adapter.log.debug(`Set ${this.#id} to "${realValue}" (ack = ${!this.#isIoBrokerState})`);
                    await this.adapter.setForeignStateAsync(
                        this.#id,
                        realValue as ioBroker.StateValue,
                        !this.#isIoBrokerState,
                    );
                } else if (valueType === 'mixed') {
                    this.adapter.log.debug(
                        `Set ${this.#id} to ${JSON.stringify(value)} (ack = ${!this.#isIoBrokerState})`,
                    );
                    await this.adapter.setForeignStateAsync(
                        this.#id,
                        value as ioBroker.StateValue,
                        !this.#isIoBrokerState,
                    );
                }
                return;
            }

            if (valueType === 'number') {
                if (object.common.min !== undefined && value < object.common.min) {
                    throw new Error(`Value ${JSON.stringify(value)} is less than min ${object.common.min}`);
                }
                if (object.common.max !== undefined && value > object.common.max) {
                    throw new Error(`Value ${JSON.stringify(value)} is greater than max ${object.common.max}`);
                }

                if (typeof value === 'number') {
                    value = parseFloat(value.toFixed(4)) as T;
                }
            }

            this.adapter.log.debug(`Set ${this.#id} to ${JSON.stringify(value)} (ack = ${!this.#isIoBrokerState})`);
            await this.adapter.setForeignStateAsync(this.#id, value as ioBroker.StateValue, !this.#isIoBrokerState);
        }
    }

    updateState = async (state: ioBroker.State, ignoreEnabledStatus = false): Promise<void> => {
        if (state.ack !== this.#isIoBrokerState || (!this.isEnabled() && !ignoreEnabledStatus)) {
            // For Device implementation only acked values are considered to be forwarded to the controllers
            return;
        }

        let value = state.val;
        if (typeof value === 'number') {
            // Convert the value from the unit of the state to the Default unit
            value = this.convertValue(value, true);
        }

        // convert value to percent if realMin and realMax are set
        if (this.realMin !== undefined && this.realMax !== undefined) {
            // convert values
            value = parseFloat(value as string);
            this.value = (((value - this.realMin) / (this.realMax - this.realMin)) * 100) as T;
        } else {
            this.value = value as T;
        }
        if (this.updateHandler) {
            await this.updateHandler(this);
        }
    };

    async subscribe(handler: (object: DeviceStateObject<T>) => Promise<void>): Promise<void> {
        this.updateHandler = handler;
        await SubscribeManager.subscribe(this.#id, this.updateState);
        // read first time the state
        try {
            const value = await this.adapter.getForeignStateAsync(this.#id);
            if (value) {
                await this.updateState(value);
            }
        } catch (e) {
            this.adapter.log.warn(`Cannot get state ${this.#id}: ${e}`);
        }
    }

    async unsubscribe(): Promise<void> {
        await SubscribeManager.unsubscribe(this.#id, this.updateState);
        this.updateHandler = undefined;
    }

    get ioBrokerState(): DetectorState {
        return this.state;
    }
}
