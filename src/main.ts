import axios from 'axios';
import jwt from 'jsonwebtoken';
import fs from 'node:fs';
import '@project-chip/matter-node.js';

import * as utils from '@iobroker/adapter-core';
import ChannelDetector, { DetectorState, PatternControl, Types } from '@iobroker/type-detector';
import { Level, Logger } from '@project-chip/matter.js/log';

import { IoBrokerNodeStorage } from './matter/IoBrokerNodeStorage';
import { DeviceFactory, SubscribeManager } from './lib';
import { DetectedDevice, DeviceOptions } from './lib/devices/GenericDevice';
import BridgedDevice, { BridgeCreateOptions } from './matter/BridgedDevicesNode';
import MatterDevice, { DeviceCreateOptions } from './matter/DeviceNode';
import {
    BridgeDescription,
    BridgeDeviceDescription,
    DeviceDescription,
    MatterAdapterConfig
} from './ioBrokerStorageTypes';
import MatterController from './matter/ControllerNode';

import MatterAdapterDeviceManagement from './lib/DeviceManagement';
import { Environment, StorageService } from '@project-chip/matter.js/environment';
import { MatterControllerConfig } from '../src-admin/src/types';
import { NodeStateResponse } from './matter/BaseServerNode';
import { MessageResponse } from './matter/GeneralNode';

const IOBROKER_USER_API = 'https://iobroker.pro:3001';

// If the device was created by user and user defined the type of device => use this OID as given name
const DEVICE_DEFAULT_NAME: { [key: string]: string } = {
    [Types.airCondition]: 'SET',
    [Types.blindButtons]: 'STOP',
    [Types.blind]: 'SET',
    [Types.buttonSensor]: 'PRESS',
    [Types.button]: 'SET',
    [Types.camera]: 'FILE',
    [Types.cie]: 'CIE',
    [Types.ct]: 'TEMPERATURE',
    [Types.dimmer]: 'SET',
    [Types.door]: 'ACTUAL',
    [Types.fireAlarm]: 'ACTUAL',
    [Types.floodAlarm]: 'ACTUAL',
    [Types.gate]: 'SET',
    [Types.hue]: 'HUE',
    [Types.humidity]: 'ACTUAL',
    [Types.image]: 'URL',
    [Types.info]: 'ACTUAL',
    [Types.light]: 'SET',
    [Types.lock]: 'SET',
    [Types.media]: 'PLAY',
    [Types.motion]: 'ACTUAL',
    [Types.rgbSingle]: 'CIE',
    [Types.rgbwSingle]: 'RGB',
    [Types.slider]: 'SET',
    [Types.socket]: 'SET',
    [Types.temperature]: 'ACTUAL',
    [Types.thermostat]: 'SET',
    [Types.vacuumCleaner]: 'POWER',
    [Types.volume]: 'SET',
    [Types.volumeGroup]: 'SET',
    [Types.warning]: 'INFO',
    [Types.weatherCurrent]: 'ACTUAL',
    [Types.weatherForecast]: 'STATE',
    [Types.window]: 'ACTUAL',
    [Types.windowTilt]: 'ACTUAL',
};

interface NodeStatesOptions {
    devices?: boolean;
    bridges?: boolean;
    controller?: boolean;
}

export class MatterAdapter extends utils.Adapter {
    private devices = new Map<string, MatterDevice>();
    private bridges = new Map<string, BridgedDevice>();
    private controller?: MatterController;

    private detector: ChannelDetector;

    private _guiSubscribes: { clientId: string; ts: number }[] | null = null;
    private readonly matterEnvironment: Environment;
    private stateTimeout: NodeJS.Timeout | null = null;
    private subscribed: boolean = false;
    private license: { [key: string]: boolean | undefined } = {};
    public sysLanguage: ioBroker.Languages = 'en';
    private readonly deviceManagement: MatterAdapterDeviceManagement;
    private nextPortNumber: number = 5540;

    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: 'matter',
            uiClientSubscribe: data => this.onClientSubscribe(data.clientId),
            uiClientUnsubscribe: data => {
                const { clientId, reason } = data;
                if (reason === 'client') {
                    this.log.debug(`GUI Client "${clientId} disconnected`);
                } else {
                    this.log.debug(`Client "${clientId}: ${reason}`);
                }
                this.onClientUnsubscribe(clientId);
            }
        });
        this.on('ready', () => this.onReady());
        this.on('stateChange', (id, state) => this.onStateChange(id, state));
        this.on('objectChange', (id , object) => this.onObjectChange(id, object));
        this.on('unload', callback => this.onUnload(callback));
        this.on('message', this.onMessage.bind(this));
        this.deviceManagement = new MatterAdapterDeviceManagement(this);
        this.matterEnvironment = Environment.default;

        this.detector = new ChannelDetector();
    }

    async shutDownMatterNodes(): Promise<void> {
        for (const device of this.devices.values()) {
            await device.stop();
        }
        for (const bridge of this.bridges.values()) {
            await bridge.stop();
        }
        await this.controller?.stop();
    }

    async startUpMatterNodes(): Promise<void> {
        for (const bridge of this.bridges.values()) {
            await bridge.start();
        }

        for (const device of this.devices.values()) {
            await device.start();
        }

        await this.controller?.start();
    }

    async onTotalReset(): Promise<void> {
        this.log.debug('Resetting');
        await this.shutDownMatterNodes();
        // clear all matter storage data of the device nodes
        await this.delObjectAsync('storage', { recursive: true });
        // clear all nodes in the controller
        await this.delObjectAsync('controller', { recursive: true });

        // restart adapter
        this.restart();
    }

    async onMessage(obj: ioBroker.Message): Promise<void> {
        if (obj.command?.startsWith('dm:')) {
            // Handled by Device Manager class itself, so ignored here
            return;
        }
        if (obj.command?.startsWith('controller')) {
            if (this.controller) {
                try {
                    const result = await this.controller.handleCommand(obj.command, obj.message);
                    if (result !== undefined && obj.callback) {
                        this.sendTo(obj.from, obj.command, result, obj.callback);
                    }
                } catch (error) {
                    this.log.warn(`Error while handling command "${obj.command}" for controller: ${error.stack}`);
                    if (obj.callback) {
                        this.sendTo(obj.from, obj.command, { error: error.message }, obj.callback);
                    }
                }
            } else if (obj.callback) {
                this.sendTo(obj.from, obj.command, { error: 'Controller not enabled' }, obj.callback);
            }
            return;
        }
        if (obj.command?.startsWith('device')) {
            for (const [oid, bridge] of this.bridges.entries()) {
                const uuid = oid.split('.').pop() || '';
                if (uuid === obj.message.uuid) {
                    try {
                        const result = await bridge.handleCommand(obj.command, obj.message);
                        if (result !== undefined && obj.callback) {
                            this.sendTo(obj.from, obj.command, result, obj.callback);
                        }
                    } catch (error) {
                        this.log.warn(`Error while handling command "${obj.command}" for device ${uuid}: ${error.stack}`);
                        if (obj.callback) {
                            this.sendTo(obj.from, obj.command, { error: error.message }, obj.callback);
                        }
                    }
                    return;
                }
            }
            for (const [oid, device] of this.devices.entries()) {
                const uuid = oid.split('.').pop() || '';
                if (uuid === obj.message.uuid) {
                    try {
                        const result = await device.handleCommand(obj.command, obj.message);
                        if (result !== undefined && obj.callback) {
                            this.sendTo(obj.from, obj.command, result, obj.callback);
                        }
                    } catch (error) {
                        this.log.warn(`Error while handling command "${obj.command}" for device ${uuid}: ${error.stack}`);
                        if (obj.callback) {
                            this.sendTo(obj.from, obj.command, { error: error.message }, obj.callback);
                        }
                    }

                    return;
                }
            }
            if (obj.callback) {
                this.sendTo(obj.from, obj.command, { error: 'Device or Bridge not found' }, obj.callback);
            }
            return;
        }

        switch (obj.command) {
            case 'reset':
                await this.onTotalReset();
                break;
            case 'nodeStates':
                const states = await this.requestNodeStates(obj.message as NodeStatesOptions);
                if (obj.callback) {
                    this.sendTo(obj.from, obj.command, { states }, obj.callback);
                }
                break;
            case 'getLicense':
                const license = await this.checkLicense(obj.message.login, obj.message.pass);
                if (obj.callback) {
                    this.sendTo(obj.from, obj.command, { result: license }, obj.callback);
                }
                break;
            case 'updateControllerSettings': {
                const newControllerConfig: MatterControllerConfig = JSON.parse(obj.message);
                this.log.info(JSON.stringify(newControllerConfig));
                const result = await this.applyControllerConfiguration(newControllerConfig);
                if (result && 'result' in result) { // was successfull
                    await this.extendObject(`${this.namespace}.controller`, { native: newControllerConfig });
                }
                this.sendTo(obj.from, obj.command, result, obj.callback);
                break;
            }
            default:
                if (obj.callback) {
                    this.sendTo(obj.from, obj.command, { error: `Unknown command "${obj.command}"` }, obj.callback);
                }
        }
    }

    async onClientSubscribe(clientId: string): Promise<{ error?: string, accepted: boolean, heartbeat?: number }> {
        this.log.debug(`Subscribe from ${clientId}`);
        if (!this._guiSubscribes) {
            return { error: `Adapter is still initializing`,accepted: false };
        }
        // start camera with obj.message.data
        if (!this._guiSubscribes.find(s => s.clientId === clientId)) {
            this.log.debug(`Start GUI`);
            // send state of devices
        }

        // inform GUI that subscription is started
        const sub = this._guiSubscribes.find(s => s.clientId === clientId);
        if (!sub) {
            this._guiSubscribes.push({ clientId, ts: Date.now() });
            this.stateTimeout && clearTimeout(this.stateTimeout);
            this.stateTimeout = setTimeout(async() => {
                this.stateTimeout = null;
                const states = await this.requestNodeStates();
                await this.sendToGui({ command: 'bridgeStates', states });
            }, 100);
        } else {
            sub.ts = Date.now();
        }

        return { accepted: true, heartbeat: 120000 };
    }

    onClientUnsubscribe(clientId: string): void {
        this.log.debug(`Unsubscribe from ${clientId}`);
        if (!this._guiSubscribes) {
            return;
        }
        let deleted;
        do {
            deleted = false;
            const pos = this._guiSubscribes.findIndex(s => s.clientId === clientId);
            if (pos !== -1) {
                deleted = true;
                this._guiSubscribes.splice(pos, 1);
            }
        } while(deleted);
    }

    sendToGui = async(data: any): Promise<void> => {
        if (!this._guiSubscribes) {
            return;
        }
        if (this.sendToUI) {
            for (let i = 0; i < this._guiSubscribes.length; i++) {
                await this.sendToUI({ clientId: this._guiSubscribes[i].clientId, data });
            }
        }
    };

    async prepareMatterEnvironment(): Promise<void> {
        const config: MatterAdapterConfig = this.config as MatterAdapterConfig;
        Logger.defaultLogLevel = Level.DEBUG;
        Logger.log = (level: Level, formattedLog: string) => {
            switch (level) {
                case Level.DEBUG:
                    config.debug ? this.log.debug(formattedLog) : this.log.silly(formattedLog);
                    break;

                case Level.INFO:
                    this.log.debug(formattedLog);
                    break;
                case Level.WARN:
                    this.log.info(formattedLog);
                    break;
                case Level.ERROR:
                    this.log.warn(formattedLog);
                    break;
                case Level.FATAL:
                    this.log.error(formattedLog);
                    break;
            }
        };

        /**
         * Initialize the storage system.
         *
         * The storage manager is then also used by the Matter server, so this code block in general is required,
         * but you can choose a different storage backend as long as it implements the required API.
         */
        await this.extendObject('storage',{
            type: 'folder',
            common: {
                expert: true,
                name: 'Matter storage',
            },
            native: {}
        });

        const storageService = this.matterEnvironment.get(StorageService);
        storageService.factory = (namespace: string) => new IoBrokerNodeStorage(this, namespace);
        storageService.location = `${this.namespace}.storage`; // For logging

        if (config.interface) {
            this.matterEnvironment.vars.set('mdns.networkInterface', config.interface);
        }
    }

    async onReady(): Promise<void> {
        this._guiSubscribes = this._guiSubscribes || [];
        SubscribeManager.setAdapter(this);
        await this.prepareMatterEnvironment();

        const systemConfig: ioBroker.SystemConfigObject = await this.getForeignObjectAsync('system.config') as ioBroker.SystemConfigObject;
        this.sysLanguage = systemConfig?.common?.language || 'en';

        await this.syncDevices();
        if (!this.subscribed) {
            this.subscribed = true;
            await this.subscribeForeignObjectsAsync(`${this.namespace}.bridges.*`);
            await this.subscribeForeignObjectsAsync(`${this.namespace}.devices.*`);
            await this.subscribeForeignObjectsAsync(`${this.namespace}.controller.*`);
        }

        /**
         * Start the nodes. This also announces them in the network
         */
        await this.startUpMatterNodes();
    }

    async requestNodeStates(options?: NodeStatesOptions): Promise<{ [uuid: string]: NodeStateResponse }> {
        const states: { [uuid: string]: NodeStateResponse } = {};
        if (!options || !Object.keys(options).length || options.bridges) {
            for (const [oid, bridge] of this.bridges.entries()) {
                const state = await bridge.getState();
                this.log.debug(`State of bridge ${oid} is ${JSON.stringify(state)}`);
                const uuid = oid.split('.').pop() || '';
                states[uuid] = state;
            }
        }
        if (!options || !Object.keys(options).length || options.devices) {
            for (const [oid, device] of this.devices.entries()) {
                const state = await device.getState();
                this.log.debug(`State of device ${oid} is ${JSON.stringify(state)}`);
                const uuid = oid.split('.').pop() || '';
                states[uuid] = state;
            }
        }

        return states;
    }

    async onUnload(callback: () => void): Promise<void> {
        this.stateTimeout && clearTimeout(this.stateTimeout);
        this.stateTimeout = null;

        try {
            // inform GUI about stop
            await this.sendToGui({ command: 'stopped' });

            if (this.deviceManagement) {
                await this.deviceManagement.close();
            }

            await this.shutDownMatterNodes();
            // close Environment/MDNS?
            callback();
        } catch (e) {
            callback();
        }
    }

    async onObjectChange(id: string, obj: ioBroker.Object | null | undefined): Promise<void> {
        // matter.0.bridges.a6e61de9-e450-47bb-8f27-ee360350bdd8
        if (id.startsWith(`${this.namespace}.`) && obj?.common?.type === 'channel') {
            await this.syncDevices(obj as ioBroker.ChannelObject);
        }
    }

    onStateChange(id: string, state: ioBroker.State | null | undefined): void {
        SubscribeManager.observer(id, state);
    }

    async findDeviceFromId(id: string): Promise<string> {
        let obj = await this.getForeignObjectAsync(id);
        if (obj && obj.type === 'device') {
            return id;
        }
        const parts = id.split('.');
        if (obj && obj.type === 'state') {
            // we can go maximal three levels up: state => channel => device
            parts.pop();
            const channelId= parts.join('.');
            obj = await this.getForeignObjectAsync(channelId);
            if (obj && (obj.type === 'device' || obj.type === 'channel')) {
                return channelId;
            }
            // if (obj && obj.type === 'channel') {
            //     parts.pop();
            //     const deviceId = parts.join('.');
            //     obj = await this.getForeignObjectAsync(deviceId);
            //     if (obj && obj.type === 'device') {
            //         return deviceId;
            //     }
            //
            //     return channelId;
            // }
            return id;
        } else if (obj && obj.type === 'channel') {
            // // we can go maximal two levels up: channel => device
            // parts.pop();
            // obj = await this.getForeignObjectAsync(parts.join('.'));
            // if (obj && obj.type === 'device') {
            //     return parts.join('.');
            // }

            return id;
        }

        return id;
    }

    async getDeviceStates(id: string): Promise<PatternControl | null> {
        const deviceId = await this.findDeviceFromId(id);
        const obj = await this.getForeignObjectAsync(deviceId);
        if (!obj) {
            return null;
        }
        const states = await this.getObjectViewAsync('system', 'state', { startkey: `${deviceId}.`, endkey: `${deviceId}.\u9999` });
        const objects = { [obj._id]: obj };
        for (const state of states.rows) {
            if (state.value) {
                objects[state.id] = state.value;
            }
        }

        const keys = Object.keys(objects);        // For optimization
        const usedIds: string[] = [];                       // To not allow using of same ID in more than one device
        const ignoreIndicators = ['UNREACH_STICKY'];    // Ignore indicators by name
        const options = {
            objects,
            id:                 deviceId, // Channel, device or state, that must be detected
            _keysOptional:      keys,
            _usedIdsOptional:   usedIds,
            ignoreIndicators
        };
        const controls = this.detector.detect(options);
        if (controls) {
            const mainState = controls[0].states.find((state: DetectorState) => state.id);
            if (mainState) {
                const id = mainState.id;
                if (id) {
                    // console.log(`In ${options.id} was detected "${controls[0].type}" with following states:`);
                    controls[0].states = controls[0].states.filter((state: DetectorState) => state.id);

                    return controls[0];
                }
            }
        } else {
            console.log(`Nothing found for ${options.id}`);
        }

        return null;
    }

    async checkLicense(login?: string, pass?: string): Promise<boolean> {
        const config = this.config as MatterAdapterConfig;
        login = login || config.login;
        pass = pass || config.pass;
        const key = `${login}/////${pass}`;
        if (this.license[key] !== undefined) {
            return !!this.license[key];
        }
        if (!login || !pass) {
            this.log.error('You need to specify login and password for ioBroker.pro subscription');
            return false;
        }
        let response;
        try {
            // check the license
            response = await axios(`${IOBROKER_USER_API}/api/v1/subscriptions`, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${Buffer.from(`${login}:${pass}`).toString('base64')}`
                }
            });
        } catch (e) {
            if (e.response.status === 401) {
                this.license[key] = false;
                this.log.error(`User login or password is wrong`);
            } else {
                this.log.error(`Cannot verify license: ${e}`);
            }
            return !!this.license[key];
        }
        const subscriptions = response.data;
        const cert = fs.readFileSync(`${__dirname}/../data/cloudCert.crt`);
        if (subscriptions.find((it: any) => {
            try {
                const decoded: any = jwt.verify(it.json, cert);
                if (decoded.name?.startsWith('remote.') || decoded.name?.startsWith('assistant.')) {
                    return new Date(decoded.expires * 1000) > new Date();
                }
            } catch (e) {
                this.log.warn(`Cannot verify license: ${e}`);
                this.license[key] = false;
                return this.license[key];
            }
        })) {
            this.license[key] = true;
            return this.license[key];
        }

        let userResponse;
        try {
            userResponse = await axios(`${IOBROKER_USER_API}/api/v1/user`, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Basic ${Buffer.from(`${login}:${pass}`).toString('base64')}`
                }
            });
        } catch (e) {
            this.license[key] = false;
            this.log.error(`Cannot verify license: ${e}`);
            return this.license[key];
        }
        if (userResponse.data?.tester) {
            this.license[key] = true;
            return this.license[key];
        }

        this.log.warn('No valid ioBroker.pro subscription found. Only one bridge and 5 devices are allowed.');
        this.license[key] = false;
        return this.license[key];
    }

    async prepareMatterBridgeConfiguration(options: BridgeDescription): Promise<BridgeCreateOptions | null> {
        if (options.enabled === false) {
            return null; // Not startup
        }
        const devices = [];
        const optionsList = (options.list || []).filter(item => item.enabled !== false);
        for (let l = 0; l < optionsList.length; l++) {
            const device = optionsList[l];
            let detectedDevice = await this.getDeviceStates(device.oid) as DetectedDevice;
            if (!device.auto && (!detectedDevice || detectedDevice.type !== device.type)) {
                // ignore all detected states and let only one
                detectedDevice = {
                    type: device.type as Types,
                    states: [
                        {
                            name: DEVICE_DEFAULT_NAME[device.type] || 'SET',
                            id: device.oid,
                            // type: StateType.Number, // ignored
                            write: true, // ignored
                            defaultRole: 'button', // ignored
                            required: true, // ignored
                        },
                    ],
                };
            }
            if (detectedDevice) {
                const deviceObject = await DeviceFactory(detectedDevice, this, device as DeviceOptions);
                if (deviceObject) {
                    if (devices.length >= 5) {
                        if (!(await this.checkLicense())) {
                            this.log.error('You cannot use more than 5 devices without ioBroker.pro subscription. Only first 5 devices will be created.}');
                            await deviceObject.destroy();
                            break;
                        }
                    }
                    devices.push(deviceObject);
                }
            }
        }

        if (devices.length) {
            return {
                parameters: {
                    port: this.nextPortNumber++,
                    uuid: options.uuid,
                    vendorId: parseInt(options.vendorID) || 0xfff1,
                    productId: parseInt(options.productID) || 0x8000,
                    deviceName: options.name,
                    productName: `Product ${options.name}`,
                },
                devices,
                devicesOptions: optionsList,
            };
        }
        return null;
    }

    async createMatterBridge(options: BridgeDescription): Promise<BridgedDevice | null> {
        const config = await this.prepareMatterBridgeConfiguration(options);

        if (config) {
            const bridge = new BridgedDevice(this, config);

            await bridge.init(); // add bridge to server

            return bridge;
        }

        return null;
    }

    async prepareMatterDeviceConfiguration(deviceName: string, options: DeviceDescription): Promise<DeviceCreateOptions | null> {
        if (options.enabled === false) {
            return null; // Not startup
        }
        let device;
        let detectedDevice = await this.getDeviceStates(options.oid) as DetectedDevice;
        if (!options.auto && (!detectedDevice || detectedDevice.type !== options.type)) {
            // ignore all detected states and let only one
            detectedDevice = {
                type: options.type as Types,
                states: [
                    {
                        name: DEVICE_DEFAULT_NAME[options.type] || 'SET',
                        id: options.oid,
                        // type: StateType.Number, // ignored
                        write: true, // ignored
                        defaultRole: 'button', // ignored
                        required: true, // ignored
                    },
                ],
            };
        }
        if (detectedDevice) {
            const deviceObject = await DeviceFactory(detectedDevice, this, options as DeviceOptions);
            if (deviceObject) {
                device = deviceObject;
            }
        }
        if (device) {
            return {
                parameters: {
                    port: this.nextPortNumber++,
                    uuid: options.uuid,
                    vendorId: parseInt(options.vendorID) || 0xfff1,
                    productId: parseInt(options.productID) || 0x8000,
                    deviceName: deviceName,
                    productName: `ioBroker ${options.type}`,
                },
                device,
                deviceOptions: options,
            };
        }
        return null;
    }

    async createMatterDevice(deviceName: string, options: DeviceDescription): Promise<MatterDevice | null> {
        const config = await this.prepareMatterDeviceConfiguration(deviceName, options);
        if (config) {
            const matterDevice = new MatterDevice(this, config);
            await matterDevice.init(); // add bridge to server

            return matterDevice;
        }

        return null;
    }

    async createMatterController(controllerOptions: MatterControllerConfig): Promise<MatterController> {
        const matterController = new MatterController({
            adapter: this,
            controllerOptions,
            matterEnvironment: this.matterEnvironment
        });
        await matterController.init(); // add bridge to server

        return matterController;
    }

    /**
     * Synchronize Devices, Bridges and the controller with the configuration
     * @param obj Hand over one object to just handle updates for this and no complete resync.
     */
    async syncDevices(obj?: ioBroker.ChannelObject | null | undefined): Promise<void> {
        const devices: ioBroker.Object[] = [];
        const bridges: ioBroker.Object[] = [];

        const objects: ioBroker.ChannelObject[] = [];
        if (obj) {
            objects.push(obj);
        } else {
            const devicesObjects = await this.getObjectViewAsync(
                'system', 'channel',
                {
                    startkey: `${this.namespace}.devices.`,
                    endkey: `${this.namespace}.devices.\u9999`,
                },
            );
            devicesObjects.rows.forEach(row => objects.push(row.value));
            const bridgesObjects = await this.getObjectViewAsync(
                'system', 'channel',
                {
                    startkey: `${this.namespace}.bridges.`,
                    endkey: `${this.namespace}.bridges.\u9999`,
                },
            );
            bridgesObjects.rows.forEach(row => objects.push(row.value));
        }

        for (const object of objects) {
            // No valid object or a sub-channel
            if (!object || !object.native || object._id.split('.').length !== 4) continue;

            if (object._id.startsWith(`${this.namespace}.devices.`)) {
                if (object.native.deleted) {
                    // delete device
                    this.log.info(`Delete Device "${object.native.uuid}" because deleted in the frontend.`);
                    await this.deleteBridgeOrDevice('device', object._id, object.native.uuid);
                    await this.delObjectAsync(object._id, { recursive: true });
                } else if (object.native.enabled !== false) {
                    devices.push(object);
                }
            } else if (object._id.startsWith(`${this.namespace}.bridges.`)) {
                if (object.native.deleted) {
                    // delete bridge
                    this.log.info(`Delete bridge "${object.native.uuid}" because deleted in the frontend.`);
                    await this.deleteBridgeOrDevice('bridge', object._id, object.native.uuid);
                    await this.delObjectAsync(object._id);
                } else if (
                    object.native.enabled !== false &&
                    object.native.list?.length &&
                    object.native.list.some((item: BridgeDeviceDescription) => item.enabled)
                ) {
                    bridges.push(object);
                }
            }
        }

        // When we just handle one object we do not need to sync with running  devices and bridges
        if (obj === undefined) {
            // Objects existing, not deleted, so disable not enabled bridges or devices
            for (const bridgeId of this.bridges.keys()) {
                if (!bridges.find(obj => obj._id === bridgeId)) {
                    this.log.info(`Bridge "${bridgeId}" is not enabled anymore, so stop it.`);
                    await this.stopBridgeOrDevice('bridge', bridgeId);
                }
            }
            for (const deviceId of this.devices.keys()) {
                if (!devices.find(obj => obj._id === deviceId)) {
                    this.log.info(`Device "${deviceId}" is not enabled anymore, so stop it.`);
                    await this.stopBridgeOrDevice('device', deviceId);
                }
            }
        }

        // Objects exist and enabled: Sync bridges
        for (const bridge of bridges) {
            const existingBridge = this.bridges.get(bridge._id);
            if (existingBridge === undefined) {
                // if one bridge already exists, check the license
                const matterBridge = await this.createMatterBridge(bridge.native as BridgeDescription);
                if (matterBridge) {
                    if (Object.keys(this.bridges).length) {
                        // check license
                        if (!(await this.checkLicense())) {
                            this.log.error(`You cannot use more than one bridge without ioBroker.pro subscription. Bridge "${bridge._id}" will be ignored.}`);
                            await matterBridge.stop();
                            break;
                        }
                    }

                    this.bridges.set(bridge._id, matterBridge);
                }
            } else {
                const config = await this.prepareMatterBridgeConfiguration(bridge.native as BridgeDescription);
                if (config) {
                    this.log.info(`Apply configuration update for bridge "${bridge._id}".`);
                    await existingBridge.applyConfiguration(config);
                } else {
                    this.log.info(`Configuration for bridge "${bridge._id}" is no longer valid or bridge disabled. Stopping it now.`);
                    await existingBridge.stop();
                }
            }
        }

        // Objects exist and enabled: Sync devices
        for (const device of devices) {
            const deviceName = typeof device.common.name === 'object' ?
                (device.common.name[this.sysLanguage] ? device.common.name[this.sysLanguage] as string : device.common.name.en) : device.common.name;
            const existingDevice = this.devices.get(device._id);
            if (existingDevice === undefined) {
                const matterDevice = await this.createMatterDevice(
                    deviceName,
                    device.native as DeviceDescription
                );
                if (matterDevice) {
                    if (Object.keys(this.devices).length >= 2) {
                        if (!(await this.checkLicense())) {
                            this.log.error('You cannot use more than 2 devices without ioBroker.pro subscription. Only first 2 devices will be created.}');
                            await matterDevice.stop();
                            break;
                        }
                    }
                    this.devices.set(device._id, matterDevice);
                }
            } else {
                const config = await this.prepareMatterDeviceConfiguration(deviceName, device.native as DeviceDescription);
                if (config) {
                    this.log.info(`Apply configuration update for device "${device._id}".`);
                    await existingDevice.applyConfiguration(config);
                } else {
                    this.log.info(`Configuration for device "${device._id}" is no longer valid or bridge disabled. Stopping it now.`);
                    await existingDevice.stop();
                }
            }
        }

        if (!obj) {
            // Sync controller
            const controllerObj = await this.getObjectAsync('controller');
            const controllerConfig = (controllerObj?.native ?? { enabled: false }) as MatterControllerConfig;
            await this.applyControllerConfiguration(controllerConfig);
        }

        // TODO Anything to do for controller sub object changes?
    }

    async applyControllerConfiguration(config: MatterControllerConfig): Promise<MessageResponse> {
        if (config.enabled) {
            if (this.controller) {
                return this.controller.applyConfiguration(config);
            }

            this.controller = await this.createMatterController(config);
        } else if (this.controller) {
            // Controller should be disabled but is not
            await this.controller.stop();
            this.controller = undefined;
        }

        return { result: true };
    }

    async stopBridgeOrDevice(type: 'bridge' | 'device', id: string): Promise<void> {
        const nodes = type === 'bridge' ? this.bridges : this.devices;
        const node = nodes.get(id);
        if (node) {
            await node.stop();
            nodes.delete(id);
        }
    }

    async deleteBridgeOrDevice(type: 'bridge' | 'device', id: string, uuid: string): Promise<void> {
        await this.stopBridgeOrDevice(type, id);
        const storage = new IoBrokerNodeStorage(this, uuid);
        await storage.clearAll();
    }
}

if (require.main !== module) {
    // Export the7 constructor in compact mode
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new MatterAdapter(options);
} else {
    // otherwise start the instance directly
    (() => new MatterAdapter())();
}
