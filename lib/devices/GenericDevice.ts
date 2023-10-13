// @iobroker/device-types

import SubscribeManager from "./SubscribeManager"

// take here https://github.com/ioBroker/ioBroker.type-detector/blob/master/DEVICES.md#temperature-temperature
export enum DeviceType {
    Light = 'light',
    Switch = 'switch',
    Temperature = 'temperature',
    Dimmer = 'dimmer',
}

export enum StateType {
    Number = 'number',
    String = 'string',
    Boolean = 'boolean',
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
}

export interface DeviceState {
    id: string
    name: string
    write?: boolean
    noSubscribe?: boolean
    type: StateType
    indicator?: boolean
    defaultRole: string
    required: boolean
}

export class DeviceStateObject<T> {

    protected _adapter: ioBroker.Adapter

    state: DeviceState

    value: T

    updateHandler: (id: string, object: DeviceStateObject<any>)=>void | undefined

    isEnum: boolean = false

    modes: Promise<{[key: string]: T}> | undefined;

    propertyType: PropertyType

    constructor (adapter: ioBroker.Adapter, state: DeviceState, _propertyType: PropertyType, _isEnum?: boolean) {
        this._adapter = adapter
        this.state = state
        this.propertyType = _propertyType
        this.isEnum = _isEnum || false
        if (this.isEnum) {
            this.parseMode();
        }
    }

    protected parseMode():void {
        this.modes = this._adapter.getObjectAsync(this.state.id)
            .then(obj => {
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

    getModes(): Promise<T[]> {
        return this.modes.then(modes => Object.keys(modes).map(key => modes[key]));
    }

    setValue (value: T) {
        return this._adapter.setStateAsync(this.state.id, value as any);
    }

    protected updateState = (id: string, state: ioBroker.State) => {
        let property: PropertyType | undefined
        this.value = state.val as T
        if (this.updateHandler) {
            this.updateHandler(id, this);
        }
    }

    public subscribe (handler: (id: string, object: DeviceStateObject<any>)=>void) {
        this.updateHandler = handler
        SubscribeManager.subscribe(this.state.id, this.updateState);
    }

    public unsubsribe () {
        SubscribeManager.unsubscribe(this.state.id, this.updateState);
    }

}

export interface DetectedDevice {
    type: DeviceType
    states: DeviceState[]
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

    getDeviceState (name: string) {
        return this._detectedDevice.states.find(state => state.name === name && state.id)
    }

    addDeviceState (name: string, type: PropertyType, callback: (state: DeviceStateObject<any>) => void, isEnum?: boolean) {
        const state = this.getDeviceState(name)
        let object: DeviceStateObject<any> | undefined;
        if (state) {
            object = new DeviceStateObject(this._adapter, state, type, isEnum);
            this._properties.push(type)
            object.subscribe(this.updateState);
            this._subscribeObjects.push(object)
        }
        callback(object)
    }

    addDeviceStates (states: { name: string, type: PropertyType, isEnum?: boolean, callback: (state: DeviceStateObject<any>) => void }[]) {
        states.forEach(state => {
            this.addDeviceState(state.name, state.type, state.callback, state.isEnum);
        })
    }

    getDeviceType (): DeviceType {
        return this._deviceType
    }

    protected updateState = (id: string, object: DeviceStateObject<any>):void => {
        this.handlers.forEach(handler => {
            handler({
                property: object.propertyType,
                value: object.value,
            })
        });
    }
    
    protected _doUnsubsribe () {
        this._subscribeObjects.forEach(object => {
            object.unsubsribe();
        });
    }

    destroy () {
        this._doUnsubsribe()
    }

    getProperties () {
        return this._properties
    }

    getError(): boolean|number {
        if (!this._errorState) {
            throw new Error('Error state not found');
        }
        return this._errorState.value;
    }

    getMaintenance(): boolean|number {
        if (!this._maintenanceState) {
            throw new Error('Maintenance state not found');
        }
        return this._maintenanceState.value;
    }

    getUnreach(): boolean|number {
        if (!this._unreachState) {
            throw new Error('Unreach state not found');
        }
        return this._unreachState.value;
    }

    getLowbat(): boolean|number {
        if (!this._lowbatState) {
            throw new Error('Lowbat state not found');
        }
        return this._lowbatState.value;
    }

    getWorking(): string {
        if (!this._workingState) {
            throw new Error('Working state not found');
        }
        return this._workingState.value;
    }

    getDirection(): string {
        if (!this._directionState) {
            throw new Error('Direction state not found');
        }
        return this._directionState.value;
    }

    onChange (handler: (event: {
        property: PropertyType
        value: any
    }) => void) {
        this.handlers.push(handler)
    }
}

export default GenericDevice
