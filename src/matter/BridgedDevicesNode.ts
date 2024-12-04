import { Endpoint, ServerNode, VendorId } from '@matter/main';
import { BridgedDeviceBasicInformationServer } from '@matter/main/behaviors';
import { AggregatorEndpoint, BridgedNodeEndpoint } from '@matter/main/endpoints';
import { inspect } from 'util';
import type { BridgeDeviceDescription } from '../ioBrokerStorageTypes';
import type { GenericDevice } from '../lib';
import { md5 } from '../lib/utils';
import type { MatterAdapter } from '../main';
import { BaseServerNode } from './BaseServerNode';
import matterDeviceFactory from './to-matter/matterFactory';
import { initializeBridgedUnreachableStateHandler } from './to-matter/SharedStateHandlers';
import type { GenericDeviceToMatter } from './to-matter/GenericDeviceToMatter';

export interface BridgeCreateOptions {
    parameters: BridgeOptions;
    devices: GenericDevice[];
    devicesOptions: BridgeDeviceDescription[];
}

export interface BridgeOptions {
    uuid: string;
    vendorId: number;
    productId: number;
    deviceName: string;
    productName: string;
    port: number;
}

/** A Bridged Devices Server Node. */
class BridgedDevices extends BaseServerNode {
    #parameters: BridgeOptions;
    #devices: GenericDevice[];
    #devicesOptions: BridgeDeviceDescription[];
    #started = false;
    #aggregator?: Endpoint<AggregatorEndpoint>;
    #deviceEndpoints = new Map<string, Endpoint[]>();
    #mappingDevices = new Map<string, GenericDeviceToMatter>();

    constructor(adapter: MatterAdapter, options: BridgeCreateOptions) {
        super(adapter, 'bridges', options.parameters.uuid);
        this.#parameters = options.parameters;
        this.#devices = options.devices;
        this.#devicesOptions = options.devicesOptions;
    }

    get port(): number {
        return this.#parameters.port;
    }

    /** Creates the Matter device/endpoint and adds it to the code. It also handles Composed vs non-composed structuring. */
    async addBridgedIoBrokerDevice(device: GenericDevice, deviceOptions: BridgeDeviceDescription): Promise<void> {
        if (!this.#aggregator) {
            throw new Error(`Aggregator on Bridge ${deviceOptions.uuid} not initialized. Should never happen`);
        }

        this.adapter.log.info(`Adding device ${deviceOptions.uuid} "${deviceOptions.name}" to bridge`);

        if (this.#deviceEndpoints.has(deviceOptions.uuid)) {
            this.adapter.log.warn(
                `Device ${deviceOptions.uuid} already in bridge. Should never happen. Closing them before re-adding`,
            );
            for (const endpoint of this.#deviceEndpoints.get(deviceOptions.uuid) ?? []) {
                await endpoint.close();
            }
        }

        const mappingDevice = await matterDeviceFactory(device, deviceOptions.name, deviceOptions.uuid);
        if (mappingDevice) {
            const name = mappingDevice.name;
            const endpoints = mappingDevice.getMatterEndpoints();
            if (endpoints.length === 1 || deviceOptions.noComposed) {
                let erroredCount = 0;
                // When only one endpoint or non-composed we simply add all endpoints for itself to the bridge
                for (const endpoint of endpoints) {
                    try {
                        if (this.#aggregator.parts.has(endpoint.id)) {
                            this.adapter.log.warn(
                                `Endpoint ${endpoint.id} already in bridge. Should never happen. Closing them before re-adding`,
                            );
                            await this.#aggregator.parts.get(endpoint.id)?.close();
                        }
                    } catch (error) {
                        this.adapter.log.error(`Error closing endpoint ${endpoint.id} in bridge: ${error}`);
                    }

                    const matterName = name.substring(0, 32);
                    endpoint.behaviors.require(BridgedDeviceBasicInformationServer, {
                        nodeLabel: matterName,
                        productName: matterName,
                        productLabel: name.substring(0, 64),
                        uniqueId: md5(endpoint.id),
                        reachable: true,
                    });
                    try {
                        await this.#aggregator.add(endpoint);
                    } catch (error) {
                        // MatterErrors might contain nested information so make sure we see all of this
                        const errorText = inspect(error, { depth: 10 });
                        this.adapter.log.error(`Error adding endpoint ${endpoint.id} to bridge: ${errorText}`);
                        erroredCount++;
                    }
                }
                if (erroredCount === endpoints.length) {
                    await mappingDevice.destroy();
                    throw new Error(`Could not add any endpoint to device`);
                }
                this.#deviceEndpoints.set(deviceOptions.uuid, endpoints);
            } else {
                const id = `${deviceOptions.uuid}-composed`;

                try {
                    if (this.#aggregator.parts.has(id)) {
                        this.adapter.log.warn(
                            `Endpoint ${id} already in bridge. Should never happen. Closing them before re-adding`,
                        );
                        await this.#aggregator.parts.get(id)?.close();
                    }
                } catch (error) {
                    this.adapter.log.error(`Error closing endpoint ${id} in bridge: ${error}`);
                }

                const matterName = name.substring(0, 32);
                const composedEndpoint = new Endpoint(BridgedNodeEndpoint, {
                    id,
                    bridgedDeviceBasicInformation: {
                        nodeLabel: matterName,
                        productName: matterName,
                        productLabel: name.substring(0, 64),
                        uniqueId: md5(id),
                        reachable: true,
                    },
                });
                await this.#aggregator.add(composedEndpoint);
                let erroredCount = 0;
                for (const endpoint of endpoints) {
                    try {
                        await composedEndpoint.add(endpoint);
                    } catch (error) {
                        // MatterErrors might contain nested information so make sure we see all of this
                        const errorText = inspect(error, { depth: 10 });
                        this.adapter.log.error(`Error adding endpoint ${endpoint.id} to bridge: ${errorText}`);
                        erroredCount++;
                    }
                }
                if (erroredCount === endpoints.length) {
                    await mappingDevice.destroy();
                    await composedEndpoint.delete();
                    throw new Error(`Could not add any endpoint to composed device`);
                }

                this.#deviceEndpoints.set(deviceOptions.uuid, [composedEndpoint]);
            }
            await mappingDevice.init();
            this.#mappingDevices.set(deviceOptions.uuid, mappingDevice);

            const addedEndpoints = this.#deviceEndpoints.get(deviceOptions.uuid) as Endpoint<BridgedNodeEndpoint>[];
            for (const endpoint of addedEndpoints) {
                await initializeBridgedUnreachableStateHandler(endpoint, device);
            }
        } else {
            throw new Error(`ioBroker Device in Bridge "${device.deviceType}" is not supported`);
        }
    }

    async init(): Promise<void> {
        await this.adapter.extendObjectAsync(`bridges.${this.#parameters.uuid}.commissioned`, {
            type: 'state',
            common: {
                name: 'commissioned',
                type: 'boolean',
                role: 'indicator',
                read: true,
                write: false,
            },
            native: {},
        });

        const deviceName = this.#parameters.deviceName || 'ioBroker Matter Bridge';
        const deviceType = AggregatorEndpoint.deviceType;
        const vendorName = 'ioBroker';

        // product name / id and vendor id should match what is in the device certificate
        const vendorId = this.#parameters.vendorId; // 0xfff1;
        const productId = this.#parameters.productId; // 0x8000;

        const uniqueId = this.#parameters.uuid.replace(/-/g, '').split('.').pop();
        if (uniqueId === undefined) {
            throw new Error(`Could not determine device unique id from ${this.#parameters.uuid}`);
        }

        const versions = this.adapter.versions;
        const matterName = deviceName.substring(0, 32);
        this.serverNode = await ServerNode.create({
            id: this.#parameters.uuid,
            network: {
                port: this.#parameters.port,
            },
            productDescription: {
                name: matterName,
                deviceType,
            },
            basicInformation: {
                vendorName,
                vendorId: VendorId(vendorId),
                nodeLabel: matterName,
                productName: matterName,
                productLabel: deviceName.substring(0, 64),
                productId,
                serialNumber: uniqueId,
                uniqueId: md5(uniqueId),
                hardwareVersion: versions.versionNum,
                hardwareVersionString: versions.versionStr,
                softwareVersion: versions.versionNum,
                softwareVersionString: versions.versionStr,
            },
        });

        this.#aggregator = new Endpoint(AggregatorEndpoint, { id: 'bridge' });

        await this.serverNode.add(this.#aggregator);

        let erroredCount = 0;
        for (let i = 0; i < this.#devices.length; i++) {
            try {
                await this.addBridgedIoBrokerDevice(this.#devices[i], this.#devicesOptions[i]);
            } catch (error) {
                erroredCount++;
                const errorText = inspect(error, { depth: 10 });
                this.adapter.log.error(`Error adding device ${this.#devicesOptions[i].uuid} to bridge: ${errorText}`);
            }
        }
        if (erroredCount === this.#devices.length) {
            await this.destroy();
            throw new Error(`Could not add any device to bridge`);
        }

        this.registerServerNodeHandlers();
    }

    /** Apply an updated configuration for the Bridge. */
    async applyConfiguration(options: BridgeCreateOptions): Promise<void> {
        this.adapter.log.debug('Applying new bridge configuration');

        if (!this.serverNode) {
            this.adapter.log.error(
                `ServerNode for Bridge ${this.#parameters.uuid} not initialized. Should never happen`,
            );
            return;
        }

        // If the device is already commissioned we only allow to modify contained devices partially
        if (this.serverNode.lifecycle.isCommissioned) {
            const existingDevicesInBridge = [...this.#deviceEndpoints.keys()];
            const newDeviceList = new Array<string>();

            for (let i = 0; i < options.devices.length; i++) {
                const device = options.devices[i];
                const deviceOptions = options.devicesOptions[i];
                newDeviceList.push(deviceOptions.uuid);
                this.adapter.log.debug(`Processing device ${deviceOptions.uuid} "${deviceOptions.name}" in bridge`);
                if (existingDevicesInBridge.includes(deviceOptions.uuid)) {
                    existingDevicesInBridge.splice(existingDevicesInBridge.indexOf(deviceOptions.uuid), 1);
                    this.adapter.log.debug(`Device ${deviceOptions.uuid} already in bridge. Sync Configuration`);
                    const existingDevice = this.#devices.find(d => d.uuid === deviceOptions.uuid);
                    if (existingDevice === undefined) {
                        this.adapter.log.info(`Device ${deviceOptions.uuid} not found in bridge. Should never happen`);
                        continue;
                    }
                    existingDevice.applyConfiguration(deviceOptions);
                    continue;
                }
                this.adapter.log.info(`Adding device  ${deviceOptions.uuid} "${deviceOptions.name}" to bridge`);
                await this.addBridgedIoBrokerDevice(device, deviceOptions);
                this.#devices.push(device);
                this.#devicesOptions.push(deviceOptions);
            }

            for (const [uuid, endpoints] of this.#deviceEndpoints) {
                if (!newDeviceList.includes(uuid)) {
                    this.adapter.log.info(`Removing device ${uuid} from bridge`);

                    await this.#mappingDevices.get(uuid)?.destroy();
                    this.#mappingDevices.delete(uuid);

                    for (const endpoint of endpoints) {
                        this.adapter.log.debug(`Removing endpoint ${endpoint.id} from bridge`);
                        await endpoint.delete();
                    }

                    this.#deviceEndpoints.delete(uuid);

                    const deviceIndex = this.#devicesOptions.findIndex(device => device.uuid === uuid);
                    if (deviceIndex !== -1) {
                        await this.#devices[deviceIndex].destroy();
                        this.#devices.splice(deviceIndex, 1);
                        this.#devicesOptions.splice(deviceIndex, 1);
                    }
                }
            }

            return;
        }

        // Shut down the device
        const wasStarted = this.#started;
        await this.destroy();

        // Reinitialize
        this.#parameters = options.parameters;
        this.#devices = options.devices;
        this.#devicesOptions = options.devicesOptions;
        await this.init();
        if (wasStarted) {
            await this.start();
        } else {
            await this.updateUiState();
        }
    }

    async start(): Promise<void> {
        if (!this.serverNode) {
            return;
        }
        await this.serverNode.start();
        this.#started = true;
        await this.updateUiState();
    }

    async destroy(): Promise<void> {
        for (const device of this.#devices) {
            await device.destroy();
        }
        for (const mappingDevice of this.#mappingDevices.values()) {
            await mappingDevice.destroy();
        }
        await this.serverNode?.close();
        this.serverNode = undefined;
        this.#started = false;
        await this.updateUiState();
    }
}

export default BridgedDevices;
