import { ServerNode, VendorId } from '@matter/main';
import { NetworkCommissioningServer } from '@matter/main/behaviors';
import { NetworkCommissioning } from '@matter/main/clusters';
import { inspect } from 'util';
import type { DeviceDescription } from '../ioBrokerStorageTypes';
import type { GenericDevice } from '../lib';
import { md5, toUpperCaseHex } from '../lib/utils';
import type { MatterAdapter } from '../main';
import { BaseServerNode } from './BaseServerNode';
import matterDeviceFactory from './to-matter/matterFactory';
import type { GenericDeviceToMatter } from './to-matter/GenericDeviceToMatter';
import type { StructuredJsonFormData } from '../lib/JsonConfigUtils';
import { IoBrokerCommissioningServer } from './behaviors/IoBrokerCommissioningServer';
import { logServerEndpoint } from './EndpointStructureInspector';
import type { JsonFormSchema } from '@iobroker/dm-utils';

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
    #mappingDevice?: GenericDeviceToMatter;
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

    get error(): boolean {
        return !this.#device.isValid;
    }

    async init(): Promise<void> {
        this.adapter.log.info(`Adding device ${this.#parameters.uuid} "${this.#parameters.deviceName}"`);

        await this.adapter.extendObjectAsync(`devices.${this.#parameters.uuid}.commissioned`, {
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

        const uniqueId = this.#parameters.uuid.replace(/-/g, '');
        if (uniqueId === undefined) {
            throw new Error(`Could not determine device unique id from ${this.#parameters.uuid}`);
        }

        const ioBrokerDevice = this.#device;
        const mappingDevice = await matterDeviceFactory(
            ioBrokerDevice,
            this.#deviceOptions.name,
            this.#parameters.uuid,
        );

        if (!mappingDevice) {
            throw new Error(`ioBroker Device "${this.#device.deviceType}" is not supported`);
        }

        mappingDevice.validChanged.on(() => this.updateUiState());
        this.#mappingDevice = mappingDevice;
        const endpoints = mappingDevice.matterEndpoints;

        // The device type to announce we use from the first returned endpoint of the device
        const deviceType = endpoints[0].type.deviceType;

        const versions = this.adapter.versions;
        const matterName = productName.substring(0, 32);

        const networkId = new Uint8Array(32);
        try {
            this.serverNode = await ServerNode.create(
                ServerNode.RootEndpoint.with(
                    NetworkCommissioningServer.withFeatures(NetworkCommissioning.Feature.EthernetNetworkInterface),
                    IoBrokerCommissioningServer,
                ),
                {
                    environment: this.adapter.matterEnvironment,
                    id: this.#parameters.uuid,
                    network: {
                        port: this.#parameters.port,
                    },
                    productDescription: {
                        name: deviceName.substring(0, 32),
                        deviceType,
                    },
                    basicInformation: {
                        vendorName,
                        vendorId: VendorId(vendorId),
                        nodeLabel: matterName,
                        productName: matterName,
                        productLabel: productName.substring(0, 64),
                        productId,
                        serialNumber: uniqueId,
                        uniqueId: md5(uniqueId),
                        hardwareVersion: 1,
                        hardwareVersionString: versions.versionStr,
                        softwareVersion: versions.versionNum,
                        softwareVersionString: versions.versionStr,
                        reachable: true,
                    },
                    networkCommissioning: {
                        maxNetworks: 1,
                        interfaceEnabled: true,
                        lastConnectErrorValue: 0,
                        lastNetworkId: networkId,
                        lastNetworkingStatus: NetworkCommissioning.NetworkCommissioningStatus.Success,
                        networks: [{ networkId: networkId, connected: true }],
                    },
                },
            );
            this.registerMaintenanceClusters(this.serverNode, ioBrokerDevice);
        } catch (error) {
            await mappingDevice.destroy();
            throw error;
        }

        if (endpoints.length > 1 && this.#deviceOptions?.noComposed) {
            this.adapter.log.info(
                `Device ${this.#parameters.uuid} should not be build composed, so only use first endpoint`,
            );
            // No composed means we remove all beside first returned endpoint
            endpoints.splice(1, endpoints.length - 1);
        }
        let erroredCount = 0;
        for (const endpoint of endpoints) {
            try {
                await this.serverNode.add(endpoint);
            } catch (error) {
                // MatterErrors might contain nested information so make sure we see all of this
                const errorText = inspect(error, { depth: 10 });
                this.adapter.log.error(`Error adding endpoint ${endpoint.id} to bridge: ${errorText}`);
                erroredCount++;
            }
        }
        if (erroredCount === endpoints.length) {
            await mappingDevice.destroy();
            await this.destroy();
            throw new Error(`Could not add any endpoint to device`);
        }
        await mappingDevice.init();
        await this.initializeUnreachableStateHandler(this.serverNode, ioBrokerDevice);
        this.initializeMaintenanceStateHandlers(this.serverNode, ioBrokerDevice);

        this.registerServerNodeHandlers();
    }

    /** Apply new configuration to the device. */
    async applyConfiguration(options: DeviceCreateOptions): Promise<void> {
        this.adapter.log.debug('Apply new configuration!!');

        if (!this.serverNode) {
            this.adapter.log.error(
                `ServerNode for device ${this.#parameters.uuid} not initialized. Should never happen`,
            );
            return;
        }
        if (this.serverNode.lifecycle.isCommissioned) {
            this.adapter.log.debug('Device is already commissioned ... Ignoring changes because non allowed');
            return;
        }

        // Shut down the device
        const wasStarted = this.#started;
        await this.destroy();

        // Reinitialize
        this.#parameters = options.parameters;
        this.#device = options.device;
        this.#deviceOptions = options.deviceOptions;
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
        try {
            await this.serverNode.start();
            this.#started = true;
        } catch (error) {
            const errorText = inspect(error, { depth: 10 });
            this.adapter.log.error(`Error starting device ${this.#parameters.uuid}: ${errorText}`);
            return;
        }
        await this.updateUiState();
    }

    async destroy(): Promise<void> {
        try {
            await this.serverNode?.close();
        } catch (error) {
            const errorText = inspect(error, { depth: 10 });
            this.adapter.log.error(`Error stopping device ${this.#parameters.uuid}: ${errorText}`);
        }
        await this.#mappingDevice?.destroy();
        this.#mappingDevice = undefined;
        await this.#device.destroy();
        this.serverNode = undefined;
        this.#started = false;
        await this.updateUiState();
    }

    getDeviceDetails(_message: ioBroker.MessagePayload): StructuredJsonFormData {
        const details: StructuredJsonFormData = {};

        details.overview = {
            __header__info: 'Device Overview',
            uuid: this.uuid,
            port: this.port,
            deviceName: this.#parameters.deviceName,
            productName: this.#parameters.productName,
            vendorId: toUpperCaseHex(this.#parameters.vendorId),
            productId: toUpperCaseHex(this.#parameters.productId),
        };
        return {
            ...details,
            ...this.#mappingDevice?.getDeviceDetails(),
        };
    }

    override getDeviceDebugInfo(message: ioBroker.MessagePayload): { schema: JsonFormSchema; data: any } {
        const debugInfos = this.serverNode ? logServerEndpoint(this.serverNode) : 'Server Node not initialized yet.';
        const { schema } = super.getDeviceDebugInfo(message);
        return { schema, data: { debugInfos } };
    }
}

export default Device;
