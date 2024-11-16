import * as utils from '@iobroker/adapter-core';
import ChannelDetector, { type DetectorState, Types } from '@iobroker/type-detector';
import { Environment, LogLevel, Logger, StorageService } from '@matter/main';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import fs from 'node:fs/promises';
import type { MatterControllerConfig } from '../src-admin/src/types';
import type {
    BridgeDescription,
    BridgeDeviceDescription,
    DeviceDescription,
    MatterAdapterConfig,
} from './ioBrokerStorageTypes';
import { DeviceFactory, SubscribeManager } from './lib';
import MatterAdapterDeviceManagement from './lib/DeviceManagement';
import type { DetectedDevice, DeviceOptions } from './lib/devices/GenericDevice';
import type { NodeStateResponse } from './matter/BaseServerNode';
import BridgedDevice, { type BridgeCreateOptions } from './matter/BridgedDevicesNode';
import MatterController from './matter/ControllerNode';
import MatterDevice, { type DeviceCreateOptions } from './matter/DeviceNode';
import type { PairedNodeConfig } from './matter/GeneralMatterNode';
import type { MessageResponse } from './matter/GeneralNode';
import { IoBrokerObjectStorage } from './matter/IoBrokerObjectStorage';
const I18n = import('@iobroker/i18n');

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
    readonly #devices = new Map<string, MatterDevice>();
    readonly #bridges = new Map<string, BridgedDevice>();
    #controller?: MatterController;
    #detector: ChannelDetector;
    #_guiSubscribes: { clientId: string; ts: number }[] | null = null;
    readonly #matterEnvironment: Environment;
    #stateTimeout: NodeJS.Timeout | null = null;
    #license: { [key: string]: boolean | undefined } = {};
    sysLanguage: ioBroker.Languages = 'en';
    readonly #deviceManagement: MatterAdapterDeviceManagement;
    #nextPortNumber: number = 5541;
    #instanceDataDir?: string;
    t: (word: string, ...args: (string | number | boolean | null)[]) => string;
    getText: (word: string, ...args: (string | number | boolean | null)[]) => ioBroker.Translated;

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
            },
        });
        this.on('ready', () => this.onReady());
        this.on('stateChange', (id, state) => this.onStateChange(id, state));
        this.on('objectChange', (id, object) => this.onObjectChange(id, object));
        this.on('unload', callback => this.onUnload(callback));
        this.on('message', this.onMessage.bind(this));
        this.#deviceManagement = new MatterAdapterDeviceManagement(this);
        this.#matterEnvironment = Environment.default;

        this.#detector = new ChannelDetector();
        this.t = (word: string, ..._args: (string | number | boolean | null)[]): string => word;
        this.getText = (_word: string, ..._args: (string | number | boolean | null)[]): ioBroker.Translated =>
            ({}) as ioBroker.Translated;
    }

    get controllerNode(): MatterController | undefined {
        return this.#controller;
    }

    async shutDownMatterNodes(): Promise<void> {
        for (const device of this.#devices.values()) {
            await device.stop();
        }
        for (const bridge of this.#bridges.values()) {
            await bridge.stop();
        }
        await this.#controller?.stop();
    }

    async startUpMatterNodes(): Promise<void> {
        for (const bridge of this.#bridges.values()) {
            await bridge.start();
        }

        for (const device of this.#devices.values()) {
            await device.start();
        }

        await this.#controller?.start();
    }

    async onTotalReset(): Promise<void> {
        this.log.debug('Reset complete matter state');
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
        this.log.debug(`Handle message ${JSON.stringify(obj)}`);
        if (obj.command?.startsWith('controller')) {
            if (this.#controller) {
                try {
                    const result = await this.#controller.handleCommand(obj.command, obj.message);
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
            for (const [oid, bridge] of this.#bridges.entries()) {
                const uuid = oid.split('.').pop() || '';
                if (uuid === obj.message.uuid) {
                    try {
                        const result = await bridge.handleCommand(obj.command, obj.message);
                        if (result !== undefined && obj.callback) {
                            this.sendTo(obj.from, obj.command, result, obj.callback);
                        }
                    } catch (error) {
                        this.log.warn(
                            `Error while handling command "${obj.command}" for device ${uuid}: ${error.stack}`,
                        );
                        if (obj.callback) {
                            this.sendTo(obj.from, obj.command, { error: error.message }, obj.callback);
                        }
                    }
                    return;
                }
            }
            for (const [oid, device] of this.#devices.entries()) {
                const uuid = oid.split('.').pop() || '';
                if (uuid === obj.message.uuid) {
                    try {
                        const result = await device.handleCommand(obj.command, obj.message);
                        if (result !== undefined && obj.callback) {
                            this.sendTo(obj.from, obj.command, result, obj.callback);
                        }
                    } catch (error) {
                        this.log.warn(
                            `Error while handling command "${obj.command}" for device ${uuid}: ${error.stack}`,
                        );
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
            case 'nodeStates': {
                const states = await this.requestNodeStates(obj.message as NodeStatesOptions);
                if (obj.callback) {
                    this.sendTo(obj.from, obj.command, { states }, obj.callback);
                }
                break;
            }
            case 'getLicense': {
                const license = await this.checkLicense(obj.message.login, obj.message.pass);
                if (obj.callback) {
                    this.sendTo(obj.from, obj.command, { result: license }, obj.callback);
                }
                break;
            }
            case 'updateControllerSettings': {
                const newControllerConfig: MatterControllerConfig = JSON.parse(obj.message);
                this.log.debug(`Applying updated controller configuration: ${JSON.stringify(newControllerConfig)}`);
                const result = await this.applyControllerConfiguration(newControllerConfig);
                if (result && 'result' in result) {
                    // was successful
                    await this.extendObjectAsync(`${this.namespace}.controller`, { native: newControllerConfig });
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

    onClientSubscribe(clientId: string): Promise<{ error?: string; accepted: boolean; heartbeat?: number }> {
        this.log.debug(`Subscribe from ${clientId}`);
        if (!this.#_guiSubscribes) {
            return Promise.resolve({ error: `Adapter is still initializing`, accepted: false });
        }
        // start camera with obj.message.data
        if (!this.#_guiSubscribes.find(s => s.clientId === clientId)) {
            this.log.debug(`Start GUI`);
            // send state of devices
        }

        // inform GUI that subscription is started
        const sub = this.#_guiSubscribes.find(s => s.clientId === clientId);
        if (!sub) {
            this.#_guiSubscribes.push({ clientId, ts: Date.now() });
            this.#stateTimeout && clearTimeout(this.#stateTimeout);
            this.#stateTimeout = setTimeout(async () => {
                this.#stateTimeout = null;
                const states = await this.requestNodeStates();
                await this.sendToGui({ command: 'bridgeStates', states });
            }, 100);
        } else {
            sub.ts = Date.now();
        }

        return Promise.resolve({ accepted: true, heartbeat: 120000 });
    }

    onClientUnsubscribe(clientId: string): void {
        this.log.debug(`Unsubscribe from ${clientId}`);
        if (!this.#_guiSubscribes) {
            return;
        }
        let deleted;
        do {
            deleted = false;
            const pos = this.#_guiSubscribes.findIndex(s => s.clientId === clientId);
            if (pos !== -1) {
                deleted = true;
                this.#_guiSubscribes.splice(pos, 1);
            }
        } while (deleted);
    }

    sendToGui = async (data: any): Promise<void> => {
        if (!this.#_guiSubscribes) {
            return;
        }
        if (this.sendToUI) {
            for (let i = 0; i < this.#_guiSubscribes.length; i++) {
                await this.sendToUI({ clientId: this.#_guiSubscribes[i].clientId, data });
            }
        }
    };

    async prepareMatterEnvironment(): Promise<void> {
        const config: MatterAdapterConfig = this.config as MatterAdapterConfig;
        Logger.defaultLogLevel = LogLevel.DEBUG;
        Logger.log = (level: LogLevel, formattedLog: string) => {
            switch (level) {
                case LogLevel.DEBUG:
                    config.debug ? this.log.debug(formattedLog) : this.log.silly(formattedLog);
                    break;

                case LogLevel.INFO:
                    this.log.debug(formattedLog);
                    break;
                case LogLevel.WARN:
                    this.log.info(formattedLog);
                    break;
                case LogLevel.ERROR:
                    this.log.warn(formattedLog);
                    break;
                case LogLevel.FATAL:
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
        await this.extendObjectAsync('storage', {
            type: 'folder',
            common: {
                expert: true,
                name: 'Matter storage',
            },
            native: {},
        });

        const storageService = this.#matterEnvironment.get(StorageService);
        storageService.factory = (namespace: string) =>
            new IoBrokerObjectStorage(
                this,
                namespace,
                false,
                namespace === 'controller' ? this.#instanceDataDir : undefined,
                namespace === 'controller' ? 'node-' : undefined,
            );
        storageService.location = `${this.namespace}.storage`; // For logging

        if (config.interface) {
            this.#matterEnvironment.vars.set('mdns.networkInterface', config.interface);
        }
    }

    async onReady(): Promise<void> {
        const dataDir = utils.getAbsoluteInstanceDataDir(this);
        try {
            await fs.mkdir(dataDir);
            this.#instanceDataDir = dataDir;
        } catch (err) {
            if (err.code === 'EEXIST') {
                this.#instanceDataDir = dataDir;
            } else {
                this.log.info(
                    `Can not create pairing data storage directory ${this.#instanceDataDir}. Pairing data can not be persisted!`,
                );
            }
        }
        // init i18n
        const i18n = await I18n;
        await i18n.init(`${__dirname}/lib`, this);
        this.t = i18n.translate;
        this.getText = i18n.getTranslatedObject;

        SubscribeManager.setAdapter(this);
        await this.prepareMatterEnvironment();

        const systemConfig: ioBroker.SystemConfigObject = (await this.getForeignObjectAsync(
            'system.config',
        )) as ioBroker.SystemConfigObject;
        this.sysLanguage = systemConfig?.common?.language || 'en';

        this.log.debug('Sync devices');

        await this.syncDevices();

        this.log.debug('Devices synced');

        this.subscribeObjects('bridges.*');
        this.subscribeObjects('devices.*');
        this.subscribeObjects('controller.*');

        this.log.debug('Objects subscribed');
        /**
         * Start the nodes. This also announces them in the network
         */
        await this.startUpMatterNodes();

        // this allows to GUI to read the devices. So make it after all devices are loaded
        this.#_guiSubscribes = this.#_guiSubscribes || [];
    }

    async requestNodeStates(options?: NodeStatesOptions): Promise<{ [uuid: string]: NodeStateResponse }> {
        const states: { [uuid: string]: NodeStateResponse } = {};
        if (!options || !Object.keys(options).length || options.bridges) {
            for (const [oid, bridge] of this.#bridges.entries()) {
                const state = await bridge.getState();
                this.log.debug(`State of bridge ${oid} is ${JSON.stringify(state)}`);
                const uuid = oid.split('.').pop() || '';
                states[uuid] = state;
            }
        }
        if (!options || !Object.keys(options).length || options.devices) {
            for (const [oid, device] of this.#devices.entries()) {
                const state = await device.getState();
                this.log.debug(`State of device ${oid} is ${JSON.stringify(state)}`);
                const uuid = oid.split('.').pop() || '';
                states[uuid] = state;
            }
        }

        return states;
    }

    async onUnload(callback: () => void): Promise<void> {
        this.#stateTimeout && clearTimeout(this.#stateTimeout);
        this.#stateTimeout = null;

        try {
            // inform GUI about stop
            await this.sendToGui({ command: 'stopped' });

            if (this.#deviceManagement) {
                await this.#deviceManagement.close();
            }

            await this.shutDownMatterNodes();
            // close Environment/MDNS?
        } catch {
            // ignore
        }
        callback();
    }

    async onObjectChange(id: string, obj: ioBroker.Object | null | undefined): Promise<void> {
        this.log.debug(`Object changed ${id}, type = ${obj?.type}`);
        const objParts = id.split('.').slice(2); // remove namespace and instance
        const objPartsLength = objParts.length;

        // matter.0.bridges.a6e61de9-e450-47bb-8f27-ee360350bdd8
        if (
            ((objParts[0] === 'devices' && objPartsLength === 2) ||
                (objParts[0] === 'bridges' && objPartsLength === 2)) &&
            obj?.type === 'channel'
        ) {
            await this.syncDevices(obj as ioBroker.ChannelObject);
        } else if (objParts[0] === 'controller' && objPartsLength === 2 && obj?.type === 'folder') {
            // controller sub node changed
            const nodeId = objParts[1];
            await this.syncControllerNode(nodeId, obj as ioBroker.FolderObject);
        } else if (objParts[0] === 'controller' && objPartsLength > 2 && obj?.type === 'device') {
            // controller node device sub node changed
            const nodeId = objParts[1];
            const nodeObj = await this.getObjectAsync(`controller.${nodeId}`);
            if (!nodeObj) {
                this.log.warn('Controller node not found');
                return;
            }
            await this.syncControllerNode(nodeId, nodeObj as ioBroker.FolderObject);
        }
    }

    onStateChange(id: string, state: ioBroker.State | null | undefined): void {
        SubscribeManager.observer(id, state).catch(e => this.log.error(`Error while observing state ${id}: ${e}`));
    }

    async findDeviceFromId(id: string, searchDeviceComingFromLevel?: number): Promise<string | null> {
        const obj = await this.getForeignObjectAsync(id);
        if (!obj) {
            // Object does not exist
            return null;
        }
        if (obj.type === 'device' || obj.type === 'channel') {
            // Because it seems we are also fine with just a channel return also then
            // We found a device object, use this
            return id;
        }
        const parts = id.split('.');
        if (parts.length === 1) {
            return null; // should never happen, we ran onto instance level
        }
        if (parts.length === 2) {
            // Check if the device search originator comes from one level below, else we found nothing
            if (searchDeviceComingFromLevel !== undefined && searchDeviceComingFromLevel !== 3) {
                return null;
            }
            // we can not go higher because we found the namespace root, ets assume a "one device adapter"
            return id;
        }

        parts.pop();
        const upperLevelObjectId = parts.join('.');

        const foundDevice = await this.findDeviceFromId(
            upperLevelObjectId,
            searchDeviceComingFromLevel ?? parts.length + 1,
        );
        if (foundDevice === null) {
            if (/*obj.type === 'channel' ||*/ obj.type === 'state') {
                return id;
            }
            // ok we did not find anything better, go back
            return null;
        }
        return foundDevice;
    }

    async getIoBrokerDeviceStates(id: string): Promise<DetectedDevice | null> {
        const deviceId = await this.findDeviceFromId(id);
        this.log.debug(`Found device for ${id}: ${deviceId}`);
        if (!deviceId) {
            return null;
        }
        const obj = await this.getForeignObjectAsync(deviceId);
        if (!obj) {
            return null;
        }
        const states = await this.getObjectViewAsync('system', 'state', {
            startkey: `${deviceId}.`,
            endkey: `${deviceId}.\u9999`,
        });
        const objects = { [obj._id]: obj };
        for (const state of states.rows) {
            if (state.value) {
                objects[state.id] = state.value;
                this.log.debug(`    Found state ${state.id}`);
            }
        }

        const keys = Object.keys(objects); // For optimization
        const usedIds = new Array<string>(); // Do not allow to use the same ID in more than one device
        const ignoreIndicators = ['UNREACH_STICKY']; // Ignore indicators by name
        const options = {
            objects,
            id: deviceId, // Channel, device or state, that must be detected
            _keysOptional: keys,
            _usedIdsOptional: usedIds,
            ignoreIndicators,
        };
        const controls = this.#detector.detect(options);
        this.log.debug(`Found ${controls?.length} controls for ${deviceId}: ${JSON.stringify(controls)}`);
        if (controls?.length) {
            // TODO Handle multiple findings, except "info" type
            const mainState = controls[0].states.find((state: DetectorState) => state.id);
            if (mainState) {
                const id = mainState.id;
                if (id) {
                    // console.log(`In ${options.id} was detected "${controls[0].type}" with following states:`);
                    controls[0].states = controls[0].states.filter((state: DetectorState) => state.id);

                    return {
                        ...controls[0],
                        isIoBrokerDevice: true,
                    } as DetectedDevice;
                }
            }
        } else {
            this.log.info(`No IoBroker device type found for ${options.id}`);
        }

        return null;
    }

    async checkLicense(login?: string, pass?: string): Promise<boolean> {
        const config = this.config as MatterAdapterConfig;
        login = login || config.login;
        pass = pass || config.pass;
        const key = `${login}/////${pass}`;
        if (this.#license[key] !== undefined) {
            return !!this.#license[key];
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
                    Authorization: `Basic ${Buffer.from(`${login}:${pass}`).toString('base64')}`,
                },
            });
        } catch (e) {
            if (e.response.status === 401) {
                this.#license[key] = false;
                this.log.error(`User login or password is wrong`);
            } else {
                this.log.error(`Cannot verify license: ${e}`);
            }
            return !!this.#license[key];
        }
        const subscriptions = response.data;
        const cert = await fs.readFile(`${__dirname}/../data/cloudCert.crt`, 'utf8');
        if (
            subscriptions.find((it: any) => {
                try {
                    const decoded: any = jwt.verify(it.json, cert);
                    if (decoded.name?.startsWith('remote.') || decoded.name?.startsWith('assistant.')) {
                        return new Date(decoded.expires * 1000) > new Date();
                    }
                } catch (e) {
                    this.log.warn(`Cannot verify license: ${e}`);
                    this.#license[key] = false;
                    return this.#license[key];
                }
            })
        ) {
            this.#license[key] = true;
            return this.#license[key];
        }

        let userResponse;
        try {
            userResponse = await axios(`${IOBROKER_USER_API}/api/v1/user`, {
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Basic ${Buffer.from(`${login}:${pass}`).toString('base64')}`,
                },
            });
        } catch (e) {
            this.#license[key] = false;
            this.log.error(`Cannot verify license: ${e}`);
            return this.#license[key];
        }
        if (userResponse.data?.tester) {
            this.#license[key] = true;
            return this.#license[key];
        }

        this.log.warn('No valid ioBroker.pro subscription found. Only one bridge and 5 devices are allowed.');
        this.#license[key] = false;
        return this.#license[key];
    }

    async determineIoBrokerDevice(oid: string, type: string, auto: boolean): Promise<DetectedDevice> {
        const detectedDevice = await this.getIoBrokerDeviceStates(oid);
        if (detectedDevice && detectedDevice.type === type && auto) {
            return detectedDevice;
        }
        if (detectedDevice?.type !== type) {
            this.log.error(
                `Type detection mismatch for state ${oid}: ${detectedDevice?.type} !== ${type}. Initialize device with just this one state.`,
            );
        }
        // ignore all detected states and let only one
        return {
            type: type as Types,
            states: [
                {
                    name: DEVICE_DEFAULT_NAME[type] || 'SET',
                    id: oid,
                    // type: StateType.Number, // ignored
                    write: true, // ignored
                    defaultRole: 'button', // ignored
                    required: true, // ignored
                },
            ],
            isIoBrokerDevice: true,
        };
    }

    async prepareMatterBridgeConfiguration(
        options: BridgeDescription,
        assignedPort?: number,
    ): Promise<BridgeCreateOptions | null> {
        if (options.enabled === false) {
            return null; // Not startup
        }
        options.list = options.list ?? [];
        const devices = [];
        for (const device of options.list) {
            const detectedDevice = await this.determineIoBrokerDevice(device.oid, device.type, device.auto);
            try {
                const deviceObject = await DeviceFactory(detectedDevice, this, device as DeviceOptions);
                devices.push(deviceObject);
                if (devices.length >= 5) {
                    if (!(await this.checkLicense())) {
                        this.log.error(
                            'You cannot use more than 5 devices without ioBroker.pro subscription. Only first 5 devices will be created.',
                        );
                        await deviceObject.destroy();
                        break;
                    }
                }
            } catch (e) {
                this.log.error(`Cannot create device for ${device.oid}: ${e.message}`);
            }
        }

        if (devices.length) {
            const port =
                (assignedPort ?? (this.config as MatterAdapterConfig).defaultBridge === options.uuid)
                    ? 5540
                    : this.#nextPortNumber++;
            return {
                parameters: {
                    port,
                    uuid: options.uuid,
                    vendorId: parseInt(options.vendorID) || 0xfff1,
                    productId: parseInt(options.productID) || 0x8000,
                    deviceName: options.name,
                    productName: `Product ${options.name}`,
                },
                devices,
                devicesOptions: options.list,
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

    async prepareMatterDeviceConfiguration(
        deviceName: string,
        options: DeviceDescription,
        assignedPort?: number,
    ): Promise<DeviceCreateOptions | null> {
        if (options.enabled === false) {
            return null; // Not startup
        }
        const detectedDevice = await this.determineIoBrokerDevice(options.oid, options.type, options.auto);
        try {
            const device = await DeviceFactory(detectedDevice, this, options as DeviceOptions);
            return {
                parameters: {
                    port: assignedPort ?? this.#nextPortNumber++,
                    uuid: options.uuid,
                    vendorId: parseInt(options.vendorID) || 0xfff1,
                    productId: parseInt(options.productID) || 0x8000,
                    deviceName: deviceName,
                    productName: `ioBroker ${options.type}`,
                },
                device,
                deviceOptions: options,
            };
        } catch (e) {
            this.log.error(`Cannot create device for ${options.oid}: ${e.message}`);
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
            matterEnvironment: this.#matterEnvironment,
        });
        await matterController.init(); // add bridge to server

        return matterController;
    }

    /**
     * Synchronize Devices, Bridges and the controller with the configuration
     *
     * @param obj Hand over one object to just handle updates for this and no complete re-sync.
     */
    async syncDevices(obj?: ioBroker.ChannelObject | null): Promise<void> {
        const devices: ioBroker.Object[] = [];
        const bridges: ioBroker.Object[] = [];

        const objects: ioBroker.ChannelObject[] = [];
        if (obj) {
            objects.push(obj);
        } else {
            const devicesObjects = await this.getObjectViewAsync('system', 'channel', {
                startkey: `${this.namespace}.devices.`,
                endkey: `${this.namespace}.devices.\u9999`,
            });
            devicesObjects.rows.forEach(row => objects.push(row.value));
            const bridgesObjects = await this.getObjectViewAsync('system', 'channel', {
                startkey: `${this.namespace}.bridges.`,
                endkey: `${this.namespace}.bridges.\u9999`,
            });
            bridgesObjects.rows.forEach(row => objects.push(row.value));
        }

        for (const object of objects) {
            // No valid object or a sub-channel
            if (!object || !object.native || object._id.split('.').length !== 4) {
                continue;
            }

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

        // When we just handle one object we do not need to sync with running devices and bridges
        if (!obj) {
            // Objects existing, not deleted, so disable not enabled bridges or devices
            for (const bridgeId of this.#bridges.keys()) {
                if (!bridges.find(obj => obj._id === bridgeId)) {
                    this.log.info(`Bridge "${bridgeId}" is not enabled anymore, so stop it.`);
                    await this.stopBridgeOrDevice('bridge', bridgeId);
                }
            }
            for (const deviceId of this.#devices.keys()) {
                if (!devices.find(obj => obj._id === deviceId)) {
                    this.log.info(`Device "${deviceId}" is not enabled anymore, so stop it.`);
                    await this.stopBridgeOrDevice('device', deviceId);
                }
            }
        } else {
            // We just handle one object, so we do not need to check for disabled objects
            if (obj._id.startsWith(`${this.namespace}.devices.`)) {
                const existingDevice = this.#devices.get(obj._id);
                if (existingDevice) {
                    if (obj.native.enabled === false) {
                        this.log.info(`Device "${obj._id}" is not enabled anymore, so stop it.`);
                        await this.stopBridgeOrDevice('device', obj._id);
                    }
                }
            } else if (obj._id.startsWith(`${this.namespace}.bridges.`)) {
                const existingBridge = this.#bridges.get(obj._id);
                if (existingBridge) {
                    if (obj.native.enabled === false) {
                        this.log.info(`Bridge "${obj._id}" is not enabled anymore, so stop it.`);
                        await this.stopBridgeOrDevice('bridge', obj._id);
                    }
                }
            }
        }

        this.log.debug(`Process ${bridges.length} bridges ...`);

        // Objects exist and enabled: Sync bridges
        for (const bridge of bridges) {
            const existingBridge = this.#bridges.get(bridge._id);
            if (existingBridge === undefined) {
                // if one bridge already exists, check the license
                const matterBridge = await this.createMatterBridge(bridge.native as BridgeDescription);
                if (matterBridge) {
                    if (Object.keys(this.#bridges).length) {
                        // check license
                        if (!(await this.checkLicense())) {
                            this.log.error(
                                `You cannot use more than one bridge without ioBroker.pro subscription. Bridge "${bridge._id}" will be ignored.}`,
                            );
                            await matterBridge.stop();
                            break;
                        }
                    }

                    this.#bridges.set(bridge._id, matterBridge);
                    if (obj !== undefined) {
                        await matterBridge.start();
                    }
                }
            } else {
                const config = await this.prepareMatterBridgeConfiguration(
                    bridge.native as BridgeDescription,
                    existingBridge.port,
                );
                if (config) {
                    this.log.info(`Apply configuration update for bridge "${bridge._id}".`);
                    await existingBridge.applyConfiguration(config);
                } else {
                    this.log.info(
                        `Configuration for bridge "${bridge._id}" is no longer valid or bridge disabled. Stopping it now.`,
                    );
                    await existingBridge.stop();
                    this.#bridges.delete(bridge._id);
                }
            }
        }

        this.log.debug(`Process ${devices.length} devices ...`);
        // Objects exist and enabled: Sync devices
        for (const device of devices) {
            const deviceName =
                typeof device.common.name === 'object'
                    ? device.common.name[this.sysLanguage]
                        ? (device.common.name[this.sysLanguage] as string)
                        : device.common.name.en
                    : device.common.name;
            const existingDevice = this.#devices.get(device._id);
            if (existingDevice === undefined) {
                const matterDevice = await this.createMatterDevice(deviceName, device.native as DeviceDescription);
                if (matterDevice) {
                    if (Object.keys(this.#devices).length >= 2) {
                        if (!(await this.checkLicense())) {
                            this.log.error(
                                'You cannot use more than 2 devices without ioBroker.pro subscription. Only first 2 devices will be created.}',
                            );
                            await matterDevice.stop();
                            break;
                        }
                    }
                    this.#devices.set(device._id, matterDevice);
                    if (obj !== undefined) {
                        await matterDevice.start();
                    }
                }
            } else {
                const config = await this.prepareMatterDeviceConfiguration(
                    deviceName,
                    device.native as DeviceDescription,
                    existingDevice.port,
                );
                if (config) {
                    this.log.info(`Apply configuration update for device "${device._id}".`);
                    await existingDevice.applyConfiguration(config);
                } else {
                    this.log.info(
                        `Configuration for device "${device._id}" is no longer valid or bridge disabled. Stopping it now.`,
                    );
                    await existingDevice.stop();
                    this.#devices.delete(device._id);
                }
            }
        }

        if (!obj) {
            this.log.debug('Sync controller');
            // Sync controller
            const controllerObj = await this.getObjectAsync('controller');
            const controllerConfig = (controllerObj?.native ?? { enabled: false }) as MatterControllerConfig;
            await this.applyControllerConfiguration(controllerConfig, false);
        }

        // TODO Anything to do for controller sub object changes?
        this.log.debug('Sync done');
    }

    async syncControllerNode(nodeId: string, obj: ioBroker.FolderObject): Promise<void> {
        if (!this.#controller) {
            return;
        } // not active
        return this.#controller.applyPairedNodeConfiguration(nodeId, obj.native as PairedNodeConfig);
    }

    async applyControllerConfiguration(config: MatterControllerConfig, handleStart = true): Promise<MessageResponse> {
        if (config.enabled) {
            if (this.#controller) {
                return this.#controller.applyConfiguration(config);
            }

            this.#controller = await this.createMatterController(config);

            if (handleStart) {
                await this.#controller.start();
            }
        } else if (this.#controller) {
            // Controller should be disabled but is not
            await this.#controller.stop();
            this.#controller = undefined;
        }

        return { result: true };
    }

    async stopBridgeOrDevice(type: 'bridge' | 'device', id: string): Promise<void> {
        const nodes = type === 'bridge' ? this.#bridges : this.#devices;
        const node = nodes.get(id);
        if (node) {
            await node.stop();
            nodes.delete(id);
        }
    }

    async deleteBridgeOrDevice(type: 'bridge' | 'device', id: string, uuid: string): Promise<void> {
        await this.stopBridgeOrDevice(type, id);
        const storage = new IoBrokerObjectStorage(this, uuid);
        await storage.clearAll();
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new MatterAdapter(options);
} else {
    // otherwise start the instance directly
    (() => new MatterAdapter())();
}
