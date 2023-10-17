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
    Level = 'level', // read/write
    Value = 'value', // read only
    Error = 'error',
    Maintenance = 'maintenance',
    Unreach = 'unreach',
    Lowbat = 'lowbat',
    Working = 'working',
    Power = 'power',
    Mode = 'mode',
    Secondary = 'secondary',
    WaterAlarm = 'waterAlarm',
    Battery = 'battery',
    Direction = 'direction',
    Humidity = 'humidity',
    Current = 'current',
    Voltage = 'voltage',
    Consumption = 'consumption',
    Frequency = 'frequency',
    Boost = 'boost',
    Party = 'party',
    Swing = 'swing',
    Speed = 'speed',
    Stop = 'stop',
    Open = 'open',
    Close = 'close',
    TiltValue = 'tiltValue',
    TiltLevel = 'tiltLevel',
    TiltStop = 'tiltStop',
    TiltOpen = 'tiltOpen',
    TiltClose = 'tiltClose',
    Press = 'press',
    PressLong = 'pressLong',
    File = 'file',
    AutoFocus = 'autoFocus',
    AutoWhiteBalance = 'autoWhiteBalance',
    Brightness = 'brightness',
    NightMode = 'nightMode',
    Position = 'position',
    PTZ = 'ptz',
    Cie = 'cie',
    Dimmer = 'dimmer',
    Saturation = 'saturation',
    Temperature = 'temperature',
    Hue = 'hue',
    Url = 'url',
    Longitude = 'longitude',
    Latitude = 'latitude',
    Elevation = 'elevation',
    Radius = 'radius',
    Accuracy = 'accuracy',
    GPS = 'gps',
    State = 'state',
    Play = 'play',
    Pause = 'pause',
    Next = 'next',
    Prev = 'prev',
    Shuffle = 'shuffle',
    Repeat = 'repeat',
    Artist = 'artist',
    Album = 'album',
    Title = 'title',
    Cover = 'cover',
    Duration = 'duration',
    Elapsed = 'elapsed',
    Seek = 'seek',
    Track = 'track',
    Episode = 'episode',
    Season = 'season',
    Volume = 'volume',
    VolumeActual = 'volumeActual',
    Mute = 'mute',
    Connected = 'connected',
    Red = 'red',
    Green = 'green',
    Blue = 'blue',
    Rgb = 'rgb',
    Rgbw = 'rgbw',
    MapBase64 = 'mapBase64',
    MapUrl = 'mapUrl',
    WorkMode = 'workMode',
    Water = 'water',
    Waste = 'waste',
    WasteAlarm = 'wasteAlarm',
    Filter = 'filter',
    Brush = 'brush',
    Sensors = 'sensors',
    SideBrush = 'sideBrush',
    Warning = 'warning',
    Info = 'info',
    End = 'end',
    Start = 'start',
    Icon = 'icon',
    Desc = 'desc',
    PrecipitationChance = 'precipitationChance',
    PrecipitationType = 'precipitationType',
    Pressure = 'pressure',
    PressureTendency = 'pressureTendency',
    RealFeelTemperature = 'realFeelTemperature',
    UV = 'uv',
    Weather = 'weather',
    WindDirection = 'windDirection',
    WindGust = 'windGust',
    WindSpeed = 'windSpeed',
    TempMin = 'tempMin',
    TempMax = 'tempMax',
    Precipitation = 'precipitation',
    Date = 'date',
    DayOfWeek = 'dayOfWeek',
    Temp = 'temp',
    TimeSunrise = 'timeSunrise',
    TimeSunset = 'timeSunset',
    WindChill = 'windChill',
    FeelsLike = 'feelsLike',
    WindDirectionStr = 'windDirectionStr',
    WindIcon = 'windIcon',
    HistoryChart = 'historyChart',
    ForecastChart = 'forecastChart',
}

export class DeviceStateObject<T> {
    protected _adapter: ioBroker.Adapter;

    state: DeviceState;

    value: T | undefined;

    updateHandler: ((id: string, object: DeviceStateObject<T>) => void) | undefined;

    isEnum: boolean = false;

    object: Promise<ioBroker.Object>;

    modes: Promise<{[key: string]: T}> | undefined;

    propertyType: PropertyType

    constructor (adapter: ioBroker.Adapter, state: DeviceState, _propertyType: PropertyType, _isEnum?: boolean) {
        this._adapter = adapter;
        this.state = state;
        this.propertyType = _propertyType;
        this.isEnum = _isEnum || false;
        this.object = this._adapter.getObjectAsync(this.state.id) as Promise<ioBroker.Object>;
        if (this.isEnum) {
            this.parseMode();
        }
    }

    protected parseMode():void {
        if (!this.object) {
            return;
        }
        this.modes = this.object.then(obj => {
            // {'MODE_VALUE': 'MODE_TEXT'}
            let modes: {[key: string]: T} = obj?.common?.states;
            if (modes) {
                // convert ['Auto'] => {'Auto': 'AUTO'}
                if (Array.isArray(modes)) {
                    const _m: {[key: string]: T} = {};
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

    protected updateState = (id: string, state: ioBroker.State):void => {
        // let property: PropertyType | undefined
        this.value = state.val as T;
        if (this.updateHandler) {
            this.updateHandler(id, this);
        }
    }

    public subscribe (handler: (id: string, object: DeviceStateObject<T>)=>void):void {
        this.updateHandler = handler
        SubscribeManager.subscribe(this.state.id, this.updateState);
    }

    public unsubscribe ():void {
        SubscribeManager.unsubscribe(this.state.id, this.updateState);
    }
}

export interface DetectedDevice {
    type: DeviceType;
    states: DeviceState[];
}

abstract class GenericDevice {
    protected _properties: PropertyType[] = []
    protected _adapter: ioBroker.Adapter
    protected _subscribeObjects: DeviceStateObject<any>[] = []
    protected _deviceType: DeviceType
    protected _detectedDevice: DetectedDevice
    protected handlers: ((event: {
        property: PropertyType
        value: any
    }) => void)[] = []

    protected _errorState: DeviceStateObject<boolean> | undefined;
    protected _maintenanceState: DeviceStateObject<boolean> | undefined;
    protected _unreachState: DeviceStateObject<boolean> | undefined;
    protected _lowbatState: DeviceStateObject<boolean> | undefined;
    protected _workingState: DeviceStateObject<string> | undefined;
    protected _directionState: DeviceStateObject<string> | undefined;

    constructor (detectedDevice: DetectedDevice, adapter: ioBroker.Adapter) {
        console.log('Generic Device')
        this._adapter = adapter
        this._deviceType = detectedDevice.type
        this._detectedDevice = detectedDevice

        this.addDeviceStates([
            { name: 'ERROR', type: PropertyType.Error, callback: state => this._errorState = state },
            { name: 'MAINTAIN', type: PropertyType.Maintenance, callback: state => this._maintenanceState = state },
            { name: 'UNREACH', type: PropertyType.Unreach, callback: state => this._unreachState = state },
            { name: 'LOWBAT', type: PropertyType.Lowbat, callback: state => this._lowbatState = state },
            { name: 'WORKING', type: PropertyType.Working, callback: state => this._workingState = state },
            { name: 'DIRECTION', type: PropertyType.Direction, callback: state => this._directionState = state },
        ]);
    }

    getDeviceState (name: string): DeviceState | undefined {
        return this._detectedDevice.states.find(state => state.name === name && state.id)
    }

    addDeviceState<T> (name: string, type: PropertyType, callback: (state: DeviceStateObject<T> | undefined) => void, isEnum?: boolean):void {
        const state = this.getDeviceState(name)
        let object: DeviceStateObject<T> | undefined;
        if (state) {
            object = new DeviceStateObject(this._adapter, state, type, isEnum);
            this._properties.push(type)
            object.subscribe(this.updateState);
            this._subscribeObjects.push(object)
        }
        callback(object)
    }

    addDeviceStates (states: { name: string, type: PropertyType, isEnum?: boolean, callback: (state: DeviceStateObject<any> | undefined) => void }[]):void {
        states.forEach(state => {
            this.addDeviceState(state.name, state.type, state.callback, state.isEnum);
        })
    }

    getDeviceType (): DeviceType | undefined {
        return this._deviceType;
    }

    protected updateState = <T>(id: string, object: DeviceStateObject<T>):void => {
        this.handlers.forEach(handler => {
            handler({
                property: object.propertyType,
                value: object.value,
            })
        });
    }

    protected _doUnsubscribe ():void {
        this._subscribeObjects.forEach(object => {
            object.unsubscribe();
        });
    }

    destroy ():void {
        this._doUnsubscribe()
    }

    getProperties (): PropertyType[] {
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
    }) => void):void {
        this.handlers.push(handler);
    }
}

export default GenericDevice
