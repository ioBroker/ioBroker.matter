import { MatterError } from '@project-chip/matter.js/common';
import { VendorId } from '@project-chip/matter.js/datatype';
import { ServerNode } from '@project-chip/matter.js/node';
import { inspect } from 'util';
import { DeviceDescription } from '../ioBrokerStorageTypes';
import { GenericDevice } from '../lib';
import { md5 } from '../lib/utils';
import type { MatterAdapter } from '../main';
import { BaseServerNode } from './BaseServerNode';
import { initializeUnreachableStateHandler } from './devices/SharedStateHandlers';
import matterDeviceFactory from './matterFactory';

export interface DeviceCreateOptions {
    parameters: DeviceOptions;
    device: GenericDevice;
    deviceOptions: DeviceDescription;
}

export interface DeviceOptions {
    uuid: string;
    vendorId: number;
    productId: number;
    deviceName: string;
    productName: string;
    port: number;
}

/** Class representing a Matter Device. */
class Device extends BaseServerNode {
    #parameters: DeviceOptions;
    #device: GenericDevice;
    #deviceOptions: DeviceDescription;
    #started = false;

    constructor(adapter: MatterAdapter, options: DeviceCreateOptions) {
        super(adapter, 'devices', options.parameters.uuid);
        this.#parameters = options.parameters;
        this.#device = options.device;
        this.#deviceOptions = options.deviceOptions;
    }

    get port(): number {
        return this.#parameters.port;
    }

    async init(): Promise<void> {
        await this.adapter.extendObject(`devices.${this.#parameters.uuid}.commissioned`, {
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

        const deviceName = this.#parameters.deviceName || 'Matter device';
        const vendorName = 'ioBroker';

        // product name / id and vendor id should match what is in the device certificate
        const vendorId = this.#parameters.vendorId; // 0xfff1;
        const productName = this.#deviceOptions.name || this.#parameters.productName;
        const productId = this.#parameters.productId; // 0x8000;

        const uniqueId = this.#parameters.uuid.replace(/-/g, '').split('.').pop();
        if (uniqueId === undefined) {
            this.adapter.log.warn(`Could not determine device unique id from ${this.#parameters.uuid}`);
            return;
        }

        const ioBrokerDevice = this.#device;
        const mappingDevice = await matterDeviceFactory(
            ioBrokerDevice,
            this.#deviceOptions.name,
            this.#parameters.uuid,
        );

        if (!mappingDevice) {
            this.adapter.log.error(`ioBroker Device "${this.#device.deviceType}" is not supported`);
            return;
        }

        const endpoints = mappingDevice.getMatterEndpoints();

        // The device type to announce we use from the first returned endpoint of the device
        const deviceType = endpoints[0].type.deviceType;

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

        if (this.#deviceOptions?.noComposed) {
            // No composed means we remove all beside first returned endpoint
            endpoints.splice(1, endpoints.length - 1);
        }
        for (const endpoint of endpoints) {
            try {
                await this.serverNode.add(endpoint);
            } catch (error) {
                // MatterErrors might contain nested information so make sure we see all of this
                const errorText = error instanceof MatterError ? inspect(error, { depth: 10 }) : error.stack;
                this.adapter.log.error(`Error adding endpoint ${endpoint.id} to bridge: ${errorText}`);
            }
        }
        await mappingDevice.init();
        await initializeUnreachableStateHandler(this.serverNode, ioBrokerDevice);

        this.registerServerNodeHandlers();
    }

    /** Apply new configuration to the device. */
    async applyConfiguration(options: DeviceCreateOptions): Promise<void> {
        this.adapter.log.debug('Apply new configuration!!');

        if (!this.serverNode) {
            this.adapter.log.error('ServerNode not initialized. Should never happen');
            return;
        }
        if (this.serverNode.lifecycle.isCommissioned) {
            this.adapter.log.error('Device is already commissioned ... what should change? Ignoring changes');
            return;
        }

        // Shut down the device
        const wasStarted = this.#started;
        await this.stop();

        // Reinitialize
        this.#parameters = options.parameters;
        this.#device = options.device;
        this.#deviceOptions = options.deviceOptions;
        await this.init();
        if (wasStarted) {
            await this.start();
        }
    }

    async start(): Promise<void> {
        if (!this.serverNode) return;
        await this.serverNode.start();
        this.#started = true;
        return;
    }

    async stop(): Promise<void> {
        await this.serverNode?.close();
        await this.#device.destroy();
        this.serverNode = undefined;
        this.#started = false;
    }
}

export default Device;
