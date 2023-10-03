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

    constructor (detectedDevice: DetectedDevice, adapter: ioBroker.Adapter) {
        console.log('Generic Device')
        this._adapter = adapter
        this._deviceType = detectedDevice.type
        this._detectedDevice = detectedDevice

        const error = this.getDeviceState('ERROR')
        const maintenance = this.getDeviceState('MAINTAIN')
        const unreach = this.getDeviceState('UNREACH')
        const lowbat = this.getDeviceState('LOWBAT')
        const working = this.getDeviceState('WORKING')
        const direction = this.getDeviceState('DIRECTION');
        [error, maintenance, unreach, lowbat, working, direction].forEach(state => {
            if (state) {
                this._subscribeIDs.push(state.id)
            }
        })

        this._properties = ([
            error ? PropertyType.Error : null,
            maintenance ? PropertyType.Maintenance : null,
            unreach ? PropertyType.Unreach : null,
            lowbat ? PropertyType.Lowbat : null,
            working ? PropertyType.Working : null,
            direction ? PropertyType.Direction : null
        ].filter(w => w))

        this._doSubsribe();
    }

    getDeviceState (name: string) {
        return this._detectedDevice.states.find(state => state.name === name && state.id)
    }

    getDeviceType (): DeviceType {
        return this._deviceType
    }

    updateState = (id: string, state: ioBroker.State) => {
        let property: PropertyType | undefined
        property = this._properties.find(_property => _property === id);

        this.handlers.forEach(handler => {
            handler({
                property: PropertyType.Level,
                value: state.val
            })
        });
    }

    _doSubsribe () {
        this._subscribeIDs.forEach(id => {
            SubscribeManager.subscribe(id, (id, state) => {
            });
        });
    }

    _doUnsubsribe () {
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
