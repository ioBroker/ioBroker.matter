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

    state: DeviceState

    value: T

    constructor (state: DeviceState) {
        this.state = state
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
    protected _subscribeIDs: string[] = []
    protected _deviceType: DeviceType
    protected _detectedDevice: DetectedDevice
    protected handlers: ((event: {
        property: PropertyType
        value: any
    }) => void)[] = []

    protected _errorState: DeviceState | undefined;
    protected _maintenanceState: DeviceState | undefined;
    protected _unreachState: DeviceState | undefined;
    protected _lowbatState: DeviceState | undefined;
    protected _workingState: DeviceState | undefined;
    protected _directionState: DeviceState | undefined;

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

        this._doSubsribe();
    }

    getDeviceState (name: string) {
        return this._detectedDevice.states.find(state => state.name === name && state.id)
    }

    addDeviceState (name: string, type: PropertyType, callback: (state: DeviceState) => void) {
        const state = this.getDeviceState(name)
        if (state) {
            this._properties.push(type)
            this._subscribeIDs.push(state.id)
            callback(state)
        }
    }

    addDeviceStates (states: { name: string, type: PropertyType, callback: (state: DeviceState) => void }[]) {
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

    protected _doSubsribe () {
        this._subscribeIDs.forEach(id => {
            SubscribeManager.subscribe(id, this.updateState);
        });
    }

    protected _doUnsubsribe () {
        this._subscribeIDs.forEach(id => {
            SubscribeManager.unsubscribe(id, (id, state) => {
            });
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
