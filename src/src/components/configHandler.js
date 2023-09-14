import PropTypes from 'prop-types';

class ConfigHandler {
    constructor(instance, socket) {
        this.instance = instance;
        this.config = null;
        this.socket = socket;
        this.loadConfig()
            .catch(e => console.error(e));
    }

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
            controller: controllerObj.native,
            devices,
            bridges,
        };
        ConfigHandler.sortAll(this.config);
        this.changed = false;
        globalThis.changed = false;
        window.parent.postMessage('nochange', '*');

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
            controller.native = config.controller;
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
                await this.socket.setObject(`matter.${this.instance}.devices.${newDev.uuid}`, obj);
            } else if (JSON.stringify(newDev) !== JSON.stringify(oldDev)) {
                const obj = await this.socket.getObject(`matter.${this.instance}.devices.${newDev.uuid}`);
                obj.common.name = newDev.name;
                obj.native = obj.native || {};
                Object.assign(obj.native, newDev);
                delete obj.native.name;
                await this.socket.setObject(obj._id, obj);
            }
        }
        for (let d = 0; d < this.config.devices.length; d++) {
            const oldDev = this.config.devices[d];
            const newDev = config.devices.find(dev => dev.uuid === oldDev.uuid);
            if (!newDev) {
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
                // create a new bridge
                await this.socket.setObject(`matter.${this.instance}.bridges.${newBridge.uuid}`, obj);
            } else if (JSON.stringify(newBridge) !== JSON.stringify(oldBridge)) {
                const obj = await this.socket.getObject(`matter.${this.instance}.devices.${newBridge.uuid}`);
                obj.common.name = newBridge.name;
                obj.native = obj.native || {};
                Object.assign(obj.native, newBridge);
                delete obj.native.name;
                await this.socket.setObject(obj._id, obj);
            }
        }

        for (let b = 0; b < this.config.bridges.length; b++) {
            const oldBridge = this.config.bridges[b];
            const newBridge = config.bridges.find(brd => brd.uuid === oldBridge.uuid);
            if (!newBridge) {
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
