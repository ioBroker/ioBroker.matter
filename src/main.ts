import * as utils from '@iobroker/adapter-core';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ChannelDetector } = require('iobroker.type-detector');
import { DeviceState, ChannelDetectorType, Control } from './iobroker.type-detector';
import { MatterServer } from '@project-chip/matter-node.js';
import { StorageManager } from '@project-chip/matter-node.js/storage';

import { StorageIoBroker } from './matter/StorageIoBroker';
import { SubscribeManager, DeviceFabric, GenericDevice }  from './lib';
import { DetectedDevice } from './lib/devices/GenericDevice';
import BridgedDevice from './matter/BridgedDevicesNode';

interface MatterAdapterConfig extends ioBroker.AdapterConfig {
    interface: string;
}

interface DeviceDescription {
    uuid: string;
    name: string;
    oid: string;
    type: string;
    enabled: boolean;
}

interface BridgeDescription {
    uuid: string;
    enabled: boolean;
    productID: string;
    vendorID: string;
    passcode: string;
    name: string;
    list: DeviceDescription[];
}

export class MatterAdapter extends utils.Adapter {
    private detector: ChannelDetectorType;
    private devices: { [key: string]: GenericDevice } = {};
    private bridges: { [key: string]: BridgedDevice } = {};
    private _guiSubscribes: { clientId: string; ts: number }[] | null= null;
    private matterServer: MatterServer | undefined;
    private storage: StorageIoBroker | undefined;
    private storageManager: StorageManager | null = null;
    private stateTimeout: NodeJS.Timeout | null = null;

    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: 'matter',
            uiClientSubscribe: data => this.onClientSubscribe(data.clientId),
            uiClientUnsubscribe: data => {
                const { clientId, message, reason } = data;
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
        // this.on('message', this.onMessage.bind(this));

        this.detector = new ChannelDetector();
    }

    async onClientSubscribe(clientId: string): Promise<{error?: string, accepted: boolean, heartbeat?: number}> {
        this.log.debug(`Subscribe from ${clientId}`);
        if (!this._guiSubscribes) {
            return { error: `Adapter is still initializing`,accepted: false };
        }
        // start camera with obj.message.data
        if (!this._guiSubscribes.find(s => s.clientId === clientId)) {
            this.log.debug(`Start GUI`);
            // send state of devices
        }

        // inform GUI that camera is started
        const sub = this._guiSubscribes.find(s => s.clientId === clientId);
        if (!sub) {
            this._guiSubscribes.push({ clientId, ts: Date.now() });
            this.stateTimeout && clearTimeout(this.stateTimeout);
            this.stateTimeout = setTimeout(() => {
                this.stateTimeout = null;
                this.requestNodeStates();
            }, 100);
        } else {
            sub.ts = Date.now();
        }

        return { accepted: true, heartbeat: 120000 };
    }

    onClientUnsubscribe(clientId: string) {
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

    sendToGui = async (data: any): Promise<void> => {
        if (!this._guiSubscribes) {
            return;
        }
        if (this.sendToUI) {
            for (let i = 0; i < this._guiSubscribes.length; i++) {
                await this.sendToUI({ clientId: this._guiSubscribes[i].clientId, data });
            }
        }
    }

    async createMatterServer() {
        const config: MatterAdapterConfig = this.config as MatterAdapterConfig;

        /**
         * Initialize the storage system.
         *
         * The storage manager is then also used by the Matter server, so this code block in general is required,
         * but you can choose a different storage backend as long as it implements the required API.
         */
        this.storage = new StorageIoBroker(this, 'matter.0');
        this.storageManager = new StorageManager(this.storage);
        await this.storageManager.initialize();

        if (!config.interface) {
            this.matterServer = new MatterServer(this.storageManager);
        } else {
            this.matterServer = new MatterServer(this.storageManager, { mdnsAnnounceInterface: config.interface });
        }
    }

    async onReady(): Promise<void> {
        this._guiSubscribes = [];
        SubscribeManager.setAdapter(this);
        await this.createMatterServer();

        await this.loadDevices();
        await this.subscribeForeignObjectsAsync(`${this.namespace}.0.bridges.*`);
        await this.subscribeForeignObjectsAsync(`${this.namespace}.0.devices.*`);
        await this.subscribeForeignObjectsAsync(`${this.namespace}.0.controller`);

        /**
         * Start the Matter Server
         *
         * After everything was plugged together we can start the server.
         * When a not delayed announcement is set for the CommissioningServer node,
         * then this command also starts the announcement of the device into the network.
         */
        await this.matterServer?.start();
    }

    async requestNodeStates(): Promise<void> {
        for (let uuid in this.bridges) {
            const state = await this.bridges[uuid].getState();
            this.log.debug(`State of ${uuid} is ${state}`);
        }
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

    async getDeviceStates(id: string): Promise<Control | null> {
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
            const mainState = controls[0].states.find((state: DeviceState) => state.id);
            if (mainState) {
                const id = mainState.id;
                if (id) {
                    // console.log(`In ${options.id} was detected "${controls[0].type}" with following states:`);
                    controls[0].states = controls[0].states.filter((state: DeviceState) => state.id);

                    return controls[0];
                }
            }
        } else {
            console.log(`Nothing found for ${options.id}`);
        }

        return null;
    }

    async createBridge(uuid: string, options: BridgeDescription): Promise<BridgedDevice> {
        if (this.matterServer) {
            const devices = [];
            for (let l = 0; l < options.list.length; l++) {
                const device = options.list[l];
                if (device.enabled === false) {
                    continue;
                }
                const detectedDevice = await this.getDeviceStates(device.oid) as DetectedDevice;
                if (detectedDevice) {
                    const deviceObject = await DeviceFabric(detectedDevice, this);
                    if (deviceObject) {
                        devices.push(deviceObject);
                    }
                }
            }

            const bridge = new BridgedDevice({
                parameters: {
                    uuid: options.uuid,
                    passcode: parseInt(options.passcode as string, 10) || 20202021,
                    discriminator: 3840,
                    vendorid: parseInt(options.vendorID) || 0xfff1,
                    productid: parseInt(options.productID) || 0x8000,
                    devicename: options.name,
                    productname: `Product ${options.name}`,
                },
                adapter: this,
                devices,
                matterServer: this.matterServer,
                sendToGui: this.sendToGui,
            });

            await bridge.init(); // add bridge to server

            return bridge;
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
                object.native.list.find((item: DeviceDescription) => item.enabled !== false)
            ) {
                _bridges.push(object);
            }
        }

        // Create new bridges
        for (const b in _bridges) {
            const bridge = _bridges[b];
            if (!this.bridges[bridge._id]) {
                this.bridges[bridge._id] = await this.createBridge(
                    bridge._id,
                    bridge.native as BridgeDescription,
                );
            }
        }

        // Delete old non-existing bridges
        for (const bridgeId in this.bridges) {
            if (!_bridges.find(obj => obj._id === bridgeId)) {
                await this.bridges[bridgeId].stop();
                delete this.bridges[bridgeId];
            }
        }

        // Create new devices
        for (const d in _devices) {
            const device = _devices[d];
            if (!this.devices[device._id]) {
                const detectedDevice = await this.getDeviceStates(device.native.oid) as DetectedDevice;
                if (detectedDevice) {
                    const deviceObject = await DeviceFabric(detectedDevice, this);
                    if (deviceObject) {
                        this.devices[device._id] = deviceObject;
                    }
                }
            }
        }

        // Delete old non-existing devices
        for (const device in this.devices) {
            if (!_devices.find(obj => obj._id === device)) {
                await this.devices[device].destroy();
                delete this.devices[device];
            }
        }

        // for tests purposes, add the handlers
        Object.keys(this.devices).forEach(device => {
            this.devices[device].clearChangeHandlers();
            this.devices[device].onChange((event) => {
                // @ts-ignore
                this.log.info(`Detected changes in "${event.property}" with value "${event.value}" in "${event.device.getDeviceType()}"`);
            });
        });
    }
}

if (require.main !== module) {
    // Export the7 constructor in compact mode
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new MatterAdapter(options);
} else {
    // otherwise start the instance directly
    (() => new MatterAdapter())();
}