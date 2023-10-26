import axios from 'axios';
import jwt from 'jsonwebtoken';
import fs from 'fs';

import * as utils from '@iobroker/adapter-core';
import ChannelDetector, { DetectorState, PatternControl, Types } from '@iobroker/type-detector';
import { MatterServer } from '@project-chip/matter-node.js';
import { StorageManager } from '@project-chip/matter-node.js/storage';
import { Level, Logger } from '@project-chip/matter-node.js/log';

import { StorageIoBroker } from './matter/StorageIoBroker';
import { DeviceFabric, SubscribeManager } from './lib';
import { DetectedDevice, DeviceOptions } from './lib/devices/GenericDevice';
import BridgedDevice, { NodeStateResponse } from './matter/BridgedDevicesNode';
import MatterDevice from './matter/DeviceNode';
import {
    BridgeDescription,
    BridgeDeviceDescription,
    DeviceDescription,
    MatterAdapterConfig
} from './ioBrokerStorageTypes';


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
    private detector: ChannelDetector;
    private devices: { [key: string]: MatterDevice } = {};
    private bridges: { [key: string]: BridgedDevice } = {};
    private _guiSubscribes: { clientId: string; ts: number }[] | null= null;
    private matterServer: MatterServer | undefined;
    private storage: StorageIoBroker | undefined;
    private storageManager: StorageManager | null = null;
    private stateTimeout: NodeJS.Timeout | null = null;
    private subscribed: boolean = false;
    private license: { [key: string]: boolean | undefined } = {};

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
        this.on('objectChange', (id /* , object */) => this.onObjectChange(id));
        this.on('unload', callback => this.onUnload(callback));
        this.on('message', this.onMessage.bind(this));

        this.detector = new ChannelDetector();
    }

    async onTotalReset(): Promise<void> {
        this.log.debug('Resetting');
        await this.matterServer?.close();
        await this.storage?.clearAll();
        await this.onReady();
    }

    async onMessage(obj: ioBroker.Message): Promise<void> {
        if (obj?.command === 'reset') {
            await this.onTotalReset();
        } else if (obj?.command === 'nodeStates') {
            const states = await this.requestNodeStates(obj.message as NodeStatesOptions);
            obj.callback && this.sendTo(obj.from, obj.command, { states }, obj.callback);
        } else if (obj.command === 'getLicense') {
            const license = await this.checkLicense(obj.message.login, obj.message.pass);
            obj.callback && this.sendTo(obj.from, obj.command, { result: license }, obj.callback);
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

    async createMatterServer(): Promise<void> {
        const config: MatterAdapterConfig = this.config as MatterAdapterConfig;
        Logger.defaultLogLevel = Level.DEBUG;
        Logger.log = (level: Level, formattedLog: string) => {
            switch (level) {
                case Level.DEBUG:
                    this.log.silly(formattedLog);
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
        this.storage = new StorageIoBroker(this);
        this.storageManager = new StorageManager(this.storage);
        await this.storageManager.initialize();

        if (!config.interface) {
            this.matterServer = new MatterServer(this.storageManager);
        } else {
            this.matterServer = new MatterServer(this.storageManager, { mdnsAnnounceInterface: config.interface });
        }
    }

    async onReady(): Promise<void> {
        this._guiSubscribes = this._guiSubscribes || [];
        SubscribeManager.setAdapter(this);
        await this.createMatterServer();

        await this.loadDevices();
        if (!this.subscribed) {
            this.subscribed = true;
            await this.subscribeForeignObjectsAsync(`${this.namespace}.0.bridges.*`);
            await this.subscribeForeignObjectsAsync(`${this.namespace}.0.devices.*`);
            await this.subscribeForeignObjectsAsync(`${this.namespace}.0.controller`);
        }

        /**
         * Start the Matter Server
         *
         * After everything was plugged together we can start the server.
         * When a not delayed announcement is set for the CommissioningServer node,
         * then this command also starts the announcement of the device into the network.
         */
        await this.matterServer?.start();
    }

    async requestNodeStates(options?: NodeStatesOptions): Promise<{ [uuid: string]: NodeStateResponse }> {
        const states: { [uuid: string]: NodeStateResponse } = {};
        if (!options || !Object.keys(options).length || options.bridges) {
            for (const oid in this.bridges) {
                const state = await this.bridges[oid].getState();
                this.log.debug(`State of bridge ${oid} is ${JSON.stringify(state)}`);
                const uuid = oid.split('.').pop() || '';
                states[uuid] = state;
            }
        }
        if (!options || !Object.keys(options).length || options.devices) {
            for (const oid in this.devices) {
                const state = await this.devices[oid].getState();
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

        // inform GUI about stop
        await this.sendToGui({ command: 'stopped' });

        try {
            await this.matterServer?.close();
            // close storage ??
            callback();
        } catch (e) {
            callback();
        }
    }

    async onObjectChange(id: string/*, obj: ioBroker.Object | null | undefined*/): Promise<void> {
        // matter.0.bridges.a6e61de9-e450-47bb-8f27-ee360350bdd8
        if (id.startsWith(`${this.namespace}.`) && id.split('.').length === 4) {
            await this.loadDevices();
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
            if (obj && obj.type === 'device') {
                return channelId;
            }
            if (obj && obj.type === 'channel') {
                parts.pop();
                const deviceId = parts.join('.');
                obj = await this.getForeignObjectAsync(deviceId);
                if (obj && obj.type === 'device') {
                    return deviceId;
                }

                return channelId;
            }
            return id;
        } else if (obj && obj.type === 'channel') {
            // we can go maximal two levels up: channel => device
            parts.pop();
            obj = await this.getForeignObjectAsync(parts.join('.'));
            if (obj && obj.type === 'device') {
                return parts.join('.');
            }

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
                return !!this.license[key];
            }
        })) {
            this.license[key] = true;
            return !!this.license[key];
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
            return !!this.license[key];
        }
        if (userResponse.data?.tester) {
            this.license[key] = true;
            return !!this.license[key];
        }

        this.log.warn('No valid ioBroker.pro subscription found. Only one bridge and 5 devices are allowed.');
        this.license[key] = false;
        return !!this.license[key];
    }

    async createMatterBridge(options: BridgeDescription): Promise<BridgedDevice | null> {
        if (this.matterServer) {
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
                    const deviceObject = await DeviceFabric(detectedDevice, this, device as DeviceOptions);
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
                const bridge = new BridgedDevice({
                    adapter: this,
                    parameters: {
                        uuid: options.uuid,
                        passcode: parseInt(options.passcode as string, 10) || 20202021,
                        discriminator: 3840,
                        vendorid: parseInt(options.vendorID) || 0xfff1,
                        productid: parseInt(options.productID) || 0x8000,
                        devicename: options.name,
                        productname: `Product ${options.name}`,
                    },
                    devices,
                    devicesOptions: optionsList,
                    matterServer: this.matterServer,
                });

                await bridge.init(); // add bridge to server

                return bridge;
            }

            return null;
        }
        throw new Error('Matter server not initialized');
    }

    async createMatterDevice(options: DeviceDescription): Promise<MatterDevice | null> {
        if (this.matterServer) {
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
                const deviceObject = await DeviceFabric(detectedDevice, this, options as DeviceOptions);
                if (deviceObject) {
                    device = deviceObject;
                }
            }
            if (device) {
                const matterDevice = new MatterDevice({
                    adapter: this,
                    parameters: {
                        uuid: options.uuid,
                        passcode: parseInt(options.passcode as string, 10) || 20202021,
                        discriminator: 3840,
                        vendorid: parseInt(options.vendorID) || 0xfff1,
                        productid: parseInt(options.productID) || 0x8000,
                        devicename: options.name,
                        productname: `Product ${options.name}`,
                    },
                    device,
                    deviceOptions: options,
                    matterServer: this.matterServer,
                });
                await matterDevice.init(); // add bridge to server

                return matterDevice;
            }

            return null;
        }
        throw new Error('Matter server not initialized');
    }

    async loadDevices(): Promise<void> {
        const _devices: ioBroker.Object[] = [];
        const _bridges: ioBroker.Object[] = [];

        const objects = await this.getObjectViewAsync(
            'system', 'channel',
            {
                startkey: `${this.namespace}.`,
                endkey: `${this.namespace}.\u9999`,
            },
        );

        for (let r = 0; r < objects.rows.length; r++) {
            const object = objects.rows[r]?.value;
            if (!object) {
                return;
            }
            if (object._id.startsWith(`${this.namespace}.devices.`) && object.native.enabled !== false) {
                _devices.push(object);
            } else if (object._id.startsWith(`${this.namespace}.bridges.`) &&
                object.native.enabled !== false &&
                object.native.list?.length &&
                object.native.list.find((item: BridgeDeviceDescription) => item.enabled !== false)
            ) {
                _bridges.push(object);
            }
        }

        // Delete old non-existing bridges
        for (const bridgeId in this.bridges) {
            if (!_bridges.find(obj => obj._id === bridgeId)) {
                await this.bridges[bridgeId].stop();
                delete this.bridges[bridgeId];
            }
        }

        // Create new bridges
        for (const b in _bridges) {
            const bridge = _bridges[b];
            if (!this.bridges[bridge._id]) {
                // if one bridge already exists, check the license
                const matterBridge = await this.createMatterBridge(bridge.native as BridgeDescription);
                if (matterBridge) {
                    if (Object.keys(this.bridges).length) {
                        // check license
                        if (!(await this.checkLicense())) {
                            this.log.error(`You cannot use more than one bridge without ioBroker.pro subscription. Bridge ${bridge._id} will be ignored.}`);
                            await matterBridge.stop();
                            break;
                        }
                    }

                    this.bridges[bridge._id] = matterBridge;
                }
            }
        }

        // Delete old non-existing devices
        for (const device in this.devices) {
            if (!_devices.find(obj => obj._id === device)) {
                await this.devices[device].stop();
                delete this.devices[device];
            }
        }

        // Create new devices
        for (const d in _devices) {
            const device = _devices[d];
            if (!this.devices[device._id]) {
                const matterDevice = await this.createMatterDevice(device.native as DeviceDescription);
                if (matterDevice) {
                    if (Object.keys(this.devices).length >= 2) {
                        if (!(await this.checkLicense())) {
                            this.log.error('You cannot use more than 2 devices without ioBroker.pro subscription. Only first 2 devices will be created.}');
                            await matterDevice.stop();
                            break;
                        }
                    }
                    this.devices[device._id] = matterDevice;
                }
            }
        }
    }
}

if (require.main !== module) {
    // Export the7 constructor in compact mode
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new MatterAdapter(options);
} else {
    // otherwise start the instance directly
    (() => new MatterAdapter())();
}