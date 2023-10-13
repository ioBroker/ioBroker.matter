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
    Level = 'level',
    Value = 'value',
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

    constructor (adapter: ioBroker.Adapter, state: DeviceState) {
        this._adapter = adapter
        this.state = state
    }

    setValue (value: T) {
        return this._adapter.setStateAsync(this.state.id, value as any);
    }

    protected updateState = (id: string, state: ioBroker.State) => {
        let property: PropertyType | undefined
        this.value = state.val as T
    }

    public subsribe () {
        SubscribeManager.subscribe(this.state.id, this.updateState);
    }

    public unsubsribe () {
        SubscribeManager.unsubscribe(this.state.id, (id, state) => {
        });
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

    protected _errorState: DeviceStateObject<string> | undefined;
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

    addDeviceState (name: string, type: PropertyType, callback: (state: DeviceStateObject<any>) => void) {
        const object = new DeviceStateObject(this._adapter, this.getDeviceState(name))
        const state = this.getDeviceState(name)
        if (state) {
            this._properties.push(type)
            object.subsribe();
            this._subscribeObjects.push(object)
        }
        callback(object)
    }

    addDeviceStates (states: { name: string, type: PropertyType, callback: (state: DeviceStateObject<any>) => void }[]) {
        states.forEach(state => {
            this.addDeviceState(state.name, state.type, state.callback)
        })
    }

    getDeviceType (): DeviceType {
        return this._deviceType
    }

    protected updateState = (id: string, state: ioBroker.State) => {
        let property: PropertyType | undefined
        property = this._properties.find(_property => _property === id);

        this.handlers.forEach(handler => {
            handler({
                property: PropertyType.Level,
                value: state.val
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

    // example:
    getProperties () {
        return this._properties
    }

    onChange (handler: (event: {
        property: PropertyType
        value: any
    }) => void) {
        this.handlers.push(handler)
    }
}

export default GenericDevice
