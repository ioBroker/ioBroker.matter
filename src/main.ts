import axios from 'axios';
import jwt from 'jsonwebtoken';
import fs from 'node:fs/promises';
import { Environment, LogLevel, LogFormat, Logger, StorageService, Semaphore } from '@matter/main';
import { MdnsService } from '@matter/main/protocol';
import { inspect } from 'util';

import { type AdapterOptions, Adapter, getAbsoluteInstanceDataDir, I18n } from '@iobroker/adapter-core';
import ChannelDetector, {
    type DetectorState,
    Types,
    type DetectOptions,
    type PatternControl,
} from '@iobroker/type-detector';
import type { JsonFormSchema, BackEndCommandJsonFormOptions } from '@iobroker/dm-utils';

import type { MatterControllerConfig } from '../src-admin/src/types';
import type {
    BridgeDescription,
    BridgeDeviceDescription,
    DeviceDescription,
    MatterAdapterConfig,
} from './ioBrokerStorageTypes';
import { DeviceFactory, type GenericDevice, SubscribeManager } from './lib';
import MatterAdapterDeviceManagement from './lib/DeviceManagement';
import type { DetectedDevice, DeviceOptions } from './lib/devices/GenericDevice';
import type { NodeStateResponse } from './matter/BaseServerNode';
import BridgedDevice, { type BridgeCreateOptions } from './matter/BridgedDevicesNode';
import MatterController from './matter/ControllerNode';
import MatterDevice, { type DeviceCreateOptions } from './matter/DeviceNode';
import type { PairedNodeConfig } from './matter/GeneralMatterNode';
import type { MessageResponse } from './matter/GeneralNode';
import { IoBrokerObjectStorage } from './matter/IoBrokerObjectStorage';
import { type StructuredJsonFormData, convertDataToJsonConfig } from './lib/JsonConfigUtils';

const IOBROKER_USER_API = 'https://iobroker.pro:3001';

// If the device was created by user and user defined the type of device => use this OID as given name
const DEVICE_DEFAULT_NAME: Partial<Record<Types, string>> = {
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
    [Types.illuminance]: 'ACTUAL',
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

export class MatterAdapter extends Adapter {
    readonly #devices = new Map<string, { device?: MatterDevice; error?: string }>();
    readonly #bridges = new Map<string, { bridge?: BridgedDevice; error?: string }>();
    #controller?: MatterController;
    #sendControllerUpdateTimeout?: NodeJS.Timeout;
    #_guiSubscribes: { clientId: string; ts: number }[] | null = null;
    readonly #matterEnvironment: Environment;
    #stateTimeout?: NodeJS.Timeout;
    #license: { [key: string]: boolean | undefined } = {};
    sysLanguage: ioBroker.Languages = 'en';
    readonly #deviceManagement: MatterAdapterDeviceManagement;
    #nextPortNumber: number = 5541;
    #instanceDataDir?: string;
    t: (word: string, ...args: (string | number | boolean | null)[]) => string;
    getText: (word: string, ...args: (string | number | boolean | null)[]) => ioBroker.Translated;
    #closing = false;
    #version: string = '0.0.0';
    #objectProcessQueue = new Array<{
        id: string;
        func: () => Promise<void>;
        earliest: number;
        inProgress?: boolean;
    }>();
    #objectProcessQueueTimeout?: NodeJS.Timeout;
    #currentObjectProcessPromise?: Promise<void>;
    #controllerActionQueue = new Semaphore();
    #blockGuiUpdates = false;

    public constructor(options: Partial<AdapterOptions> = {}) {
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
        this.on('ready', () => this.#onReady());
        this.on('stateChange', (id, state) => this.#onStateChange(id, state));
        this.on('objectChange', (id, object) => this.#onObjectChange(id, object));
        this.on('unload', callback => this.#onUnload(callback));
        this.on('message', this.#onMessage.bind(this));
        this.#deviceManagement = new MatterAdapterDeviceManagement(this);
        this.#matterEnvironment = Environment.default;

        this.t = (word: string, ..._args: (string | number | boolean | null)[]): string => word;
        this.getText = (_word: string, ..._args: (string | number | boolean | null)[]): ioBroker.Translated =>
            ({}) as ioBroker.Translated;
    }

    /** Get string from StringOrTranslated */
    public getString(text: ioBroker.StringOrTranslated): string {
        if (typeof text === 'object') {
            return text[this.sysLanguage] || text.en;
        }
        return text.toString();
    }

    get controllerNode(): MatterController | undefined {
        return this.#controller;
    }

    get controllerUpdateQueue(): Semaphore {
        return this.#controllerActionQueue;
    }

    get versions(): { versionStr: string; versionNum: number } {
        const versionParts = this.#version.split('.');
        // Create a numeric version number from the version string, multiply parts from end to start with 100^index
        const numVersion = versionParts.reduce((acc, part, index) => acc + parseInt(part) * Math.pow(100, index), 0);

        return {
            versionStr: this.#version,
            versionNum: numVersion,
        };
    }

    get matterEnvironment(): Environment {
        return this.#matterEnvironment;
    }

    async shutDownMatterNodes(): Promise<void> {
        for (const { device } of this.#devices.values()) {
            try {
                await device?.destroy();
            } catch (error) {
                this.log.warn(`Error while destroying device ${device?.uuid}: ${error.stack}`);
            }
        }
        this.#devices.clear();
        for (const { bridge } of this.#bridges.values()) {
            try {
                await bridge?.destroy();
            } catch (error) {
                this.log.warn(`Error while destroying bridge ${bridge?.uuid}: ${error.stack}`);
            }
        }
        this.#bridges.clear();
        if (this.#controllerActionQueue.count > 0) {
            this.#controllerActionQueue.clear();
        }
        try {
            await this.#controller?.stop();
        } catch (error) {
            this.log.warn(`Error while stopping controller: ${error.stack}`);
        }
        this.#controller = undefined;
    }

    async startUpMatterNodes(): Promise<void> {
        for (const { bridge } of this.#bridges.values()) {
            await bridge?.start();
        }

        for (const { device } of this.#devices.values()) {
            await device?.start();
        }

        await this.#controller?.start();
    }

    async onTotalReset(): Promise<void> {
        this.log.warn('Resetting complete matter state as requested by UI');
        await this.shutDownMatterNodes();
        // clear all matter storage data of the device nodes
        await this.delObjectAsync('storage', { recursive: true });
        // clear all nodes in the controller
        await this.delObjectAsync('controller', { recursive: true });

        // restart adapter
        this.restart();
    }

    async handleControllerCommand(obj: ioBroker.Message): Promise<void> {
        const slot = await this.#controllerActionQueue.obtainSlot();
        try {
            if (this.#controller) {
                try {
                    const result = await this.#controller?.handleCommand(obj);
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
        } finally {
            slot.close();
        }
    }

    async handleDeviceCommand(obj: ioBroker.Message): Promise<void> {
        for (const [oid, { bridge, error }] of this.#bridges.entries()) {
            const uuid = oid.split('.').pop() || '';
            if (uuid === obj.message.uuid) {
                if (bridge) {
                    try {
                        const result = await bridge.handleCommand(obj);
                        if (result !== undefined && obj.callback) {
                            this.sendTo(obj.from, obj.command, result, obj.callback);
                        }
                    } catch (error) {
                        this.log.warn(
                            `Error while handling command "${obj.command}" for device ${bridge.uuid}: ${error.stack}`,
                        );
                        if (obj.callback) {
                            this.sendTo(obj.from, obj.command, { error: error.message }, obj.callback);
                        }
                    }
                } else if (error) {
                    if (obj.command === 'deviceExtendedInfo') {
                        const result = this.getGenericErrorDetails('bridge', uuid, error);
                        if (result !== undefined && obj.callback) {
                            this.sendTo(obj.from, obj.command, { result }, obj.callback);
                        }
                    }
                }
                return;
            }
        }
        for (const [oid, { device, error }] of this.#devices.entries()) {
            const uuid = oid.split('.').pop() || '';
            if (uuid === obj.message.uuid) {
                if (device) {
                    try {
                        const result = await device.handleCommand(obj);
                        if (result !== undefined && obj.callback) {
                            this.sendTo(obj.from, obj.command, result, obj.callback);
                        }
                    } catch (error) {
                        this.log.warn(
                            `Error while handling command "${obj.command}" for device ${device.uuid}: ${error.stack}`,
                        );
                        if (obj.callback) {
                            this.sendTo(obj.from, obj.command, { error: error.message }, obj.callback);
                        }
                    }
                } else if (error) {
                    if (obj.command === 'deviceExtendedInfo') {
                        const result = this.getGenericErrorDetails('device', uuid, error);
                        if (result !== undefined && obj.callback) {
                            this.sendTo(obj.from, obj.command, { result }, obj.callback);
                        }
                    }
                }

                return;
            }
        }
        if (obj.callback) {
            this.sendTo(
                obj.from,
                obj.command,
                { error: `Device or Bridge ${obj.message.uuid} not found` },
                obj.callback,
            );
        }
    }

    async #onMessage(obj: ioBroker.Message): Promise<void> {
        if (obj.command?.startsWith('dm:')) {
            // Handled by Device Manager class itself, so ignored here
            return;
        }

        this.log.debug(`Handle message ${obj.command} ${obj.command !== 'getLicense' ? JSON.stringify(obj) : ''}`);

        if (obj.command?.startsWith('controller')) {
            await this.handleControllerCommand(obj);
            return;
        }
        if (obj.command?.startsWith('device')) {
            await this.handleDeviceCommand(obj);
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

    onClientSubscribe(clientId: string): { error?: string; accepted: boolean; heartbeat?: number } {
        this.log.debug(`Subscribe from ${clientId}`);
        if (!this.#_guiSubscribes) {
            return { error: `Adapter is still initializing`, accepted: false };
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
            if (this.#stateTimeout) {
                clearTimeout(this.#stateTimeout);
            }
            this.#stateTimeout = setTimeout(async () => {
                this.#stateTimeout = undefined;
                const states = await this.requestNodeStates();
                await this.sendToGui({ command: 'bridgeStates', states });
                this.refreshControllerDevices();
            }, 100);
        } else {
            sub.ts = Date.now();
        }

        return { accepted: true, heartbeat: 120000 };
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
        if (!this.#_guiSubscribes || this.#blockGuiUpdates) {
            return;
        }
        if (this.sendToUI) {
            this.log.debug(`Send to GUI: ${JSON.stringify(data)}`);

            for (let i = 0; i < this.#_guiSubscribes.length; i++) {
                await this.sendToUI({ clientId: this.#_guiSubscribes[i].clientId, data });
            }
        }
    };

    /** This command will be sent to GUI to update the controller devices */
    refreshControllerDevices(): void {
        if (this.#closing) {
            return;
        }
        this.#sendControllerUpdateTimeout =
            this.#sendControllerUpdateTimeout ??
            setTimeout(() => {
                this.#sendControllerUpdateTimeout = undefined;
                this.sendToGui({
                    command: 'updateController',
                }).catch(error => this.log.debug(`Error while sending updateController to GUI: ${error.message}`));
            }, 300);
    }

    async prepareMatterEnvironment(): Promise<void> {
        const config: MatterAdapterConfig = this.config as MatterAdapterConfig;
        Logger.defaultLogLevel = LogLevel.DEBUG;
        Logger.format = LogFormat.PLAIN;
        Logger.log = (level: LogLevel, formattedLog: string) => {
            switch (level) {
                case LogLevel.DEBUG:
                    config.debug ? this.log.debug(formattedLog) : this.log.silly(formattedLog);
                    break;

                case LogLevel.INFO:
                    this.log.debug(formattedLog);
                    break;
                case LogLevel.NOTICE:
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

    async #onReady(): Promise<void> {
        const dataDir = getAbsoluteInstanceDataDir(this);
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

        try {
            this.#version = require('../package.json').version;
        } catch (error) {
            this.log.error(`Can not read version from package.json: ${error}`);
        }

        // init i18n
        await I18n.init(__dirname, this);
        this.t = I18n.translate;
        this.getText = I18n.getTranslatedObject;

        SubscribeManager.setAdapter(this);
        await this.prepareMatterEnvironment();

        const systemConfig: ioBroker.SystemConfigObject = (await this.getForeignObjectAsync(
            'system.config',
        )) as ioBroker.SystemConfigObject;
        this.sysLanguage = systemConfig?.common?.language || 'en';

        this.log.debug('Sync devices');

        await this.syncDevices();

        this.log.debug('Devices synced');

        /**
         * Start the nodes. This also announces them in the network
         */
        await this.startUpMatterNodes();

        this.subscribeObjects('bridges.*');
        this.subscribeObjects('devices.*');
        this.subscribeObjects('controller.*');

        this.log.debug('Initialization done, Objects subscribed');

        // this allows to GUI to read the devices. So make it after all devices are loaded
        this.#_guiSubscribes ||= [];
    }

    async requestNodeStates(options?: NodeStatesOptions): Promise<{ [uuid: string]: NodeStateResponse }> {
        const states: { [uuid: string]: NodeStateResponse } = {};
        if (!options || !Object.keys(options).length || options.bridges) {
            for (const [oid, { bridge, error }] of this.#bridges.entries()) {
                const uuid = oid.split('.').pop() || '';
                if (bridge) {
                    const state = await bridge.getState();
                    this.log.debug(`State of bridge ${oid} is ${JSON.stringify(state)}`);
                    states[uuid] = state;
                } else if (error) {
                    states[uuid] = {
                        error: !!error,
                    };
                }
            }
        }
        if (!options || !Object.keys(options).length || options.devices) {
            for (const [oid, { device, error }] of this.#devices.entries()) {
                const uuid = oid.split('.').pop() || '';
                if (device) {
                    const state = await device.getState();
                    this.log.debug(`State of device ${oid} is ${JSON.stringify(state)}`);
                    states[uuid] = state;
                } else if (error) {
                    states[uuid] = {
                        error: !!error,
                    };
                }
            }
        }

        return states;
    }

    async #onUnload(callback: () => void): Promise<void> {
        this.#closing = true;
        if (this.#stateTimeout) {
            clearTimeout(this.#stateTimeout);
            this.#stateTimeout = undefined;
        }
        if (this.#sendControllerUpdateTimeout) {
            clearTimeout(this.#sendControllerUpdateTimeout);
            this.#sendControllerUpdateTimeout = undefined;
        }
        if (this.#objectProcessQueueTimeout) {
            clearTimeout(this.#objectProcessQueueTimeout);
            this.#controllerActionQueue.clear();
        }
        if (this.#objectProcessQueue.length && this.#objectProcessQueue[0].inProgress) {
            const promise = this.#currentObjectProcessPromise;
            this.#objectProcessQueue.length = 1;
            try {
                await promise;
            } catch {
                // ignore
            }
        }
        this.#objectProcessQueue.length = 0;

        try {
            // inform GUI about stop
            await this.sendToGui({ command: 'stopped' });
        } catch {
            // ignore
        }
        this.#blockGuiUpdates = true;

        if (this.#deviceManagement) {
            await this.#deviceManagement.close();
        }

        try {
            await this.shutDownMatterNodes();
            // close Environment/MDNS?
        } catch {
            // ignore
        }

        try {
            this.#matterEnvironment.close(MdnsService);
        } catch {
            // ignore
        }

        callback();
    }

    async #processObjectChange(id: string): Promise<void> {
        if (this.#closing) {
            return;
        }
        let obj = await this.getObjectAsync(id);
        const objParts = id.split('.').slice(2); // remove namespace and instance
        const objPartsLength = objParts.length;
        this.log.debug(`Process changed object ${id}, type = ${obj?.type}, length=${objPartsLength}`);

        if (
            ((objParts[0] === 'devices' && objPartsLength === 2) ||
                (objParts[0] === 'bridges' && objPartsLength === 2)) &&
            !obj
        ) {
            this.log.debug(`Object ${id} deleted ... trying to also remove it from matter`);
            // We try to restore a minimum object that we can handle the deletion
            obj = {
                _id: id,
                type: 'channel',
                common: {
                    name: id,
                },
                native: {
                    deleted: true,
                    uuid: objParts[1],
                },
            } as ioBroker.Object;
        }
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
            await this.syncControllerNode(nodeId, nodeObj as ioBroker.FolderObject, true);
        }
    }

    #processObjectChangeQueue(): void {
        // inform GUI about whats in progress
        this.sendToGui({
            command: 'processing',
            processing: this.#objectProcessQueue.map(item => ({ id: item.id, inProgress: true })),
        }).catch((error): void => this.log.error(`Cannot send to GUI: ${error}`));

        if (this.#objectProcessQueue.length === 0 || this.#objectProcessQueue.some(e => e.inProgress)) {
            // Already something is in progress, we catch up later
            return;
        }

        if (this.#objectProcessQueueTimeout) {
            clearTimeout(this.#objectProcessQueueTimeout);
        }

        const now = Date.now();
        const diffToFirstEntry = this.#objectProcessQueue[0].earliest - now;

        // When next is in 100ms then we do it directly ... no need to start another timer for that :-)
        // That also prevents issues with too short timers and such
        if (diffToFirstEntry > 100) {
            this.#objectProcessQueueTimeout = setTimeout(() => {
                this.#objectProcessQueueTimeout = undefined;
                this.#processObjectChangeQueue();
            }, diffToFirstEntry);
            return;
        }

        const entry = this.#objectProcessQueue[0];
        entry.inProgress = true;

        this.#currentObjectProcessPromise = entry.func();
        this.#currentObjectProcessPromise
            .catch(error => this.log.error(`Error while processing object change ${entry.id}: ${error}`))
            .finally(() => {
                this.#objectProcessQueue.shift();
                this.#processObjectChangeQueue();
            });
    }

    #onObjectChange(id: string, obj: ioBroker.Object | null | undefined): void {
        const mainObjectId = id.split('.').slice(0, 4).join('.'); // get the device or controller object
        if (this.#objectProcessQueue[0]?.id.startsWith(mainObjectId) && id !== mainObjectId) {
            this.log.debug(
                `Sub object changed ${id}, type = ${obj?.type} - Already in queue via ${mainObjectId}, ignore ...`,
            );
            return;
        }

        if (obj && obj.type !== 'device' && obj.type !== 'channel' && obj.type !== 'folder') {
            this.log.debug(`${obj?.type} Object changed ${id}, type = ${obj?.type} - Ignore ...`);
            return;
        }

        this.log.debug(`Object changed ${id}, type = ${obj?.type} - Register to process delayed ...`);

        this.#objectProcessQueue.push({
            id,
            func: async () => this.#processObjectChange(id),
            earliest: Date.now() + 5000,
        });
        this.#processObjectChangeQueue();
    }

    #onStateChange(id: string, state: ioBroker.State | null | undefined): void {
        SubscribeManager.observer(id, state).catch(e =>
            this.log.error(`Error while observing state ${id}: ${e.stack}`),
        );
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
            // we can not go higher because we found the namespace root, let's assume a "one device adapter"
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

    async getIoBrokerDeviceStates(id: string, preferredType?: string): Promise<DetectedDevice | null> {
        const deviceId = await this.findDeviceFromId(id);
        this.log.debug(`Handle device for ${id}: ${deviceId}, preferred type: ${preferredType}`);
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
                this.log.debug(
                    `    Found state ${state.id}: type=${state.value.common.type}, role=${state.value.common.role}, read=${state.value.common.read}, write=${state.value.common.write}, min=${state.value.common.min}, max=${state.value.common.max}, unit=${state.value.common.unit}`,
                );
            }
        }

        const keys = Object.keys(objects); // For optimization
        const usedIds = new Array<string>(); // Do not allow to use the same ID in more than one device
        const ignoreIndicators = ['UNREACH_STICKY']; // Ignore indicators by name
        const options: DetectOptions = {
            objects,
            id: deviceId, // Channel, device or state, that must be detected
            _keysOptional: keys,
            _usedIdsOptional: usedIds,
            ignoreIndicators,
            excludedTypes: [Types.info],
            allowedTypes: preferredType ? [preferredType as Types] : undefined,
            ignoreCache: true,
            ignoreEnums: true,
        };

        const detector = new ChannelDetector();
        let controls = detector.detect(options);
        if (!controls?.length) {
            delete options.allowedTypes;
            options.detectAllPossibleDevices = true;
            controls = detector.detect(options);
        }
        if (controls?.length) {
            let controlsToCheck = controls.filter((control: PatternControl) =>
                control.states.some(({ id: foundId }) => foundId === id),
            );
            if (controlsToCheck.length) {
                this.log.debug(
                    `Found ${controlsToCheck?.length} device types for ${id} in ${deviceId}: ${JSON.stringify(controlsToCheck)}`,
                );
            } else {
                controlsToCheck = controls;
            }
            let controlsWithType = controlsToCheck;
            if (preferredType) {
                controlsWithType = controlsToCheck.filter((control: PatternControl) => control.type === preferredType);
                if (controlsWithType.length) {
                    this.log.debug(
                        `Found ${controlsWithType?.length} device types for ${id} with preferred type ${preferredType}: ${JSON.stringify(
                            controlsWithType,
                        )}`,
                    );
                } else {
                    controlsWithType = controlsToCheck;
                }
            }
            this.log.debug(
                `Found ${controlsWithType?.length} device types for ${deviceId} : ${JSON.stringify(controlsWithType)}`,
            );
            const mainState = controlsWithType[0].states.find((state: DetectorState) => state.id);
            if (mainState) {
                const id = mainState.id;
                if (id) {
                    if (preferredType && controlsWithType[0].type !== preferredType) {
                        this.log.warn(
                            `Type detection mismatch for state ${id}: ${controlsWithType[0].type} !== ${preferredType}.`,
                        );
                    }
                    // console.log(`In ${options.id} was detected "${controls[0].type}" with following states:`);
                    controlsWithType[0].states = controlsWithType[0].states.filter((state: DetectorState) => state.id);

                    return {
                        ...controlsWithType[0],
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
        login ||= config.login;
        pass ||= config.pass;
        const key = `${login}/////${pass}`;
        // If already checked before, return the result
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
        const subscriptions: {
            json: string;
            id: string;
            email: string;
            product: string;
            type: 'assistant' | 'remote';
            version: string;
            invoice: string;
            uuid: string | null;
            time: string; // ISO 8601 date string
            validTill: string; // ISO 8601 date string
        }[] = response.data;
        const cert = await fs.readFile(`${__dirname}/../data/cloudCert.crt`, 'utf8');
        if (
            subscriptions.find((it: any) => {
                try {
                    const decoded: {
                        email: string;
                        comment: string;
                        type: string;
                        name: string;
                        ltype: string;
                        valid_till: string; // ISO 8601 date string
                        invoice: string;
                        expires: number; // Unix timestamp
                        version: string;
                        id: string;
                        iat: number; // Issued at, Unix timestamp
                    } = jwt.verify(it.json, cert) as {
                        email: string;
                        comment: string;
                        type: string;
                        name: string;
                        ltype: string;
                        valid_till: string; // ISO 8601 date string
                        invoice: string;
                        expires: number; // Unix timestamp
                        version: string;
                        id: string;
                        iat: number; // Issued at, Unix timestamp
                    };
                    if (decoded.name && (decoded.name.startsWith('remote.') || decoded.name.startsWith('assistant.'))) {
                        return new Date(decoded.valid_till) > new Date();
                    }
                } catch (e) {
                    this.log.warn(`Cannot verify license: ${e}`);
                    this.#license[key] = false;
                    return false;
                }
            })
        ) {
            this.#license[key] = true;
            return true;
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

    async determineIoBrokerDevice(oid: string, type: string, auto: boolean): Promise<DetectedDevice | null> {
        if (!auto) {
            // Fix for wrong UI currently that sets auto to false when channel or device is selected
            const obj = await this.getForeignObjectAsync(oid);
            if (obj && (obj.type === 'device' || obj.type === 'channel')) {
                auto = true;
                this.log.debug(`Enable auto detection for ${oid} with type ${type} because object is ${obj.type}`);
            }
        }

        const detectedDevice = await this.getIoBrokerDeviceStates(oid, type);
        if (!detectedDevice) {
            return null;
        }
        if (detectedDevice.type === type && auto) {
            return detectedDevice;
        }
        if (detectedDevice.type !== type) {
            this.log.error(
                `Type detection mismatch for state ${oid}: ${detectedDevice?.type} !== ${type}. Initialize device with just this one state.`,
            );
        }
        this.log.debug(`No auto detection for ${oid} with type ${type} ... fallback to default for SET state only`);
        // ignore all detected states and let only one
        return {
            type: type as Types,
            states: [
                {
                    name: DEVICE_DEFAULT_NAME[type as Types] || 'SET',
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
        deviceName: string,
        options: BridgeDescription,
        assignedPort?: number,
    ): Promise<BridgeCreateOptions | null> {
        if (options.enabled === false) {
            return null; // Not startup
        }
        options.list = options.list ?? [];
        const devices = new Map<string, { device?: GenericDevice; error?: string; options: BridgeDeviceDescription }>();
        let addedDevices = 0;
        for (const deviceOptions of options.list) {
            this.log.debug(
                `Prepare bridged device ${deviceOptions.uuid} "${deviceOptions.name}" (auto=${deviceOptions.auto})`,
            );
            const detectedDevice = await this.determineIoBrokerDevice(
                deviceOptions.oid,
                deviceOptions.type,
                deviceOptions.auto,
            );
            if (detectedDevice === null) {
                this.log.error(
                    `Cannot initialize device ${deviceOptions.uuid} "${deviceOptions.name}" because ${deviceOptions.oid} does not exist! Check configuration.`,
                );
                continue;
            }
            try {
                const deviceObject = await DeviceFactory(detectedDevice, this, deviceOptions as DeviceOptions, false);
                if (addedDevices >= 5) {
                    if (!(await this.checkLicense())) {
                        this.log.error(
                            'You cannot use more than 5 devices without ioBroker.pro subscription. Only first 5 devices will be created.',
                        );
                        await deviceObject.destroy();
                        break;
                    }
                }
                devices.set(deviceOptions.uuid, {
                    device: deviceObject,
                    options: deviceOptions,
                });
                addedDevices++;
            } catch (e) {
                devices.set(deviceOptions.uuid, {
                    error: e.message,
                    options: deviceOptions,
                });
                this.log.error(`Cannot create bridged device for ${deviceOptions.oid}: ${e.message}`);
            }
        }

        if (addedDevices > 0) {
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
                    deviceName: deviceName,
                    productName: `Bridge ${deviceName}`,
                },
                devices,
            };
        }
        return null;
    }

    async createMatterBridge(deviceName: string, options: BridgeDescription): Promise<BridgedDevice | null> {
        const config = await this.prepareMatterBridgeConfiguration(deviceName, options);

        if (config) {
            const bridge = new BridgedDevice(this, config);

            try {
                await bridge.init(); // add bridge to server
            } catch (error) {
                const errorText = inspect(error, { depth: 10 });
                this.log.error(`Error creating bridge ${config.parameters.uuid}: ${errorText}`);
            }
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

        this.log.debug(`Prepare device ${options.uuid} "${options.name}" (auto=${options.auto})`);
        const detectedDevice = await this.determineIoBrokerDevice(options.oid, options.type, options.auto);
        if (detectedDevice === null) {
            this.log.error(
                `Cannot initialize device ${options.uuid} "${options.name}" because ${options.oid} does not exist! Check configuration.`,
            );
            return null;
        }
        try {
            const device = await DeviceFactory(detectedDevice, this, options as DeviceOptions, false);
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
            try {
                await matterDevice.init(); // add bridge to server

                return matterDevice;
            } catch (error) {
                const errorText = inspect(error, { depth: 10 });
                this.log.error(`Error creating device ${config.parameters.uuid}: ${errorText}`);
            }
        }

        return null;
    }

    createMatterController(controllerOptions: MatterControllerConfig, fabricLabel: string): MatterController {
        this.log.info(`Creating controller with Fabric Label: ${fabricLabel}`);
        const matterController = new MatterController({
            adapter: this,
            controllerOptions,
            updateCallback: () => this.refreshControllerDevices(),
            fabricLabel: fabricLabel.substring(0, 32),
        });
        matterController.init(); // add bridge to server

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
            if (!object?.native || object._id.split('.').length !== 4) {
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
            const existingBridge = this.#bridges.get(bridge._id)?.bridge;
            const deviceName =
                typeof bridge.common.name === 'object'
                    ? bridge.common.name[this.sysLanguage]
                        ? (bridge.common.name[this.sysLanguage] as string)
                        : bridge.common.name.en
                    : bridge.common.name;
            if (existingBridge === undefined) {
                // if one bridge already exists, check the license
                const matterBridge = await this.createMatterBridge(deviceName, bridge.native as BridgeDescription);
                if (matterBridge) {
                    if (this.#bridges.size) {
                        // check license
                        if (!(await this.checkLicense())) {
                            this.log.error(
                                `You cannot use more than one bridge without ioBroker.pro subscription. Bridge "${bridge._id}" will be ignored.}`,
                            );
                            await matterBridge.destroy();
                            break;
                        }
                    }

                    this.#bridges.set(bridge._id, { bridge: matterBridge });
                    if (obj !== undefined) {
                        await matterBridge.start();
                    }
                } else {
                    this.log.error(`Cannot create bridge for ${bridge._id}`);
                    const error = 'Cannot create bridge because of an error. Please check the logs.';
                    this.#bridges.set(bridge._id, {
                        error,
                    });
                    await this.sendToGui({
                        command: 'updateStates',
                        states: { [bridge.native.uuid]: { error } },
                    });
                }
            } else {
                const config = await this.prepareMatterBridgeConfiguration(
                    deviceName,
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
                    await existingBridge.destroy();
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
            const existingDevice = this.#devices.get(device._id)?.device;
            if (existingDevice === undefined) {
                const matterDevice = await this.createMatterDevice(deviceName, device.native as DeviceDescription);
                if (matterDevice) {
                    if (this.#devices.size >= 2) {
                        if (!(await this.checkLicense())) {
                            this.log.error(
                                'You cannot use more than 2 devices without ioBroker.pro subscription. Only first 2 devices will be created.}',
                            );
                            await matterDevice.destroy();
                            break;
                        }
                    }
                    this.#devices.set(device._id, { device: matterDevice });
                    if (obj !== undefined) {
                        await matterDevice.start();
                    }
                } else {
                    this.log.error(`Cannot create device for ${device._id}`);
                    const error = 'Cannot create device because of an error. Please check logs.';
                    this.#devices.set(device._id, {
                        error,
                    });
                    await this.sendToGui({
                        command: 'updateStates',
                        states: { [device.native.uuid]: { error } },
                    });
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
                    await existingDevice.destroy();
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

    async syncControllerNode(nodeId: string, obj: ioBroker.FolderObject, forcedUpdate = false): Promise<void> {
        const slot = await this.#controllerActionQueue.obtainSlot();
        try {
            if (!this.#controller) {
                return;
            } // not active
            await this.#controller.applyPairedNodeConfiguration(nodeId, obj.native as PairedNodeConfig, forcedUpdate);
        } finally {
            slot.close();
        }
    }

    async applyControllerConfiguration(config: MatterControllerConfig, handleStart = true): Promise<MessageResponse> {
        // Make sure to not overlap controller config updates
        const slot = await this.#controllerActionQueue.obtainSlot();
        try {
            if (config.enabled) {
                if (this.#controller) {
                    this.#controller.applyConfiguration(config);
                    return { result: true };
                }

                this.#controller = this.createMatterController(
                    config,
                    (this.config as MatterAdapterConfig).controllerFabricLabel || `ioBroker ${this.namespace}`,
                );

                if (handleStart) {
                    await this.#controller.start();
                }
            } else if (this.#controller) {
                // Controller should be disabled but is not
                const controller = this.#controller;
                this.#controller = undefined;
                this.#controllerActionQueue.clear();
                await controller.stop();
            }

            return { result: true };
        } finally {
            slot.close();
        }
    }

    async stopBridgeOrDevice(type: 'bridge' | 'device', id: string): Promise<void> {
        if (type === 'bridge') {
            const bridge = this.#bridges.get(id)?.bridge;
            await bridge?.destroy();
            this.#bridges.delete(id);
        } else {
            const device = this.#devices.get(id)?.device;
            await device?.destroy();
            this.#devices.delete(id);
        }
    }

    async deleteBridgeOrDevice(type: 'bridge' | 'device', id: string, uuid: string): Promise<void> {
        await this.stopBridgeOrDevice(type, id);
        const storage = new IoBrokerObjectStorage(this, uuid);
        await storage.clear();
    }

    getGenericErrorDetails(
        type: 'bridge' | 'device',
        uuid: string,
        error: string,
    ): { schema: JsonFormSchema; options: BackEndCommandJsonFormOptions } {
        const details: StructuredJsonFormData = {
            panel: {
                __header__error: 'Error information',
                __text__info: `${type === 'bridge' ? 'Bridge' : 'Device'} is in error state. Fix the error before enabling it again`,
                __text__error: error,
                uuid: uuid,
            },
        };

        return {
            schema: convertDataToJsonConfig(details),
            options: {
                maxWidth: 'md',
                data: {},
                title: `${type === 'bridge' ? 'Bridge' : 'Device'} Error information`,
                buttons: ['close'],
            },
        };
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<AdapterOptions> | undefined) => new MatterAdapter(options);
} else {
    // otherwise start the instance directly
    (() => new MatterAdapter())();
}
