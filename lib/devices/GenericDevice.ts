// @iobroker/device-types

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
    id: string,
    name: string,
    write?: boolean,
    noSubscribe?: boolean,
    type: StateType,
    indicator?: boolean,
    defaultRole: string,
    required: boolean,
}

export interface DetectedDevice {
    type: DeviceType,
    states: DeviceState[],
}

abstract class GenericDevice {
    protected _properties: PropertyType[] = [];
    protected _adapter: ioBroker.Adapter;
    protected _subscribeIDs: string[] = [];
    protected _deviceType: DeviceType;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter) {
        console.log('Generic Device');
        this._adapter = adapter;
        this._deviceType = detectedDevice.type;

        const error = detectedDevice.states.find(state => state.name === 'ERROR' && state.id);
        const maintenance = detectedDevice.states.find(state => state.name === 'MAINTAIN' && state.id);
        const unreach = detectedDevice.states.find(state => state.name === 'UNREACH' && state.id);
        const lowbat = detectedDevice.states.find(state => state.name === 'LOWBAT' && state.id);
        const working = detectedDevice.states.find(state => state.name === 'WORKING' && state.id);
        const direction = detectedDevice.states.find(state => state.name === 'DIRECTION' && state.id);

        this._properties = [
            error ? PropertyType.Error : null,
            maintenance ? PropertyType.Maintenance : null,
            unreach ? PropertyType.Unreach : null,
            lowbat ? PropertyType.Lowbat : null,
            working ? PropertyType.Working : null,
            direction ? PropertyType.Direction : null,
        ].filter(w => w);
    }

    getDeviceType(): DeviceType {
        return this._deviceType;
    }

    _doSubsribe() {

    }

    _doUnsubsribe() {

    }

    destroy() {
        this._doUnsubsribe();
    }

    // example:
    getProperties() {
        return this._properties;
    }

    onChange(handler: (event: {
        property: PropertyType,
        value: any,
    }) => void) {
        // ...
    }
}

export default GenericDevice;