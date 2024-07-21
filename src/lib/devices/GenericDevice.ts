// @iobroker/device-types

import { DetectorState, Types } from '@iobroker/type-detector';
import SubscribeManager from '../SubscribeManager';

// take here https://github.com/ioBroker/ioBroker.type-detector/blob/master/DEVICES.md#temperature-temperature
// export enum DeviceType {
//     AirCondition = 'airCondition',
//     Blind = 'blind',
//     BlindButtons = 'blindButtons',
//     Button = 'button',
//     ButtonSensor = 'buttonSensor',
//     Camera = 'camera',
//     Url = 'url',
//     Chart = 'chart',
//     Image = 'image',
//     Dimmer = 'dimmer',
//     Door = 'door',
//     FireAlarm = 'fireAlarm',
//     FloodAlarm = 'floodAlarm',
//     Gate = 'gate',
//     Humidity = 'humidity',
//     Info = 'info',
//     Light = 'light',
//     Lock = 'lock',
//     Location = 'location',
//     Media = 'media',
//     Motion = 'motion',
//     Rgb = 'rgb',
//     Ct = 'ct',
//     RgbSingle = 'rgbSingle',
//     RgbwSingle = 'rgbwSingle',
//     Hue = 'hue',
//     Cie = 'cie',
//     Slider = 'slider',
//     Socket = 'socket',
//     Temperature = 'temperature',
//     Thermostat = 'thermostat',
//     Volume = 'volume',
//     VacuumCleaner = 'vacuumCleaner',
//     VolumeGroup = 'volumeGroup',
//     Window = 'window',
//     WindowTilt = 'windowTilt',
//     WeatherCurrent = 'weatherCurrent',
//     WeatherForecast = 'weatherForecast',
//     Warning = 'warning',
// }

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

export interface DeviceOptions {
    dimmerOnLevel?: number;
    dimmerUseLastLevelForOn?: boolean;
    actionAllowedByIdentify?: boolean;
}

export class DeviceStateObject<T> {
    value: T | undefined;

    updateHandler: ((object: DeviceStateObject<T>) => void) | undefined;

    isEnum: boolean = false;

    object: Promise<ioBroker.Object>;

    modes: Promise<{ [key: string]: T }> | undefined;

    protected min: number | undefined;
    protected max: number | undefined;
    protected realMin: number | undefined;
    protected realMax: number | undefined;
    protected unit: string | undefined;

    constructor(
        protected adapter: ioBroker.Adapter,
        public state: DetectorState,
        public propertyType: PropertyType,
        valueType: ValueType,
    ) {
        this.isEnum = valueType === ValueType.Enum;
        this.object = this.adapter.getForeignObjectAsync(this.state.id) as Promise<ioBroker.Object>;

        if (this.isEnum) {
            this.parseMode();
        }
        this.parseMinMax(valueType === ValueType.NumberPercent);
    }

    public async init(): Promise<void> {
        await this.object;
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

    protected parseMinMax(percent: boolean = false): void {
        if (!this.object) {
            return;
        }
        this.object.then(obj => {
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
                    this.max = 0;
                }
                this.unit = obj?.common?.unit;
            }
        });
    }

    protected parseMode(): void {
        if (!this.object) {
            return;
        }
        this.modes = this.object.then(obj => {
            // {'MODE_VALUE': 'MODE_TEXT'}
            let modes: { [key: string]: T } = obj?.common?.states;
            if (modes) {
                // convert ['Auto'] => {'Auto': 'AUTO'}
                if (Array.isArray(modes)) {
                    const _m: { [key: string]: T } = {};
                    modes.forEach((mode: T) => (_m[mode as string] = (mode as string).toUpperCase() as T));
                    modes = _m;
                }
                return modes;
            } else {
                return {};
            }
        });
    }

    async getModes(): Promise<T[]> {
        const modes = await this.modes;
        if (!modes) {
            return [];
        }
        return Object.keys(modes).map(key => modes[key]);
    }

    async setValue(value: T): Promise<void> {
        if (value === null || value === undefined) {
            throw new Error(`Value ${value} is not valid`);
        }
        const object = await this.object;
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
                    const realValue: string = value.toString();
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
            }

            await this.adapter.setForeignStateAsync(this.state.id, value as ioBroker.StateValue);
        }
    }

    protected updateState = (state: ioBroker.State): void => {
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

    public async subscribe(handler: (object: DeviceStateObject<T>) => void): Promise<void> {
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

    public async unsubscribe(): Promise<void> {
        await SubscribeManager.unsubscribe(this.state.id, this.updateState);
    }

    public getIoBrokerState(): DetectorState {
        return this.state;
    }
}

export interface DetectedDevice {
    type: Types;
    states: DetectorState[];
}

export interface DeviceStateDescription {
    name: string;
    type: PropertyType;
    valueType: ValueType;
    unit?: string;
    callback: (state: DeviceStateObject<any> | undefined) => void;
    accessType: StateAccessType;
}

export enum StateAccessType {
    Read = 0,
    Write = 1,
    ReadWrite = 2,
}

interface StateDescription {
    name: string;
    accessType: StateAccessType;
    valueType: ValueType;
    read?: string; // Object ID to read value
    write?: string; // Object ID to write value
    min?: number;
    max?: number;
    unit?: string;
}

abstract class GenericDevice {
    protected _properties: { [id: string]: StateDescription } = {};
    protected _possibleProperties: { [id: string]: StateDescription } = {};
    protected adapter: ioBroker.Adapter;
    protected _subscribeObjects: DeviceStateObject<any>[] = [];
    protected _deviceType: Types;
    protected _detectedDevice: DetectedDevice;
    protected handlers: ((event: { property: PropertyType; value: any; device: GenericDevice }) => void)[] = [];

    protected _errorState: DeviceStateObject<boolean> | undefined;
    protected _maintenanceState: DeviceStateObject<boolean> | undefined;
    protected _unreachState: DeviceStateObject<boolean> | undefined;
    protected _lowbatState: DeviceStateObject<boolean> | undefined;
    protected _workingState: DeviceStateObject<string> | undefined;
    protected _directionState: DeviceStateObject<string> | undefined;
    protected _ready: Promise<void>[] = [];

    constructor(
        detectedDevice: DetectedDevice,
        adapter: ioBroker.Adapter,
        protected options?: DeviceOptions | undefined,
    ) {
        this.adapter = adapter;
        this._deviceType = detectedDevice.type;
        this._detectedDevice = detectedDevice;

        this._ready.push(
            this.addDeviceStates([
                {
                    name: 'ERROR',
                    valueType: ValueType.Boolean,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Error,
                    callback: state => (this._errorState = state),
                },
                {
                    name: 'MAINTAIN',
                    valueType: ValueType.Boolean,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Maintenance,
                    callback: state => (this._maintenanceState = state),
                },
                {
                    name: 'UNREACH',
                    valueType: ValueType.Boolean,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Unreachable,
                    callback: state => (this._unreachState = state),
                },
                {
                    name: 'LOWBAT',
                    valueType: ValueType.Boolean,
                    accessType: StateAccessType.Read,
                    type: PropertyType.LowBattery,
                    callback: state => (this._lowbatState = state),
                },
                {
                    name: 'WORKING',
                    valueType: ValueType.Boolean,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Working,
                    callback: state => (this._workingState = state),
                },
                {
                    name: 'DIRECTION',
                    valueType: ValueType.Boolean,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Direction,
                    callback: state => (this._directionState = state),
                },
            ]),
        );
    }

    isActionAllowedByIdentify(): boolean {
        return !!this.options?.actionAllowedByIdentify;
    }

    async init(): Promise<void> {
        await Promise.all(this._ready);
    }
    async addDeviceState<T>(
        name: string,
        type: PropertyType,
        callback: (state: DeviceStateObject<T> | undefined) => void,
        accessType: StateAccessType,
        valueType: ValueType,
    ): Promise<void> {
        const state = this.getDeviceState(name);
        let object: DeviceStateObject<T> | undefined;
        if (state) {
            object = new DeviceStateObject(this.adapter, state, type, valueType);
            await object.init();
            const data = object.getIoBrokerState();
            if (!this._properties[type]) {
                this._properties[type] = { name, accessType, valueType };
                if (accessType === StateAccessType.ReadWrite) {
                    this._properties[type].read = data.id;
                    this._properties[type].write = data.id;
                } else if (accessType === StateAccessType.Read) {
                    this._properties[type].read = data.id;
                } else if (accessType === StateAccessType.Write) {
                    this._properties[type].write = data.id;
                }
            } else {
                if (this._properties[type].valueType !== valueType) {
                    throw new Error(
                        `Property ${type} has already a different value type: ${this._properties[type].valueType} !== ${valueType}`,
                    );
                }

                if (accessType === StateAccessType.ReadWrite) {
                    this._properties[type].accessType = accessType;
                } else if (
                    accessType === StateAccessType.Write &&
                    this._properties[type].accessType === StateAccessType.Read
                ) {
                    this._properties[type].accessType = StateAccessType.ReadWrite;
                } else if (
                    accessType === StateAccessType.Read &&
                    this._properties[type].accessType === StateAccessType.Write
                ) {
                    this._properties[type].accessType = StateAccessType.ReadWrite;
                }
                if (accessType === StateAccessType.Read) {
                    this._properties[type].read = data.id;
                } else if (accessType === StateAccessType.Write) {
                    this._properties[type].write = data.id;
                } else if (accessType === StateAccessType.ReadWrite) {
                    this._properties[type].read = this._properties[type].read || data.id;
                    this._properties[type].write = data.id;
                }
            }
            if (this._possibleProperties[type]) {
                delete this._possibleProperties[type];
            }
            if (
                this._properties[type].accessType === StateAccessType.ReadWrite ||
                this._properties[type].accessType === StateAccessType.Read
            ) {
                const stateId = object?.getIoBrokerState().id;
                // subscribe and read only if not already subscribed
                if (stateId && !this._subscribeObjects.find(obj => obj.state.id === stateId)) {
                    if (this._properties[type].accessType === StateAccessType.ReadWrite) {
                        // subscribe only if read and write are the same, else we have already subscribed on read
                        if (this._properties[type].read === this._properties[type].write) {
                            await object.subscribe(this.updateState);
                            this._subscribeObjects.push(object);
                        }
                    } else {
                        await object.subscribe(this.updateState);
                        this._subscribeObjects.push(object);
                    }
                }
            }
        } else {
            // for tests
            if (!this._possibleProperties[type]) {
                this._possibleProperties[type] = { name, accessType, valueType };
            } else {
                if (accessType === StateAccessType.ReadWrite) {
                    this._possibleProperties[type].accessType = accessType;
                } else if (
                    accessType === StateAccessType.Write &&
                    this._possibleProperties[type].accessType === StateAccessType.Read
                ) {
                    this._possibleProperties[type].accessType = StateAccessType.ReadWrite;
                } else if (
                    accessType === StateAccessType.Read &&
                    this._possibleProperties[type].accessType === StateAccessType.Write
                ) {
                    this._possibleProperties[type].accessType = StateAccessType.ReadWrite;
                }
            }
        }
        callback(object);
    }

    getDeviceState(name: string): DetectorState | undefined {
        return this._detectedDevice.states.find(state => state.name === name && state.id);
    }

    async addDeviceStates(states: DeviceStateDescription[]): Promise<void> {
        for (let i = 0; i < states.length; i++) {
            // we cannot give the whole object as it must be cast to T
            await this.addDeviceState(
                states[i].name,
                states[i].type,
                states[i].callback,
                states[i].accessType,
                states[i].valueType,
            );
        }
    }

    getPropertyValue(property: PropertyType): boolean | number | string | null | undefined {
        if (this._properties[property] === undefined) {
            throw new Error(`Property ${property} not found`);
        } else if (this._properties[property].accessType === StateAccessType.Write) {
            throw new Error(`Property ${property} is write only`);
        }
        const method: string = `get${property[0].toUpperCase()}${property.substring(1)}`;
        if (method in this) {
            // @ts-expect-error How to fix it?
            return this[method]();
        }
        throw new Error(`Method _getPropertyValue for ${property} is not implemented in ${this.constructor.name}`);
    }

    async setPropertyValue(property: PropertyType, value: boolean | number | string): Promise<void> {
        if (this._properties[property] === undefined) {
            throw new Error(`Property ${property} not found`);
        } else if (this._properties[property].accessType === StateAccessType.Read) {
            throw new Error(`Property ${property} is read only`);
        }
        const method = `set${property[0].toUpperCase()}${property.substring(1)}`;
        if (method in this) {
            // @ts-expect-error How to fix it?
            await this[method](value);
        } else {
            throw new Error(
                `Method _setPropertyValue for ${property} and ${value} is not implemented in ${this.constructor.name}`,
            );
        }
    }

    getDeviceType(): Types | undefined {
        return this._deviceType;
    }

    protected updateState = <T>(object: DeviceStateObject<T>): void => {
        this.handlers.forEach(handler =>
            handler({
                property: object.propertyType,
                value: object.value,
                device: this,
            }),
        );
    };

    protected async _doUnsubscribe(): Promise<void> {
        for (let i = 0; i < this._subscribeObjects.length; i++) {
            await this._subscribeObjects[i].unsubscribe();
        }
    }

    async destroy(): Promise<void> {
        await this._doUnsubscribe();
    }

    getProperties(): { [key: string]: any } {
        return this._properties;
    }

    getPossibleProperties(): { [key: string]: any } {
        return this._possibleProperties;
    }

    getPropertyNames(): PropertyType[] {
        const properties: PropertyType[] = [];
        const keys = Object.keys(this._properties);
        for (let i = 0; i < keys.length; i++) {
            properties.push(keys[i] as PropertyType);
        }
        return properties;
    }

    getPropertyReadWriteTypes(): { [key: string]: StateAccessType } {
        const result: { [key: string]: StateAccessType } = {};
        const keys = Object.keys(this._properties);
        for (let i = 0; i < keys.length; i++) {
            result[keys[i]] = this._properties[keys[i]].accessType;
        }
        return result;
    }

    getError(): boolean | number | undefined {
        if (!this._errorState) {
            throw new Error('Error state not found');
        }
        return this._errorState.value;
    }

    getMaintenance(): boolean | number | undefined {
        if (!this._maintenanceState) {
            throw new Error('Maintenance state not found');
        }
        return this._maintenanceState.value;
    }

    getUnreachable(): boolean | number | undefined {
        if (!this._unreachState) {
            throw new Error('Unreachable state not found');
        }
        return this._unreachState.value;
    }

    getLowBattery(): boolean | number | undefined {
        if (!this._lowbatState) {
            throw new Error('Low battery state not found');
        }
        return this._lowbatState.value;
    }

    getWorking(): string | undefined {
        if (!this._workingState) {
            throw new Error('Working state not found');
        }
        return this._workingState.value;
    }

    getDirection(): string | undefined {
        if (!this._directionState) {
            throw new Error('Direction state not found');
        }
        return this._directionState.value;
    }

    onChange<T>(handler: (event: { property: PropertyType; value: T }) => void): void {
        this.handlers.push(handler);
    }

    offChange<T>(handler: (event: { property: PropertyType; value: T }) => void): void {
        if (!handler) {
            this.handlers = [];
        } else {
            const index = this.handlers.indexOf(handler);
            if (index !== -1) {
                this.handlers.splice(index, 1);
            } else {
                throw new Error('Handler not found');
            }
        }
    }
    clearChangeHandlers(): void {
        this.handlers = [];
    }
}

export default GenericDevice;
