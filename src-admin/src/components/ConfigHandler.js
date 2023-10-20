import PropTypes from 'prop-types';

class ConfigHandler {
    constructor(instance, socket, onChanged) {
        this.instance = instance;
        this.config = null;
        this.socket = socket;
        this.onChanged = onChanged;
        this.loadConfig()
            .catch(e => console.error(e));
    }

    destroy() {
        this.onChanged = null;
        if (this.socket.isConnected()) {
            this.socket.unsubscribeObject(`matter.${this.instance}.bridges.`, this.onObjectChange);
            this.socket.unsubscribeObject(`matter.${this.instance}.devices.`, this.onObjectChange);
            this.socket.unsubscribeObject(`matter.${this.instance}.controller`, this.onObjectChange);
        }
        this.socket = null;
    }

    onObjectChange = (id, obj) => {
        if (id.startsWith(`matter.${this.instance}.devices.`)) {
            if (id.split('.').length === 4) {
                let changed = false;
                const uuid = id.split('.').pop();
                const device = this.config.devices.find(dev => dev.uuid === uuid);
                if (device) {
                    if (device.enabled !== obj.native.enabled) {
                        changed = true;
                        device.enabled = obj.native.enabled;
                    }
                    if (device.noComposed !== obj.native.noComposed) {
                        changed = true;
                        device.noComposed = obj.native.noComposed;
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
                } else {
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
                    ConfigHandler.sortAll(this.config);
                    this.onChanged(this.config);
                }
            }
        } else if (id.startsWith(`matter.${this.instance}.bridges.`)) {
            if (id.split('.').length === 4) {
                let changed = false;
                const uuid = id.split('.').pop();
                const bridge = this.config.bridges.find(dev => dev.uuid === uuid);
                if (bridge) {
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
                } else {
                    console.log(`Detected new bridge: ${uuid}`);
                    changed = true;
                    this.config.bridge.push({
                        uuid,
                        name: obj.common.name,
                        list: obj.native.list,
                        productID: obj.native.productID,
                        vendorID: obj.native.vendorID,
                        enabled: obj.native.enabled,
                    });
                }
                if (changed) {
                    ConfigHandler.sortAll(this.config);
                    this.onChanged(this.config);
                }
            }
        } else if (id === `matter.${this.instance}.controller`) {
            if (this.config.enabled !== obj.native.enabled) {
                this.config.enabled = obj.native.enabled;
                this.onChanged(this.config);
            }
        }
    };

    async loadConfig() {
        let devicesAndBridges;
        let controllerObj;

        try {
            devicesAndBridges = await this.socket.getObjectView(
                `matter.${this.instance}.`,
                `matter.${this.instance}.\u9999`,
                'channel',
            );
        } catch (e) {
            devicesAndBridges = {};
        }

        try {
            controllerObj = await this.socket.getObject(`matter.${this.instance}.controller`);
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
                },
            });
        }

        controllerObj = controllerObj || {};
        controllerObj.native = controllerObj.native || {};

        const len = `matter.${this.instance}.`.length;
        const devices = [];
        const bridges = [];

        // List devices
        Object.keys(devicesAndBridges).forEach(id => {
            if (id.substring(len).startsWith('devices.')) {
                const obj = {
                    uuid: id.substring(len + 8),
                    name: devicesAndBridges[id].common.name,
                    oid: devicesAndBridges[id].native.oid,
                    type: devicesAndBridges[id].native.type,
                    productID: devicesAndBridges[id].native.productID,
                    vendorID: devicesAndBridges[id].native.vendorID,
                    enabled: devicesAndBridges[id].native.enabled,
                };

                devices.push(obj);
            } else if (id.substring(len).startsWith('bridges.')) {
                const obj = {
                    uuid: id.substring(len + 8),
                    name: devicesAndBridges[id].common.name,
                    list: devicesAndBridges[id].native.list,
                    productID: devicesAndBridges[id].native.productID,
                    vendorID: devicesAndBridges[id].native.vendorID,
                    enabled: devicesAndBridges[id].native.enabled,
                };
                bridges.push(obj);
            }
        });

        this.config = {
            controller: {
                enabled: !!controllerObj.native.enabled,
            },
            devices,
            bridges,
        };
        ConfigHandler.sortAll(this.config);
        this.changed = false;
        globalThis.changed = false;
        window.parent.postMessage('nochange', '*');

        this.socket.subscribeObject(`matter.${this.instance}.bridges.*`, this.onObjectChange);
        this.socket.subscribeObject(`matter.${this.instance}.devices.*`, this.onObjectChange);
        this.socket.subscribeObject(`matter.${this.instance}.controller`, this.onObjectChange);

        return JSON.parse(JSON.stringify(this.config));
    }

    static sortAll(config) {
        config.devices.sort((a, b) => {
            if (a.name === b.name) {
                return a.uuid.localeCompare(b.uuid);
            }
            return a.name.localeCompare(b.name);
        });
        config.bridges.sort((a, b) => {
            if (a.name === b.name) {
                return a.uuid.localeCompare(b.uuid);
            }
            return a.name.localeCompare(b.name);
        });
        config.bridges.forEach(bridge => {
            bridge.list.sort((a, b) => {
                if (a.name === b.name) {
                    return a.oid.localeCompare(b.oid);
                }
                return a.name.localeCompare(b.name);
            });
        });
    }

    isChanged(config) {
        ConfigHandler.sortAll(config);

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

    async saveConfig(config) {
        ConfigHandler.sortAll(config);

        // compare config with this.config
        if (JSON.stringify(config.controller) !== JSON.stringify(this.config.controller)) {
            const controller = await this.socket.getObject(`matter.${this.instance}.controller`);
            controller.native.enabled = config.controller.enabled;
            this.config.controller.enabled = config.controller.enabled;
            await this.socket.setObject(controller._id, controller);
        }

        // sync devices
        for (let d = 0; d < config.devices.length; d++) {
            const newDev = config.devices[d];
            const oldDev = this.config.devices.find(dev => dev.uuid === newDev.uuid);
            if (!oldDev) {
                const obj = {
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
                ConfigHandler.sortAll(this.config);
                await this.socket.setObject(`matter.${this.instance}.devices.${newDev.uuid}`, obj);
            } else if (JSON.stringify(newDev) !== JSON.stringify(oldDev)) {
                const obj = await this.socket.getObject(`matter.${this.instance}.devices.${newDev.uuid}`);
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
                const obj = {
                    type: 'channel',
                    common: {
                        name: newBridge.name,
                    },
                    native: JSON.parse(JSON.stringify(newBridge)),
                };
                delete obj.native.name;
                this.config.bridges.push(newBridge);
                ConfigHandler.sortAll(this.config);
                // create a new bridge
                console.log(`Bridge ${obj.uuid} created`);
                await this.socket.setObject(`matter.${this.instance}.bridges.${newBridge.uuid}`, obj);
            } else if (JSON.stringify(newBridge) !== JSON.stringify(oldBridge)) {
                const obj = await this.socket.getObject(`matter.${this.instance}.bridges.${newBridge.uuid}`);
                obj.common.name = newBridge.name;
                obj.native = obj.native || {};
                Object.assign(obj.native, newBridge);
                Object.assign(oldBridge, newBridge);
                delete obj.native.name;
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

        if (this.changed) {
            this.changed = false;
            window.parent.postMessage('nochange', '*');
            globalThis.changed = false;
        }
        this.config = JSON.parse(JSON.stringify(config));
    }
}

ConfigHandler.propTypes = {
    socket: PropTypes.object.isRequired,
    onChanged: PropTypes.func.isRequired,
    instance: PropTypes.number.isRequired,
};

export default ConfigHandler;
