import * as utils from '@iobroker/adapter-core';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ChannelDetector } = require('iobroker.type-detector');
import { DeviceState, ChannelDetectorType, Control } from './iobroker.type-detector';

import { SubscribeManager, DeviceFabric, GenericDevice }  from './lib';
import { DetectedDevice } from './lib/devices/GenericDevice';

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
    list: DeviceDescription[];
}

export class MatterAdapter extends utils.Adapter {
    private detector: ChannelDetectorType;
    private deviceObjects: { [key: string]: GenericDevice } = {};

    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: 'matter',
        });
        this.on('ready', () => this.onReady());
        this.on('stateChange', (id, state) => this.onStateChange(id, state));
        this.on('objectChange', (id, object) => this.onObjectChange(id));
        this.on('unload', callback => this.onUnload(callback));
        // this.on('message', this.onMessage.bind(this));

        this.detector = new ChannelDetector();
    }

    async onReady(): Promise<void> {
        SubscribeManager.setAdapter(this);
        await this.loadDevices();
        await this.subscribeForeignObjectsAsync(`${this.namespace}.0.*`);
        // await this.subscribeForeignStatesAsync(`${this.namespace}.*`); // not required, as every device subscribes on own states
    }

    onUnload(callback: () => void): void {
        try {
            callback();
        } catch (e) {
            callback();
        }
    }

    async onObjectChange(id: string/*, obj: ioBroker.Object | null | undefined*/): Promise<void> {
        if (id.startsWith(`${this.namespace}.`)) {
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

    async loadDevices(): Promise<void> {
        const _devices: string[] = [];
        const objects = await this.getObjectViewAsync(
            'system', 'channel',
            {
                startkey: `${this.namespace}.`,
                endkey: `${this.namespace}.\u9999`,
            },
        );

        objects.rows.forEach(object => {
            if (!object.value) {
                return;
            }
            if (object.id.startsWith(`${this.namespace}.devices.`)) {
                const device: DeviceDescription = object.value.native as DeviceDescription;
                _devices.push(device.oid);
            } else if (object.id.startsWith(`${this.namespace}.bridges.`)) {
                const bridge: BridgeDescription = object.value.native as BridgeDescription;
                bridge.list.forEach((device: DeviceDescription) => _devices.push(device.oid));
            }
        });

        // Create new devices
        for (const d in _devices) {
            const device = _devices[d];
            if (!Object.keys(this.deviceObjects).includes(device)) {
                const detectedDevice = await this.getDeviceStates(device) as DetectedDevice;
                if (detectedDevice) {
                    const deviceObject = await DeviceFabric(detectedDevice, this);
                    if (deviceObject) {
                        this.deviceObjects[device] = deviceObject;
                    }
                }
            }
        }

        // Delete old non-existing devices
        for (const device in this.deviceObjects) {
            if (!_devices.includes(device)) {
                await this.deviceObjects[device].destroy();
                delete this.deviceObjects[device];
            }
        }
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new MatterAdapter(options);
} else {
    // otherwise start the instance directly
    (() => new MatterAdapter())();
}