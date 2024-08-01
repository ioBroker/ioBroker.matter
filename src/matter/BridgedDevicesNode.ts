import { BridgedDeviceBasicInformationServer } from '@project-chip/matter.js/behavior/definitions/bridged-device-basic-information';
import { MatterError } from '@project-chip/matter.js/common';
import { VendorId } from '@project-chip/matter.js/datatype';
import { DeviceTypes } from '@project-chip/matter.js/device';
import { Endpoint } from '@project-chip/matter.js/endpoint';
import { AggregatorEndpoint, BridgedNodeEndpoint } from '@project-chip/matter.js/endpoint/definitions';
import { ServerNode } from '@project-chip/matter.js/node';
import { inspect } from 'util';
import { BridgeDeviceDescription } from '../ioBrokerStorageTypes';
import { GenericDevice } from '../lib';
import { md5 } from '../lib/utils';
import type { MatterAdapter } from '../main';
import { BaseServerNode } from './BaseServerNode';
import { initializeBridgedUnreachableStateHandler } from './devices/SharedStateHandlers';
import matterDeviceFactory from './matterFactory';

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
    #commissioned: boolean | null = null;
    #started = false;
    #aggregator?: Endpoint<AggregatorEndpoint>;
    #deviceEndpoints = new Map<string, Endpoint[]>();

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
            this.adapter.log.error('Aggregator not initialized. Should never happen');
            return;
        }
        const mappingDevice = await matterDeviceFactory(device, deviceOptions.name, deviceOptions.uuid);
        if (mappingDevice) {
            const name = mappingDevice.name;
            const endpoints = mappingDevice.getMatterEndpoints();
            if (endpoints.length === 1 || deviceOptions.noComposed) {
                // When only one endpoint or non-composed we simply add all endpoints for itself to the bridge
                for (const endpoint of endpoints) {
                    endpoint.behaviors.require(BridgedDeviceBasicInformationServer, {
                        nodeLabel: name,
                        productName: name,
                        productLabel: name,
                        uniqueId: md5(endpoint.id),
                        reachable: true,
                    });
                    try {
                        await this.#aggregator.add(endpoint);
                    } catch (error) {
                        // MatterErrors might contain nested information so make sure we see all of this
                        const errorText = error instanceof MatterError ? inspect(error, { depth: 10 }) : error.stack;
                        this.adapter.log.error(`Error adding endpoint ${endpoint.id} to bridge: ${errorText}`);
                    }
                }
                this.#deviceEndpoints.set(deviceOptions.uuid, endpoints);
            } else {
                const id = `${deviceOptions.uuid}-composed`;
                const composedEndpoint = new Endpoint(BridgedNodeEndpoint, {
                    id,
                    bridgedDeviceBasicInformation: {
                        nodeLabel: name,
                        productName: name,
                        productLabel: name,
                        uniqueId: md5(id),
                        reachable: true,
                    },
                });
                await this.#aggregator.add(composedEndpoint);
                for (const endpoint of endpoints) {
                    try {
                        await composedEndpoint.add(endpoint);
                    } catch (error) {
                        // MatterErrors might contain nested information so make sure we see all of this
                        const errorText = error instanceof MatterError ? inspect(error, { depth: 10 }) : error.stack;
                        this.adapter.log.error(`Error adding endpoint ${endpoint.id} to bridge: ${errorText}`);
                    }
                }
                this.#deviceEndpoints.set(deviceOptions.uuid, [composedEndpoint]);
            }
            await mappingDevice.init();

            const addedEndpoints = this.#deviceEndpoints.get(deviceOptions.uuid) as Endpoint<BridgedNodeEndpoint>[];
            for (const endpoint of addedEndpoints) {
                await initializeBridgedUnreachableStateHandler(endpoint, device);
            }
        } else {
            this.adapter.log.error(`ioBroker Device in Bridge "${device.deviceType}" is not supported`);
        }
    }

    async init(): Promise<void> {
        await this.adapter.extendObject(`bridges.${this.#parameters.uuid}.commissioned`, {
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

        const deviceName = this.#parameters.deviceName || 'Matter Bridge device';
        const deviceType = DeviceTypes.AGGREGATOR.code;
        const vendorName = 'ioBroker';

        // product name / id and vendor id should match what is in the device certificate
        const vendorId = this.#parameters.vendorId; // 0xfff1;
        const productName = `ioBroker Bridge`;
        const productId = this.#parameters.productId; // 0x8000;

        const uniqueId = this.#parameters.uuid.replace(/-/g, '').split('.').pop();
        if (uniqueId === undefined) {
            this.adapter.log.warn(`Could not determine device unique id from ${this.#parameters.uuid}`);
            return;
        }

        this.serverNode = await ServerNode.create({
            id: this.#parameters.uuid,
            network: {
                port: this.#parameters.port,
            },
            productDescription: {
                name: deviceName,
                deviceType,
            },
            basicInformation: {
                vendorName,
                vendorId: VendorId(vendorId),
                nodeLabel: productName,
                productName,
                productLabel: productName,
                productId,
                serialNumber: uniqueId,
                uniqueId: md5(uniqueId),
            },
        });

        this.#aggregator = new Endpoint(AggregatorEndpoint, { id: 'bridge' });

        await this.serverNode.add(this.#aggregator);

        for (let i = 0; i < this.#devices.length; i++) {
            await this.addBridgedIoBrokerDevice(this.#devices[i], this.#devicesOptions[i]);
        }

        this.registerServerNodeHandlers();
    }

    /** Apply an updated configuration for the Bridge. */
    async applyConfiguration(options: BridgeCreateOptions): Promise<void> {
        this.adapter.log.debug('Apply new bridge configuration!!');

        if (!this.serverNode) {
            this.adapter.log.error('Bridge not initialized. Should never happen');
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
                if (existingDevicesInBridge.includes(deviceOptions.uuid)) {
                    existingDevicesInBridge.splice(existingDevicesInBridge.indexOf(deviceOptions.uuid), 1);
                    this.adapter.log.debug(`Device ${deviceOptions.uuid} already in bridge. Skip`);
                    continue;
                }
                await this.addBridgedIoBrokerDevice(device, deviceOptions);
                this.adapter.log.debug(`Device ${deviceOptions.uuid} added to bridge`);
                this.#devices.push(device);
                this.#devicesOptions.push(deviceOptions);
            }

            for (const [uuid, endpoints] of this.#deviceEndpoints) {
                if (!newDeviceList.includes(uuid)) {
                    for (const endpoint of endpoints) {
                        await endpoint.close();
                    }
                    this.#deviceEndpoints.delete(uuid);
                    this.adapter.log.debug(`Device ${uuid} removed from bridge`);
                    const deviceIndex = this.#devicesOptions.findIndex(device => device.uuid === uuid);
                    this.#devices.splice(deviceIndex, 1);
                    this.#devicesOptions.splice(deviceIndex, 1);
                }
            }

            return;
        }

        // Shut down the device
        const wasStarted = this.#started;
        await this.stop();

        // Reinitialize
        this.#parameters = options.parameters;
        this.#devices = options.devices;
        this.#devicesOptions = options.devicesOptions;
        await this.init();
        if (wasStarted) {
            await this.start();
        }
    }

    async start(): Promise<void> {
        if (!this.serverNode) {
            return;
        }
        await this.serverNode.start();
        this.#started = true;
    }

    async stop(): Promise<void> {
        for (const device of this.#devices) {
            await device.destroy();
        }
        await this.serverNode?.close();
        this.serverNode = undefined;
        this.#started = false;
    }
}

export default BridgedDevices;
