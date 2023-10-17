// @iobroker/device-types

import { DeviceState } from '../iobroker.type-detector';
import SubscribeManager from './SubscribeManager';

// take here https://github.com/ioBroker/ioBroker.type-detector/blob/master/DEVICES.md#temperature-temperature
export enum DeviceType {
    Light = 'light',
    Switch = 'switch',
    Temperature = 'temperature',
    Dimmer = 'dimmer',
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
    Cie = 'cie',
    Close = 'close',
    Connected = 'connected',
    Consumption = 'consumption',
    Cover = 'cover',
    Current = 'current',
    Date = 'date',
    DayOfWeek = 'dayOfWeek',
    Desc = 'desc',
    Dimmer = 'dimmer',
    Direction = 'direction',
    Duration = 'duration',
    Elapsed = 'elapsed',
    ElectricPower = 'electricPower',
    Elevation = 'elevation',
    End = 'end',
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
    Lowbat = 'lowbat',
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
    Position = 'position',
    Power = 'power',
    Precipitation = 'precipitation',
    PrecipitationChance = 'precipitationChance',
    PrecipitationType = 'precipitationType',
    Press = 'press',
    PressLong = 'pressLong',
    Pressure = 'pressure',
    PressureTendency = 'pressureTendency',
    Prev = 'prev',
    Radius = 'radius',
    RealFeelTemperature = 'realFeelTemperature',
    Red = 'red',
    Repeat = 'repeat',
    Rgb = 'rgb',
    Rgbw = 'rgbw',
    Saturation = 'saturation',
    Season = 'season',
    Secondary = 'secondary',
    Seek = 'seek',
    Sensors = 'sensors',
    Shuffle = 'shuffle',
    SideBrush = 'sideBrush',
    Speed = 'speed',
    Start = 'start',
    State = 'state',
    Stop = 'stop',
    Swing = 'swing',
    Temp = 'temp',
    TempMax = 'tempMax',
    TempMin = 'tempMin',
    Temperature = 'temperature',
    TiltClose = 'tiltClose',
    TiltLevel = 'tiltLevel',
    TiltOpen = 'tiltOpen',
    TiltStop = 'tiltStop',
    TiltValue = 'tiltValue',
    TimeSunrise = 'timeSunrise',
    TimeSunset = 'timeSunset',
    Title = 'title',
    Track = 'track',
    UV = 'uv',
    Unreach = 'unreach',
    Url = 'url',
    Value = 'value', // read only
    Voltage = 'voltage',
    Volume = 'volume',
    VolumeActual = 'volumeActual',
    Warning = 'warning',
    Waste = 'waste',
    WasteAlarm = 'wasteAlarm',
    Water = 'water',
    WaterAlarm = 'waterAlarm',
    Weather = 'weather',
    WindChill = 'windChill',
    WindDirection = 'windDirection',
    WindDirectionStr = 'windDirectionStr',
    WindGust = 'windGust',
    WindIcon = 'windIcon',
    WindSpeed = 'windSpeed',
    WorkMode = 'workMode',
    Working = 'working',
}

export class DeviceStateObject<T> {
    protected _adapter: ioBroker.Adapter;

    state: DeviceState;

    value: T | undefined;

    updateHandler: ((id: string, object: DeviceStateObject<T>) => void) | undefined;

    isEnum: boolean = false;

    object: Promise<ioBroker.Object>;

    modes: Promise<{ [key: string]: T }> | undefined;

    propertyType: PropertyType;

    constructor(adapter: ioBroker.Adapter, state: DeviceState, _propertyType: PropertyType, _isEnum?: boolean) {
        this._adapter = adapter;
        this.state = state;
        this.propertyType = _propertyType;
        this.isEnum = _isEnum || false;
        this.object = this._adapter.getObjectAsync(this.state.id) as Promise<ioBroker.Object>;
        if (this.isEnum) {
            this.parseMode();
        }
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
                    modes.forEach((mode: T) => _m[mode as string] = ((mode as string).toUpperCase()) as T);
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
        const object = await this.object;
        if (object.common.min !== undefined && value < object.common.min) {
            throw new Error(`Value ${value} is less than min ${object.common.min}`);
        }
        if (object.common.max !== undefined && value > object.common.max) {
            throw new Error(`Value ${value} is greater than max ${object.common.max}`);
        }

        await this._adapter.setStateAsync(this.state.id, value as ioBroker.StateValue);
    }

    protected updateState = (id: string, state: ioBroker.State): void => {
        // let property: PropertyType | undefined
        this.value = state.val as T;
        if (this.updateHandler) {
            this.updateHandler(id, this);
        }
    };

    public async subscribe(handler: (id: string, object: DeviceStateObject<T>) => void): Promise<void> {
        this.updateHandler = handler;
        await SubscribeManager.subscribe(this.state.id, this.updateState);
    }

    public async unsubscribe(): Promise<void> {
        await SubscribeManager.unsubscribe(this.state.id, this.updateState);
    }
}

export interface DetectedDevice {
    type: DeviceType;
    states: DeviceState[];
}

abstract class GenericDevice {
    protected _properties: PropertyType[] = [];
    protected _adapter: ioBroker.Adapter;
    protected _subscribeObjects: DeviceStateObject<any>[] = [];
    protected _deviceType: DeviceType;
    protected _detectedDevice: DetectedDevice;
    protected handlers: ((event: {
        property: PropertyType
        value: any
    }) => void)[] = [];

    protected _errorState: DeviceStateObject<boolean> | undefined;
    protected _maintenanceState: DeviceStateObject<boolean> | undefined;
    protected _unreachState: DeviceStateObject<boolean> | undefined;
    protected _lowbatState: DeviceStateObject<boolean> | undefined;
    protected _workingState: DeviceStateObject<string> | undefined;
    protected _directionState: DeviceStateObject<string> | undefined;
    protected _ready: Promise<void>[] = [];

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter) {
        console.log('Generic Device');
        this._adapter = adapter;
        this._deviceType = detectedDevice.type;
        this._detectedDevice = detectedDevice;

        this._ready.push(this.addDeviceStates([
            { name: 'ERROR', type: PropertyType.Error, callback: state => this._errorState = state },
            { name: 'MAINTAIN', type: PropertyType.Maintenance, callback: state => this._maintenanceState = state },
            { name: 'UNREACH', type: PropertyType.Unreach, callback: state => this._unreachState = state },
            { name: 'LOWBAT', type: PropertyType.Lowbat, callback: state => this._lowbatState = state },
            { name: 'WORKING', type: PropertyType.Working, callback: state => this._workingState = state },
            { name: 'DIRECTION', type: PropertyType.Direction, callback: state => this._directionState = state },
        ]));
    }

    async init(): Promise<void> {
        await Promise.all(this._ready);
    }

    getDeviceState(name: string): DeviceState | undefined {
        return this._detectedDevice.states.find(state => state.name === name && state.id);
    }

    async addDeviceState<T>(name: string, type: PropertyType, callback: (state: DeviceStateObject<T> | undefined) => void, isEnum?: boolean): Promise<void> {
        const state = this.getDeviceState(name);
        let object: DeviceStateObject<T> | undefined;
        if (state) {
            object = new DeviceStateObject(this._adapter, state, type, isEnum);
            this._properties.push(type);
            await object.subscribe(this.updateState);
            this._subscribeObjects.push(object);
        }
        callback(object);
    }

    async addDeviceStates(states: { name: string, type: PropertyType, isEnum?: boolean, callback: (state: DeviceStateObject<any> | undefined) => void }[]): Promise<void> {
        for (let i = 0; i < states.length; i++) {
            await this.addDeviceState(states[i].name, states[i].type, states[i].callback, states[i].isEnum);
        }
    }

    getDeviceType(): DeviceType | undefined {
        return this._deviceType;
    }

    protected updateState = <T>(id: string, object: DeviceStateObject<T>): void => {
        this.handlers.forEach(handler => handler({
            property: object.propertyType,
            value: object.value,
        }));
    }

    protected async _doUnsubscribe(): Promise<void> {
        for (let i = 0; i < this._subscribeObjects.length; i++) {
            await this._subscribeObjects[i].unsubscribe();
        }
    }

    async destroy(): Promise<void> {
        await this._doUnsubscribe();
    }

    getProperties(): PropertyType[] {
        return this._properties;
    }

    getError(): boolean|number | undefined {
        if (!this._errorState) {
            throw new Error('Error state not found');
        }
        return this._errorState.value;
    }

    getMaintenance(): boolean|number | undefined {
        if (!this._maintenanceState) {
            throw new Error('Maintenance state not found');
        }
        return this._maintenanceState.value;
    }

    getUnreach(): boolean|number | undefined {
        if (!this._unreachState) {
            throw new Error('Unreach state not found');
        }
        return this._unreachState.value;
    }

    getLowbat(): boolean|number | undefined {
        if (!this._lowbatState) {
            throw new Error('Lowbat state not found');
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

    onChange<T>(handler: (event: {
        property: PropertyType
        value: T
    }) => void): void {
        this.handlers.push(handler);
    }
}

export default GenericDevice;
