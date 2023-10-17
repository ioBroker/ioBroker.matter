import * as utils from '@iobroker/adapter-core';
const { ChannelDetector } = require('iobroker.type-detector');

import { SubscribeManager, DeviceFabric }  from './devices';

export class MatterAdapter extends utils.Adapter {
    private detector: any;
    private deviceObjects: {[key: string]: any} = {};

    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: 'matter',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('objectChange', this.onObjectChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
        // this.on('message', this.onMessage.bind(this));

        this.detector = new ChannelDetector();
    }

    async onReady() {
        SubscribeManager.setAdapter(this as any);
        await this.loadDevices();
        await this.subscribeForeignObjectsAsync(`${this.namespace}.0.*`);
        // await this.subscribeForeignStatesAsync(`${this.namespace}.*`); // not required, as every device subscribes on own states
    }

    onUnload(callback: () => void) {
        try {
            callback();
        } catch (e) {
            callback();
        }
    }

    onObjectChange(id: string, obj: ioBroker.Object | null | undefined) {
        console.log(id, obj);
    }

    onStateChange(id: string, state: ioBroker.State | null | undefined) {
        SubscribeManager.observer(id, state);
    }

    async findDeviceFromId(id: string) {
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

    async getDeviceStates(id: string) {
        const deviceId = await this.findDeviceFromId(id);
        const obj = await this.getForeignObjectAsync(deviceId);
        if (!obj) {
            return null;
        }
        const states = await this.getObjectViewAsync('system', 'state', {startkey: `${deviceId}.`, endkey: `${deviceId}.\u9999`});
        const objects = {[obj._id]: obj};
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
            const id = controls[0].states.find((state: any) => state.id).id;
            if (id) {
                // console.log(`In ${options.id} was detected "${controls[0].type}" with following states:`);
                controls[0].states = controls[0].states.filter((state: any) => state.id);

                return controls[0];
            }
        } else {
            console.log(`Nothing found for ${options.id}`);
        }

        return null;
    }

    async loadDevices() {
        const _devices: string[] = [];
        const objects = await this.getObjectViewAsync(
            'system', 'channel',
            {
                startkey: `${this.namespace}.`,
                endkey: `${this.namespace}.\u9999`,
            },
        );

        objects.rows.forEach(object => {
            if (object.id.startsWith(`${this.namespace}.devices.`)) {
                object.value && _devices.push(object.value.native.oid);
            } else if (object.id.startsWith(`${this.namespace}.bridges.`) && object.value) {
                object.value.native.list.forEach((device: any) => {
                    _devices.push(device.oid);
                });
            }
        })

        for (let d = 0; d < _devices.length; d++) {
            const device = _devices[d];
            if (!Object.keys(this.deviceObjects).includes(device)) {
                console.log (DeviceFabric(await this.getDeviceStates(device), this as any));
                this.deviceObjects[device] = device;
            }
        }

        Object.keys(this.deviceObjects).forEach(device => {
            if (!_devices.includes(device)) {
                delete this.deviceObjects[device];
            }
        });
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new MatterAdapter(options);
} else {
    // otherwise start the instance directly
    (() => new MatterAdapter())();
}