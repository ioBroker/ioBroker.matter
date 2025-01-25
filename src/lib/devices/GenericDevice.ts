// @iobroker/device-types

import type { DetectorState, Types } from '@iobroker/type-detector';
import type { BridgeDeviceDescription } from '../../ioBrokerStorageTypes';
import { DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import { EventEmitter } from 'events';

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

export interface DeviceOptions extends BridgeDeviceDescription {
    additionalStateData?: { [key: string]: Partial<DetectorState> };
    dimmerOnLevel?: number;
    dimmerUseLastLevelForOn?: boolean;
    actionAllowedByIdentify?: boolean;
}

export interface DetectedDevice {
    type: Types;
    states: DetectorState[];
    isIoBrokerDevice: boolean;
}

export interface DeviceStateDescription {
    name: string;
    type: PropertyType;
    valueType: ValueType;
    unit?: string;
    callback: (state: DeviceStateObject<any> | undefined) => void;
    accessType: StateAccessType;
    unitConversionMap?: { [key: string]: (value: number, toDefaultUnit: boolean) => number };
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
    role?: string;
}

export abstract class GenericDevice extends EventEmitter {
    #properties: { [id: string]: StateDescription } = {};
    #possibleProperties: { [id: string]: StateDescription } = {};
    #adapter: ioBroker.Adapter;
    #subscribeObjects = new Array<DeviceStateObject<any>>();
    #registeredStates = new Array<DeviceStateObject<any>>();
    #deviceType: Types;
    #detectedDevice: DetectedDevice;
    #isIoBrokerDevice: boolean;
    #valid = true;
    #handlers = new Array<(event: { property: PropertyType; value: any; device: GenericDevice }) => Promise<void>>();
    protected _construction = new Array<() => Promise<void>>();

    #errorState?: DeviceStateObject<boolean>;
    #maintenanceState?: DeviceStateObject<boolean>;
    #unreachState?: DeviceStateObject<boolean>;
    #lowbatState?: DeviceStateObject<boolean>;
    #workingState?: DeviceStateObject<boolean>;
    #directionState?: DeviceStateObject<boolean>;
    #batteryState?: DeviceStateObject<number>;

    constructor(
        detectedDevice: DetectedDevice,
        adapter: ioBroker.Adapter,
        protected options?: DeviceOptions,
    ) {
        super();
        this.#adapter = adapter;
        this.#deviceType = detectedDevice.type;
        this.#detectedDevice = detectedDevice;
        this.#isIoBrokerDevice = detectedDevice.isIoBrokerDevice;

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
                    callback: state => {
                        if (state !== undefined && !this.enabled) {
                            state.value = true;
                        }
                        this.#unreachState = state;
                    },
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
                {
                    name: 'BATTERY',
                    valueType: ValueType.NumberPercent,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Battery,
                    callback: state => (this.#batteryState = state),
                },
            ]),
        );
    }

    get uuid(): string | undefined {
        return this.options?.uuid;
    }

    get enabled(): boolean {
        return !!this.options?.enabled;
    }

    get isValid(): boolean {
        return !this.#subscribeObjects.some(obj => !obj.isValid);
    }

    #handleValidChange(): void {
        const isValid = this.isValid;
        if (this.#valid !== isValid) {
            this.#valid = isValid;
            this.emit('validChanged');
        }
    }

    get isActionAllowedByIdentify(): boolean {
        return !!this.options?.actionAllowedByIdentify;
    }

    async init(): Promise<void> {
        for (const func of this._construction) {
            await func();
        }
    }

    get adapter(): ioBroker.Adapter {
        return this.#adapter;
    }

    async addDeviceState<T>(
        name: string,
        type: PropertyType,
        callback: (state: DeviceStateObject<T> | undefined) => void,
        accessType: StateAccessType,
        valueType: ValueType,
        unitConversionMap: { [key: string]: (value: number, toDefaultUnit: boolean) => number } = {},
    ): Promise<void> {
        let state = this.getDeviceState(name);
        if (state) {
            if (this.options?.additionalStateData?.[type]) {
                Object.assign(state, this.options.additionalStateData[type]);
            }
            if (!state.id) {
                state = undefined;
            } else if (!this.#isIoBrokerDevice && state.id.endsWith('.')) {
                // We need to extend the state ID with the name
                state.id = state.id + name;
            }
        }

        if (state) {
            let object: DeviceStateObject<T>;
            try {
                object = await DeviceStateObject.create(
                    this.#adapter,
                    {
                        ...state,
                        isIoBrokerState: this.#isIoBrokerDevice,
                    },
                    type,
                    valueType,
                    this.enabled,
                    unitConversionMap,
                );
            } catch (error) {
                this.#adapter.log.error(`Cannot create state ${name}: ${error}`);
                return;
            }
            const data = object.ioBrokerState;
            if (!this.#properties[type]) {
                this.#properties[type] = { name, accessType, valueType, role: object.role };
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
                (this.#isIoBrokerDevice && this.#properties[type].accessType === StateAccessType.Read) ||
                (!this.#isIoBrokerDevice && this.#properties[type].accessType === StateAccessType.Write)
            ) {
                const stateId = object?.ioBrokerState.id;
                // subscribe and read only if not already subscribed
                if (stateId && !this.#subscribeObjects.find(obj => obj.state.id === stateId)) {
                    await object.subscribe(
                        this.updateState,
                        this.#isIoBrokerDevice || this.#properties[type].accessType !== StateAccessType.Write,
                    );
                    this.#subscribeObjects.push(object);
                    object.on('validChanged', () => this.#handleValidChange());
                }
            }
            this.#registeredStates.push(object);
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
        return this.#detectedDevice.states.find(state => state.name === name);
    }

    addDeviceStates(states: DeviceStateDescription[]): () => Promise<void> {
        return async (): Promise<void> => {
            for (const state of states) {
                // we cannot give the whole object as it must be cast to T
                await this.addDeviceState(
                    state.name,
                    state.type,
                    state.callback,
                    state.accessType,
                    state.valueType,
                    state.unitConversionMap,
                );
            }
        };
    }

    getPropertyValue(property: PropertyType): boolean | number | string | null | undefined {
        if (this.#properties[property] === undefined) {
            throw new Error(`Property ${property} not found`);
        } else if (this.#isIoBrokerDevice && this.#properties[property].accessType === StateAccessType.Write) {
            throw new Error(`Property ${property} is write only`);
        }
        const method = `get${property[0].toUpperCase()}${property.substring(1)}`;
        if (method in this) {
            // @ts-expect-error How to fix it?
            return this[method]();
        }
        throw new Error(`Method ${method} for ${property} is not implemented in ${this.constructor.name}`);
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
                `Method ${method} for ${property} and ${value} is not implemented in ${this.constructor.name}`,
            );
        }
    }

    async updatePropertyValue(property: PropertyType, value: boolean | number | string): Promise<void> {
        if (this.#properties[property] === undefined) {
            throw new Error(`Property ${property} not found`);
        } else if (this.#isIoBrokerDevice) {
            throw new Error(`Updating ${property} only allowed for Matter devices`);
        }
        const method = `update${property[0].toUpperCase()}${property.substring(1)}`;
        if (method in this) {
            // @ts-expect-error How to fix it?
            await this[method](value);
        } else {
            throw new Error(
                `Method ${method} for ${property} and ${value} is not implemented in ${this.constructor.name}`,
            );
        }
    }

    get deviceType(): Types | undefined {
        return this.#deviceType;
    }

    protected updateState = async <T>(object: DeviceStateObject<T>): Promise<void> => {
        if (!this.enabled && object.propertyType !== PropertyType.Unreachable) {
            // When disabled, only report unreachable ioBroker changes to Matter
            return;
        }
        if (!this.#isIoBrokerDevice && this.#properties[object.propertyType].accessType === StateAccessType.Read) {
            this.#adapter.log.info(
                `updateState not allowed for type ${object.propertyType} and value ${object.value as string}`,
            );
            return;
        }
        for (const handler of this.#handlers) {
            await handler({
                property: object.propertyType,
                value: object.value,
                device: this,
            });
        }
    };

    async destroy(): Promise<void> {
        for (const object of this.#subscribeObjects) {
            await object.unsubscribe();
        }
        this.#subscribeObjects.length = 0;
        this.#registeredStates.length = 0;
        this.offChange();
    }

    getProperties(): { [key: string]: any } {
        return this.#properties;
    }

    getPossibleProperties(): { [key: string]: any } {
        return this.#possibleProperties;
    }

    get propertyNames(): PropertyType[] {
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

    updateError(value: boolean): Promise<void> {
        if (!this.#errorState) {
            throw new Error('Error state not found');
        }
        return this.#errorState.updateValue(value);
    }

    hasError(): boolean {
        return this.propertyNames.includes(PropertyType.Error);
    }

    getMaintenance(): boolean | number | undefined {
        if (!this.#maintenanceState) {
            throw new Error('Maintenance state not found');
        }
        return this.#maintenanceState.value;
    }

    updateMaintenance(value: boolean): Promise<void> {
        if (!this.#maintenanceState) {
            throw new Error('Maintenance state not found');
        }
        return this.#maintenanceState.updateValue(value);
    }

    hasMaintenance(): boolean {
        return this.propertyNames.includes(PropertyType.Maintenance);
    }

    getUnreachable(): boolean | number | undefined {
        if (!this.#unreachState) {
            throw new Error('Unreachable state not found');
        }
        if (!this.enabled) {
            return false;
        }
        return this.#unreachState.value;
    }

    updateUnreachable(value: boolean): Promise<void> {
        if (!this.#unreachState) {
            throw new Error('Unreachable state not found');
        }
        return this.#unreachState.updateValue(value);
    }

    hasUnreachable(): boolean {
        return this.propertyNames.includes(PropertyType.Unreachable);
    }

    getLowBattery(): boolean | undefined {
        if (!this.#lowbatState) {
            throw new Error('Low battery state not found');
        }
        return this.#lowbatState.value;
    }

    updateLowBattery(value: boolean): Promise<void> {
        if (!this.#lowbatState) {
            throw new Error('Low battery state not found');
        }
        return this.#lowbatState.updateValue(value);
    }

    hasLowBattery(): boolean {
        return this.propertyNames.includes(PropertyType.LowBattery);
    }

    getWorking(): boolean | undefined {
        if (!this.#workingState) {
            throw new Error('Working state not found');
        }
        return this.#workingState.value;
    }

    updateWorking(value: boolean): Promise<void> {
        if (!this.#workingState) {
            throw new Error('Working state not found');
        }
        return this.#workingState.updateValue(value);
    }

    hasWorking(): boolean {
        return this.propertyNames.includes(PropertyType.Working);
    }

    getDirection(): boolean | undefined {
        if (!this.#directionState) {
            throw new Error('Direction state not found');
        }
        return this.#directionState.value;
    }

    updateDirection(value: boolean): Promise<void> {
        if (!this.#directionState) {
            throw new Error('Direction state not found');
        }
        return this.#directionState.updateValue(value);
    }

    hasDirection(): boolean {
        return this.propertyNames.includes(PropertyType.Direction);
    }

    getBattery(): number | undefined {
        if (!this.#batteryState) {
            throw new Error('Battery state not found');
        }
        return this.#batteryState.value;
    }

    updateBattery(value: number): Promise<void> {
        if (!this.#batteryState) {
            throw new Error('Battery state not found');
        }
        return this.#batteryState.updateValue(value);
    }

    hasBattery(): boolean {
        return this.propertyNames.includes(PropertyType.Battery);
    }

    onChange<T>(handler: (event: { property: PropertyType; value: T }) => Promise<void>): void {
        this.#handlers.push(handler);
    }

    offChange<T>(handler?: (event: { property: PropertyType; value: T }) => Promise<void>): void {
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

    async applyConfiguration(options?: DeviceOptions): Promise<void> {
        if (!this.#isIoBrokerDevice) {
            return;
        }
        this.#adapter.log.debug(
            `Applying configuration to device ${this.constructor.name}: ${JSON.stringify(options)}`,
        );
        const newEnabled = !!options?.enabled;
        if (newEnabled !== this.enabled) {
            // Simulate we would have got an unreach update to inform Matter about the change
            this.#adapter.log.info(`${newEnabled ? 'Enabling' : 'Disabling'} device ${this.constructor.name}`);
            const now = Date.now();
            for (const state of this.#registeredStates) {
                await state.setEnabled(newEnabled);
            }
            await this.#unreachState?.updateState(
                {
                    val: !newEnabled,
                    ack: true,
                    from: 'simulated',
                    lc: now,
                    ts: now,
                },
                true,
            );
        }
        this.options = options;
    }

    #determineControlType(property: string, hasMinMax: boolean): string {
        const { valueType, write, read, role } = this.#properties[property];
        if (valueType === ValueType.Boolean) {
            if (role) {
                if (role.startsWith('switch')) {
                    return 'switch';
                }
                if (role.startsWith('button')) {
                    return 'button';
                }
            }
            if (write && !read) {
                return 'button';
            }
            return 'switch';
        } else if (valueType === ValueType.Number || valueType === ValueType.NumberPercent || ValueType.NumberMinMax) {
            if (hasMinMax) {
                return 'slider';
            }
            return 'number';
        } else if (valueType === ValueType.Enum) {
            return 'select';
        } else if (valueType === ValueType.String && property === PropertyType.Rgb) {
            //return 'color'; // Add again once works in DM
        }
        return 'input';
    }

    getStates(includeObjectIds = false, reverseOrder = false): Record<string, unknown> {
        const states: Record<string, unknown> = {};
        const keys = Object.keys(this.#properties);
        if (reverseOrder) {
            keys.reverse();
        }
        keys.forEach(property => {
            const stateObject = this.#registeredStates.find(obj => obj.propertyType === property);
            const { valueType, name, unit, write, read } = this.#properties[property];
            const { min, max, step } = stateObject?.getMinMax() ?? {};
            states[`__iobstate__${name}`] = {
                oid: write ?? read,
                unit,
                min,
                max,
                step,
                readOnly: !write,
                control: this.#determineControlType(property, min !== undefined && max !== undefined),
            };
            // Workaround until "control: select" is supported in JSONConfig
            if (valueType === ValueType.Enum) {
                const modes = stateObject?.modes;
                if (modes) {
                    states.__smalltext__AllowedValues = `Allowed values: ${Object.entries(modes)
                        .map(([key, value]) => `${key} (${value})`)
                        .join(', ')}`;
                }
            }
            if (includeObjectIds) {
                if (write !== read && write && read) {
                    states[`__smalltext__${name}`] = `Write: ${write}, Read: ${read}`;
                } else {
                    states[`__smalltext__${name}`] = write ?? read;
                }
            }
        });

        return states;
    }

    cropValue(value: number, min: number, max: number, logMinMaxInfo = true): number {
        if (isNaN(value)) {
            this.#adapter.log.info(`${this.#deviceType}: Value ${value} is not a number. Adjusting to ${min}`);
            return min;
        }
        if (value < min) {
            if (logMinMaxInfo) {
                this.#adapter.log.info(
                    `${this.#deviceType}: Value ${value} is below minimum ${min}. Adjusting to ${min}`,
                );
            }
            return min;
        }
        if (value > max) {
            if (logMinMaxInfo) {
                this.#adapter.log.info(
                    `${this.#deviceType}: Value ${value} is above maximum ${max}. Adjusting to ${max}`,
                );
            }
            return max;
        }
        return value;
    }
}
