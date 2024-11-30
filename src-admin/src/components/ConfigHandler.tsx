import { type AdminConnection, I18n } from '@iobroker/adapter-react-v5';
import { v4 as uuidv4 } from 'uuid';

import type { BridgeDescription, CommissioningInfo, DeviceDescription, MatterConfig } from '../types';
import { clone } from '../Utils';

class ConfigHandler {
    private readonly instance: number;

    private config: MatterConfig;

    private socket: AdminConnection | null;

    private onChanged: ((config: MatterConfig) => void) | null;

    private readonly onCommissioningChanged: (commissioning: CommissioningInfo) => void;

    private commissioning: CommissioningInfo;

    private readonly lang = I18n.getLanguage();

    constructor(
        instance: number,
        socket: AdminConnection,
        onChanged: (config: MatterConfig) => void,
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

        this.loadConfig().catch(e => console.error(e));
    }

    getText(word: ioBroker.StringOrTranslated): string {
        if (word && typeof word === 'object') {
            return word[this.lang] || word.en;
        }

        return word;
    }

    destroy(): void {
        this.onChanged = null;
        if (this.socket?.isConnected()) {
            void this.socket.unsubscribeObject(`matter.${this.instance}.bridges.*`, this.onObjectChange);
            void this.socket.unsubscribeObject(`matter.${this.instance}.devices.*`, this.onObjectChange);
            void this.socket.unsubscribeObject(`matter.${this.instance}.controller`, this.onObjectChange);
            this.socket.unsubscribeState(`matter.${this.instance}.bridges.*`, this.onStateChange);
            this.socket.unsubscribeState(`matter.${this.instance}.devices.*`, this.onStateChange);
        }
        this.socket = null;
    }

    onStateChange = (id: string, state: ioBroker.State | null | undefined): void => {
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

    onObjectChange = (id: string, obj: ioBroker.Object | null | undefined): void => {
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
                } else if (obj && uuid) {
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
                        if (typeof obj.common.name === 'string' && bridge.name !== obj.common.name) {
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
                } else if (obj && uuid) {
                    console.log(`Detected new bridge: ${uuid}`);
                    changed = true;

                    if (typeof obj.common.name !== 'string') {
                        throw new Error(
                            `Expected bridge name to be a string but got "${JSON.stringify(obj.common.name)}"`,
                        );
                    }

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
            if (!obj || JSON.stringify(this.config.controller) !== JSON.stringify(obj.native)) {
                this.config.controller = (obj as ioBroker.FolderObject).native;
                this.onChanged(this.config);
            }
        }
    };

    getCommissioning(): CommissioningInfo {
        return this.commissioning;
    }

    /**
     * Get the saved config
     */
    getSavedConfig(): MatterConfig {
        return this.config;
    }

    async loadConfig(): Promise<MatterConfig> {
        let devicesAndBridges: Record<string, ioBroker.ChannelObject>;
        let controllerObj: ioBroker.FolderObject | null = null;
        if (!this.socket) {
            throw new Error('Could not load matter config because socket not connected');
        }

        try {
            devicesAndBridges = await this.socket.getObjectViewSystem<'channel'>(
                'channel',
                `matter.${this.instance}.`,
                `matter.${this.instance}.\u9999`,
            );
        } catch {
            devicesAndBridges = {};
        }

        try {
            controllerObj = (await this.socket.getObject(
                `matter.${this.instance}.controller`,
            )) as ioBroker.FolderObject | null;
        } catch {
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

        controllerObj = controllerObj || ({} as ioBroker.FolderObject);
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
        } catch {
            // ignore
        }

        this.config = {
            controller: controllerObj.native,
            devices,
            bridges,
        };
        ConfigHandler.sortAll(this.config, this.lang);
        window.parent.postMessage('nochange', '*');

        void this.socket.subscribeObject(`matter.${this.instance}.bridges.*`, this.onObjectChange);
        void this.socket.subscribeObject(`matter.${this.instance}.devices.*`, this.onObjectChange);
        void this.socket.subscribeObject(`matter.${this.instance}.controller`, this.onObjectChange);
        void this.socket.subscribeState(`matter.${this.instance}.bridges.*`, this.onStateChange);
        void this.socket.subscribeState(`matter.${this.instance}.devices.*`, this.onStateChange);

        return clone(this.config);
    }

    static getSortName(name: ioBroker.StringOrTranslated, lang: ioBroker.Languages): string {
        if (!name || typeof name === 'string') {
            return name || '';
        }
        return name[lang] || name.en;
    }

    static sortAll(config: MatterConfig, lang: ioBroker.Languages): void {
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

    /**
     * Save the devices config to the objects
     *
     * @param config the new MatterConfig
     */
    async saveDevicesConfig(config: MatterConfig): Promise<void> {
        if (!this.socket) {
            return;
        }

        // sync devices
        for (const newDev of config.devices) {
            const oldDev = this.config.devices.find(dev => dev.uuid === newDev.uuid);
            if (!oldDev) {
                const obj: ioBroker.ChannelObject = {
                    _id: `matter.${this.instance}.devices.${newDev.uuid}`,
                    type: 'channel',
                    common: {
                        name: newDev.name,
                    },
                    native: clone(newDev),
                };
                delete obj.native.name;
                // create a new device
                console.log(`Device ${newDev.uuid} created`);
                this.config.devices.push(newDev);
                await this.socket.setObject(obj._id, obj);
            } else if (JSON.stringify(newDev) !== JSON.stringify(oldDev)) {
                const obj: ioBroker.ChannelObject = (await this.socket.getObject(
                    `matter.${this.instance}.devices.${newDev.uuid}`,
                )) as ioBroker.ChannelObject;
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
                const obj: ioBroker.ChannelObject = (await this.socket.getObject(
                    `matter.${this.instance}.devices.${oldDev.uuid}`,
                )) as ioBroker.ChannelObject;
                obj.native.deleted = true;
                console.log(`Device ${obj._id} deleted`);
                await this.socket.setObject(obj._id, obj);
            }
        }

        ConfigHandler.sortAll(config, this.lang);
    }

    /**
     * Save the bridges config to the objects
     *
     * @param config the new MatterConfig
     */
    async saveBridgesConfig(config: MatterConfig): Promise<void> {
        if (!this.socket) {
            return;
        }

        // sync bridges
        for (const newBridge of config.bridges) {
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
                const obj: ioBroker.ChannelObject = (await this.socket.getObject(
                    `matter.${this.instance}.bridges.${newBridge.uuid}`,
                )) as ioBroker.ChannelObject;
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
    }

    /**
     * Saves the controller config to the controller object
     *
     * @param config the new MatterConfig
     */
    async saveControllerConfig(config: MatterConfig): Promise<void> {
        if (!this.socket) {
            return;
        }

        // compare config with this.config
        let controller: ioBroker.FolderObject | null = (await this.socket.getObject(
            `matter.${this.instance}.controller`,
        )) as ioBroker.FolderObject;

        if (controller && JSON.stringify(config.controller) === JSON.stringify(controller)) {
            return;
        }

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
        this.config.controller = clone(config.controller);

        ConfigHandler.sortAll(config, this.lang);
    }

    async saveConfig(config: MatterConfig): Promise<void> {
        if (!this.socket) {
            return;
        }

        await this.saveControllerConfig(config);
        await this.saveBridgesConfig(config);
        await this.saveDevicesConfig(config);

        ConfigHandler.sortAll(config, this.lang);

        this.config = clone(config);
    }
}

export default ConfigHandler;
