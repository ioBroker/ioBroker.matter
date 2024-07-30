// @iobroker/device-types

import { DetectorState, Types } from '@iobroker/type-detector';
import { DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';

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

export interface DeviceOptions {
    dimmerOnLevel?: number;
    dimmerUseLastLevelForOn?: boolean;
    actionAllowedByIdentify?: boolean;
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
    #properties: { [id: string]: StateDescription } = {};
    #possibleProperties: { [id: string]: StateDescription } = {};
    #adapter: ioBroker.Adapter;
    #subscribeObjects: DeviceStateObject<any>[] = [];
    #deviceType: Types;
    #detectedDevice: DetectedDevice;
    #handlers: ((event: { property: PropertyType; value: any; device: GenericDevice }) => void)[] = [];
    protected _construction = new Array<Promise<void>>();

    #errorState?: DeviceStateObject<boolean>;
    #maintenanceState?: DeviceStateObject<boolean>;
    #unreachState?: DeviceStateObject<boolean>;
    #lowbatState?: DeviceStateObject<boolean>;
    #workingState?: DeviceStateObject<string>;
    #directionState?: DeviceStateObject<string>;

    constructor(
        detectedDevice: DetectedDevice,
        adapter: ioBroker.Adapter,
        protected options?: DeviceOptions,
    ) {
        this.#adapter = adapter;
        this.#deviceType = detectedDevice.type;
        this.#detectedDevice = detectedDevice;

        this._construction.push(
            this.addDeviceStates([
                {
                    name: 'ERROR',
                    valueType: ValueType.Boolean,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Error,
                    callback: state => (this.#errorState = state),
                },
                {
                    name: 'MAINTAIN',
                    valueType: ValueType.Boolean,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Maintenance,
                    callback: state => (this.#maintenanceState = state),
                },
                {
                    name: 'UNREACH',
                    valueType: ValueType.Boolean,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Unreachable,
                    callback: state => (this.#unreachState = state),
                },
                {
                    name: 'LOWBAT',
                    valueType: ValueType.Boolean,
                    accessType: StateAccessType.Read,
                    type: PropertyType.LowBattery,
                    callback: state => (this.#lowbatState = state),
                },
                {
                    name: 'WORKING',
                    valueType: ValueType.Boolean,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Working,
                    callback: state => (this.#workingState = state),
                },
                {
                    name: 'DIRECTION',
                    valueType: ValueType.Boolean,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Direction,
                    callback: state => (this.#directionState = state),
                },
            ]),
        );
    }

    isActionAllowedByIdentify(): boolean {
        return !!this.options?.actionAllowedByIdentify;
    }

    async init(): Promise<void> {
        await Promise.all(this._construction);
    }

    async addDeviceState<T>(
        name: string,
        type: PropertyType,
        callback: (state: DeviceStateObject<T> | undefined) => void,
        accessType: StateAccessType,
        valueType: ValueType,
    ): Promise<void> {
        const state = this.getDeviceState(name);
        if (state) {
            let object: DeviceStateObject<T>;
            try {
                object = await DeviceStateObject.create(this.#adapter, state, type, valueType);
            } catch (error) {
                this.#adapter.log.error(`Cannot create state ${name}: ${error}`);
                return;
            }
            const data = object.getIoBrokerState();
            if (!this.#properties[type]) {
                this.#properties[type] = { name, accessType, valueType };
                if (accessType === StateAccessType.ReadWrite) {
                    this.#properties[type].read = data.id;
                    this.#properties[type].write = data.id;
                } else if (accessType === StateAccessType.Read) {
                    this.#properties[type].read = data.id;
                } else if (accessType === StateAccessType.Write) {
                    this.#properties[type].write = data.id;
                }
            } else {
                if (this.#properties[type].valueType !== valueType) {
                    throw new Error(
                        `Property ${type} has already a different value type: ${this.#properties[type].valueType} !== ${valueType}`,
                    );
                }

                if (accessType === StateAccessType.ReadWrite) {
                    this.#properties[type].accessType = accessType;
                } else if (
                    accessType === StateAccessType.Write &&
                    this.#properties[type].accessType === StateAccessType.Read
                ) {
                    this.#properties[type].accessType = StateAccessType.ReadWrite;
                } else if (
                    accessType === StateAccessType.Read &&
                    this.#properties[type].accessType === StateAccessType.Write
                ) {
                    this.#properties[type].accessType = StateAccessType.ReadWrite;
                }
                if (accessType === StateAccessType.Read) {
                    this.#properties[type].read = data.id;
                } else if (accessType === StateAccessType.Write) {
                    this.#properties[type].write = data.id;
                } else if (accessType === StateAccessType.ReadWrite) {
                    this.#properties[type].read = this.#properties[type].read || data.id;
                    this.#properties[type].write = data.id;
                }
            }
            if (this.#possibleProperties[type]) {
                delete this.#possibleProperties[type];
            }
            if (
                this.#properties[type].accessType === StateAccessType.ReadWrite ||
                this.#properties[type].accessType === StateAccessType.Read
            ) {
                const stateId = object?.getIoBrokerState().id;
                // subscribe and read only if not already subscribed
                if (stateId && !this.#subscribeObjects.find(obj => obj.state.id === stateId)) {
                    if (this.#properties[type].accessType === StateAccessType.ReadWrite) {
                        // subscribe only if read and write are the same, else we have already subscribed on read
                        if (this.#properties[type].read === this.#properties[type].write) {
                            await object.subscribe(this.updateState);
                            this.#subscribeObjects.push(object);
                        }
                    } else {
                        await object.subscribe(this.updateState);
                        this.#subscribeObjects.push(object);
                    }
                }
            }
            callback(object);
        } else {
            // for tests
            if (!this.#possibleProperties[type]) {
                this.#possibleProperties[type] = { name, accessType, valueType };
            } else {
                if (accessType === StateAccessType.ReadWrite) {
                    this.#possibleProperties[type].accessType = accessType;
                } else if (
                    accessType === StateAccessType.Write &&
                    this.#possibleProperties[type].accessType === StateAccessType.Read
                ) {
                    this.#possibleProperties[type].accessType = StateAccessType.ReadWrite;
                } else if (
                    accessType === StateAccessType.Read &&
                    this.#possibleProperties[type].accessType === StateAccessType.Write
                ) {
                    this.#possibleProperties[type].accessType = StateAccessType.ReadWrite;
                }
            }
        }
    }

    getDeviceState(name: string): DetectorState | undefined {
        return this.#detectedDevice.states.find(state => state.name === name && state.id);
    }

    async addDeviceStates(states: DeviceStateDescription[]): Promise<void> {
        for (const state of states) {
            // we cannot give the whole object as it must be cast to T
            await this.addDeviceState(state.name, state.type, state.callback, state.accessType, state.valueType);
        }
    }

    getPropertyValue(property: PropertyType): boolean | number | string | null | undefined {
        if (this.#properties[property] === undefined) {
            throw new Error(`Property ${property} not found`);
        } else if (this.#properties[property].accessType === StateAccessType.Write) {
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
        if (this.#properties[property] === undefined) {
            throw new Error(`Property ${property} not found`);
        } else if (this.#properties[property].accessType === StateAccessType.Read) {
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

    get deviceType(): Types | undefined {
        return this.#deviceType;
    }

    protected updateState = <T>(object: DeviceStateObject<T>): void => {
        this.#handlers.forEach(handler =>
            handler({
                property: object.propertyType,
                value: object.value,
                device: this,
            }),
        );
    };

    protected async _doUnsubscribe(): Promise<void> {
        for (let i = 0; i < this.#subscribeObjects.length; i++) {
            await this.#subscribeObjects[i].unsubscribe();
        }
    }

    async destroy(): Promise<void> {
        await this._doUnsubscribe();
    }

    getProperties(): { [key: string]: any } {
        return this.#properties;
    }

    getPossibleProperties(): { [key: string]: any } {
        return this.#possibleProperties;
    }

    getPropertyNames(): PropertyType[] {
        const properties: PropertyType[] = [];
        const keys = Object.keys(this.#properties);
        for (let i = 0; i < keys.length; i++) {
            properties.push(keys[i] as PropertyType);
        }
        return properties;
    }

    getPropertyReadWriteTypes(): { [key: string]: StateAccessType } {
        const result: { [key: string]: StateAccessType } = {};
        const keys = Object.keys(this.#properties);
        for (let i = 0; i < keys.length; i++) {
            result[keys[i]] = this.#properties[keys[i]].accessType;
        }
        return result;
    }

    getError(): boolean | number | undefined {
        if (!this.#errorState) {
            throw new Error('Error state not found');
        }
        return this.#errorState.value;
    }

    getMaintenance(): boolean | number | undefined {
        if (!this.#maintenanceState) {
            throw new Error('Maintenance state not found');
        }
        return this.#maintenanceState.value;
    }

    getUnreachable(): boolean | number | undefined {
        if (!this.#unreachState) {
            throw new Error('Unreachable state not found');
        }
        return this.#unreachState.value;
    }

    getLowBattery(): boolean | number | undefined {
        if (!this.#lowbatState) {
            throw new Error('Low battery state not found');
        }
        return this.#lowbatState.value;
    }

    getWorking(): string | undefined {
        if (!this.#workingState) {
            throw new Error('Working state not found');
        }
        return this.#workingState.value;
    }

    getDirection(): string | undefined {
        if (!this.#directionState) {
            throw new Error('Direction state not found');
        }
        return this.#directionState.value;
    }

    onChange<T>(handler: (event: { property: PropertyType; value: T }) => void): void {
        this.#handlers.push(handler);
    }

    offChange<T>(handler: (event: { property: PropertyType; value: T }) => void): void {
        if (!handler) {
            this.#handlers = [];
        } else {
            const index = this.#handlers.indexOf(handler);
            if (index !== -1) {
                this.#handlers.splice(index, 1);
            } else {
                throw new Error('Handler not found');
            }
        }
    }
    clearChangeHandlers(): void {
        this.#handlers = [];
    }
}

export default GenericDevice;
