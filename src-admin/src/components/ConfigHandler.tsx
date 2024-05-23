import { v4 as uuidv4 } from 'uuid';
import { AdminConnection } from '@iobroker/adapter-react-v5';
import {
    BridgeDescription, CommissioningInfo,
    DeviceDescription, MatterConfig,
} from '../types';
import { I18n } from '@iobroker/adapter-react-v5';

class ConfigHandler {
    private readonly instance: number;

    private config: MatterConfig;

    private socket: AdminConnection | null;

    private onChanged: ((config: MatterConfig) => void) | null;

    private readonly onCommissioningChanged: (commissioning: CommissioningInfo) => void;

    private commissioning: CommissioningInfo;

    private changed: boolean = false;

    private readonly lang = I18n.getLanguage();

    constructor(
        instance: number,
        socket: AdminConnection,
        onChanged: ((config: MatterConfig) => void),
        onCommissioningChanged: (commissioning: CommissioningInfo) => void,
    ) {
        this.instance = instance;
        this.socket = socket;
        this.onChanged = onChanged;
        this.onCommissioningChanged = onCommissioningChanged;

        this.commissioning = {
            bridges: {},
            devices: {},
        };

        this.config = {
            controller: {},
            devices: [],
            bridges: [],
        };

        this.loadConfig()
            .catch(e => console.error(e));
    }

    getText(word: ioBroker.StringOrTranslated): string {
        if (word && typeof word === 'object') {
            return word[this.lang] || word.en;
        }

        return word as string;
    }

    destroy() {
        this.onChanged = null;
        if (this.socket?.isConnected()) {
            this.socket.unsubscribeObject(`matter.${this.instance}.bridges.*`, this.onObjectChange);
            this.socket.unsubscribeObject(`matter.${this.instance}.devices.*`, this.onObjectChange);
            this.socket.unsubscribeObject(`matter.${this.instance}.controller`, this.onObjectChange);
            this.socket.unsubscribeState(`matter.${this.instance}.bridges.*`, this.onStateChange);
            this.socket.unsubscribeState(`matter.${this.instance}.devices.*`, this.onStateChange);
        }
        this.socket = null;
    }

    onStateChange = (id: string, state: ioBroker.State | null | undefined) => {
        if (id.endsWith('.commissioning')) {
            const parts = id.split('.');
            let changed = false;
            if (parts[2] === 'bridges') {
                if (this.commissioning.bridges[parts[3]] !== !!state?.val) {
                    this.commissioning.bridges[parts[3]] = !!state?.val;
                    changed = true;
                }
            } else if (parts[2] === 'devices') {
                if (this.commissioning.devices[parts[3]] !== !!state?.val) {
                    this.commissioning.devices[parts[3]] = !!state?.val;
                    changed = true;
                }
            }
            changed && this.onCommissioningChanged(this.commissioning);
        }
    };

    onObjectChange = (id: string, obj: ioBroker.Object | null | undefined) => {
        if (!this.onChanged) {
            return;
        }
        if (id.startsWith(`matter.${this.instance}.devices.`)) {
            if (id.split('.').length === 4) {
                let changed = false;
                const uuid = id.split('.').pop();
                const device = this.config.devices.find(dev => dev.uuid === uuid);
                if (device) {
                    if (!obj) {
                        console.log(`Device ${uuid} deleted`);
                        changed = true;
                        this.config.devices.splice(this.config.devices.indexOf(device), 1);
                    } else {
                        // detect changes
                        if (device.enabled !== obj.native.enabled) {
                            changed = true;
                            device.enabled = obj.native.enabled;
                        }
                        // if (device.noComposed !== obj.native.noComposed) {
                        //     changed = true;
                        //     device.noComposed = obj.native.noComposed;
                        // }
                        if (device.name !== obj.common.name) {
                            changed = true;
                            device.name = obj.common.name;
                        }
                        if (device.oid !== obj.native.oid) {
                            changed = true;
                            device.oid = obj.native.oid;
                        }
                        if (device.type !== obj.native.type) {
                            changed = true;
                            device.type = obj.native.type;
                        }
                        if (device.productID !== obj.native.productID) {
                            changed = true;
                            device.productID = obj.native.productID;
                        }
                        if (device.vendorID !== obj.native.vendorID) {
                            changed = true;
                            device.vendorID = obj.native.vendorID;
                        }
                    }
                } else if (obj) {
                    console.log(`Detected new device: ${uuid}`);
                    changed = true;
                    this.config.devices.push({
                        uuid,
                        name: obj.common.name,
                        oid: obj.native.oid,
                        type: obj.native.type,
                        productID: obj.native.productID,
                        vendorID: obj.native.vendorID,
                        enabled: obj.native.enabled,
                    });
                }
                if (changed) {
                    ConfigHandler.sortAll(this.config, this.lang);
                    this.onChanged(this.config);
                }
            }
        } else if (id.startsWith(`matter.${this.instance}.bridges.`)) {
            if (id.split('.').length === 4) {
                let changed = false;
                const uuid = id.split('.').pop();
                const bridge = this.config.bridges.find(dev => dev.uuid === uuid);
                if (bridge) {
                    if (!obj) {
                        console.log(`Bridge ${uuid} deleted`);
                        changed = true;
                        this.config.bridges.splice(this.config.bridges.indexOf(bridge), 1);
                    } else {
                        if (bridge.enabled !== obj.native.enabled) {
                            changed = true;
                            bridge.enabled = obj.native.enabled;
                        }
                        if (bridge.name !== obj.common.name) {
                            changed = true;
                            bridge.name = obj.common.name;
                        }
                        if (JSON.stringify(bridge.list) !== JSON.stringify(obj.native.list)) {
                            changed = true;
                            bridge.list = obj.native.list;
                        }
                        if (bridge.productID !== obj.native.productID) {
                            changed = true;
                            bridge.productID = obj.native.productID;
                        }
                        if (bridge.vendorID !== obj.native.vendorID) {
                            changed = true;
                            bridge.vendorID = obj.native.vendorID;
                        }
                    }
                } else if (obj) {
                    console.log(`Detected new bridge: ${uuid}`);
                    changed = true;
                    this.config.bridges.push({
                        uuid,
                        name: obj.common.name,
                        list: obj.native.list,
                        productID: obj.native.productID,
                        vendorID: obj.native.vendorID,
                        enabled: obj.native.enabled,
                    });
                }
                if (changed) {
                    ConfigHandler.sortAll(this.config, this.lang);
                    this.onChanged(this.config);
                }
            }
        } else if (id === `matter.${this.instance}.controller`) {
            if (!obj || this.config.controller.enabled !== obj.native.enabled) {
                this.config.controller.enabled = obj?.native?.enabled;
                this.onChanged(this.config);
            }
        }
    };

    getCommissioning(): CommissioningInfo {
        return this.commissioning;
    }

    async loadConfig() {
        let devicesAndBridges: Record<string, ioBroker.ChannelObject>;
        let controllerObj: ioBroker.FolderObject | null = null;
        if (!this.socket) {
            return;
        }

        try {
            devicesAndBridges = await this.socket.getObjectViewSystem<'channel'>(
                'channel',
                `matter.${this.instance}.`,
                `matter.${this.instance}.\u9999`,
            );
        } catch (e) {
            devicesAndBridges = {};
        }

        try {
            controllerObj = await this.socket.getObject(`matter.${this.instance}.controller`) as ioBroker.FolderObject | null;
        } catch (e) {
            // ignore
        }
        if (!controllerObj) {
            await this.socket.setObject(`matter.${this.instance}.controller`, {
                type: 'folder',
                common: {
                    name: 'Matter controller',
                },
                native: {
                    enabled: false,
                    ble: false,
                    uuid: uuidv4(),
                },
            });
        } else if (!controllerObj.native.uuid) {
            controllerObj.native.uuid = uuidv4();
            await this.socket.setObject(controllerObj._id, controllerObj);
        }

        controllerObj = controllerObj || {} as ioBroker.FolderObject;
        controllerObj.native = controllerObj.native || {};

        const len = `matter.${this.instance}.`.length;
        const devices: DeviceDescription[] = [];
        const bridges: BridgeDescription[] = [];

        // List devices
        Object.keys(devicesAndBridges).forEach(id => {
            if (id.substring(len).startsWith('devices.')) {
                const obj: DeviceDescription = {
                    uuid: id.substring(len + 8),
                    name: this.getText(devicesAndBridges[id].common.name),
                    oid: devicesAndBridges[id].native.oid,
                    type: devicesAndBridges[id].native.type,
                    productID: devicesAndBridges[id].native.productID,
                    vendorID: devicesAndBridges[id].native.vendorID,
                    enabled: devicesAndBridges[id].native.enabled,
                };

                devices.push(obj);
            } else if (id.substring(len).startsWith('bridges.')) {
                const obj: BridgeDescription = {
                    uuid: id.substring(len + 8),
                    name: this.getText(devicesAndBridges[id].common.name),
                    list: devicesAndBridges[id].native.list,
                    productID: devicesAndBridges[id].native.productID,
                    vendorID: devicesAndBridges[id].native.vendorID,
                    enabled: devicesAndBridges[id].native.enabled,
                };
                bridges.push(obj);
            }
        });

        try {
            const commissioning = await this.socket.getStates(`matter.${this.instance}.*`);
            this.commissioning = {
                bridges: {},
                devices: {},
            };
            Object.keys(commissioning).forEach(id => {
                const parts = id.split('.');
                if (parts[2] === 'bridges') {
                    this.commissioning.bridges[parts[3]] = !!commissioning[id]?.val;
                } else if (parts[2] === 'devices') {
                    this.commissioning.devices[parts[3]] = !!commissioning[id]?.val;
                }
            });
        } catch (e) {
            // ignore
        }

        this.config = {
            controller: {
                enabled: !!controllerObj.native.enabled,
            },
            devices,
            bridges,
        };
        ConfigHandler.sortAll(this.config, this.lang);
        this.changed = false;
        globalThis.changed = false;
        window.parent.postMessage('nochange', '*');

        this.socket.subscribeObject(`matter.${this.instance}.bridges.*`, this.onObjectChange);
        this.socket.subscribeObject(`matter.${this.instance}.devices.*`, this.onObjectChange);
        this.socket.subscribeObject(`matter.${this.instance}.controller`, this.onObjectChange);
        this.socket.subscribeState(`matter.${this.instance}.bridges.*`, this.onStateChange);
        this.socket.subscribeState(`matter.${this.instance}.devices.*`, this.onStateChange);
        return JSON.parse(JSON.stringify(this.config));
    }

    static getSortName(name: ioBroker.StringOrTranslated, lang: ioBroker.Languages): string {
        if (!name || typeof name === 'string') {
            return name as string || '';
        } else {
            return name.en || name[lang];
        }
    }

    static sortAll(config: MatterConfig, lang: ioBroker.Languages) {
        config.devices.sort((a, b) => {
            const aName = ConfigHandler.getSortName(a.name, lang);
            const bName = ConfigHandler.getSortName(b.name, lang);

            if (aName === bName) {
                return a.uuid.localeCompare(b.uuid);
            }
            return aName.localeCompare(bName);
        });
        config.bridges.sort((a, b) => {
            const aName = ConfigHandler.getSortName(a.name, lang);
            const bName = ConfigHandler.getSortName(b.name, lang);
            if (aName === bName) {
                return a.uuid.localeCompare(b.uuid);
            }
            return aName.localeCompare(bName);
        });
        config.bridges.forEach(bridge => {
            bridge.list.sort((a, b) => {
                const aName = ConfigHandler.getSortName(a.name, lang);
                const bName = ConfigHandler.getSortName(b.name, lang);
                if (aName === bName) {
                    return a.oid.localeCompare(b.oid);
                }
                return aName.localeCompare(bName);
            });
        });
    }

    isChanged(config: MatterConfig) {
        ConfigHandler.sortAll(config, this.lang);

        let isChanged = false;
        // compare config with this.config
        if (JSON.stringify(config.controller) !== JSON.stringify(this.config.controller)) {
            isChanged = true;
        }
        if (JSON.stringify(config.bridges) !== JSON.stringify(this.config.bridges)) {
            isChanged = true;
        }
        if (JSON.stringify(config.devices) !== JSON.stringify(this.config.devices)) {
            isChanged = true;
        }
        if (this.changed !== isChanged) {
            this.changed = isChanged;
            globalThis.changed = isChanged;
            window.parent.postMessage(isChanged ? 'change' : 'nochange', '*');
        }

        return isChanged;
    }

    async saveConfig(config: MatterConfig) {
        if (!this.socket) {
            return;
        }

        // compare config with this.config
        let controller: ioBroker.FolderObject | null = await this.socket.getObject(`matter.${this.instance}.controller`) as ioBroker.FolderObject;
        if (!controller || JSON.stringify(config.controller) !== JSON.stringify(this.config.controller)) {
            if (!controller) {
                controller = {
                    _id: `matter.${this.instance}.controller`,
                    type: 'folder',
                    common: {
                        name: 'Matter controller',
                    },
                    native: {
                        enabled: false,
                        ble: false,
                        uuid: uuidv4(),
                    },
                };
            }
            controller.native.enabled = config.controller.enabled;
            controller.native.ble = config.controller.ble;
            controller.native.hciId = config.controller.hciId;
            controller.native.threadNetworkName = config.controller.threadNetworkName;
            controller.native.wifiPassword = config.controller.wifiPassword;
            controller.native.threadOperationalDataSet = config.controller.threadOperationalDataSet;
            controller.native.wifiSSID = config.controller.wifiSSID;

            this.config.controller.enabled = config.controller.enabled;
            this.config.controller.ble = config.controller.ble;
            this.config.controller.hciId = config.controller.hciId;
            this.config.controller.threadNetworkName = config.controller.threadNetworkName;
            this.config.controller.wifiPassword = config.controller.wifiPassword;
            this.config.controller.threadOperationalDataSet = config.controller.threadOperationalDataSet;
            this.config.controller.wifiSSID = config.controller.wifiSSID;
            await this.socket.setObject(controller._id, controller);
        }

        // sync devices
        for (let d = 0; d < config.devices.length; d++) {
            const newDev = config.devices[d];
            const oldDev = this.config.devices.find(dev => dev.uuid === newDev.uuid);
            if (!oldDev) {
                const obj: ioBroker.ChannelObject = {
                    _id: `matter.${this.instance}.devices.${newDev.uuid}`,
                    type: 'channel',
                    common: {
                        name: newDev.name,
                    },
                    native: JSON.parse(JSON.stringify(newDev)),
                };
                delete obj.native.name;
                // create a new device
                console.log(`Device ${newDev.uuid} created`);
                this.config.devices.push(newDev);
                await this.socket.setObject(obj._id, obj);
            } else if (JSON.stringify(newDev) !== JSON.stringify(oldDev)) {
                const obj: ioBroker.ChannelObject = await this.socket.getObject(`matter.${this.instance}.devices.${newDev.uuid}`) as ioBroker.ChannelObject;
                obj.common.name = newDev.name;
                obj.native = obj.native || {};
                Object.assign(obj.native, newDev);
                Object.assign(oldDev, newDev);
                delete obj.native.name;
                console.log(`Device ${obj._id} updated`);
                await this.socket.setObject(obj._id, obj);
            }
        }

        for (let d = this.config.devices.length - 1; d >= 0; d--) {
            const oldDev = this.config.devices[d];
            const newDev = config.devices.find(dev => dev.uuid === oldDev.uuid);
            if (!newDev) {
                this.config.devices.splice(d, 1);
                console.log(`Device ${oldDev.uuid} created`);
                await this.socket.delObject(`matter.${this.instance}.devices.${oldDev.uuid}`);
            }
        }

        // sync bridges
        for (let b = 0; b < config.bridges.length; b++) {
            const newBridge = config.bridges[b];
            const oldBridge = this.config.bridges.find(brd => brd.uuid === newBridge.uuid);
            if (!oldBridge) {
                const obj: ioBroker.ChannelObject = {
                    _id: `matter.${this.instance}.bridges.${newBridge.uuid}`,
                    type: 'channel',
                    common: {
                        name: newBridge.name,
                    },
                    native: JSON.parse(JSON.stringify(newBridge)),
                };
                delete obj.native.name;
                this.config.bridges.push(newBridge);
                ConfigHandler.sortAll(this.config, this.lang);
                // create a new bridge
                console.log(`Bridge ${newBridge.uuid} created`);
                await this.socket.setObject(obj._id, obj);
            } else if (JSON.stringify(newBridge) !== JSON.stringify(oldBridge)) {
                const obj: ioBroker.ChannelObject = await this.socket.getObject(`matter.${this.instance}.bridges.${newBridge.uuid}`) as ioBroker.ChannelObject;
                obj.common.name = newBridge.name;
                obj.native = obj.native || {};
                Object.assign(obj.native, newBridge);
                Object.assign(oldBridge, newBridge);
                delete obj.native.name;
                ConfigHandler.sortAll(this.config, this.lang);
                console.log(`Bridge ${obj._id} updated`);
                await this.socket.setObject(obj._id, obj);
            }
        }

        for (let b = this.config.bridges.length - 1; b >= 0; b--) {
            const oldBridge = this.config.bridges[b];
            const newBridge = config.bridges.find(brd => brd.uuid === oldBridge.uuid);
            if (!newBridge) {
                this.config.bridges.splice(b, 1);
                console.log(`Bridge ${oldBridge.uuid} deleted`);
                await this.socket.delObject(`matter.${this.instance}.bridges.${oldBridge.uuid}`);
            }
        }

        ConfigHandler.sortAll(config, this.lang);

        if (this.changed) {
            this.changed = false;
            window.parent.postMessage('nochange', '*');
            globalThis.changed = false;
        }
        this.config = JSON.parse(JSON.stringify(config));
    }
}

export default ConfigHandler;
