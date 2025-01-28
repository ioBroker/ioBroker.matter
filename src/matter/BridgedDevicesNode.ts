import { Endpoint, ServerNode, VendorId, EndpointServer } from '@matter/main';
import { BridgedDeviceBasicInformationServer, NetworkCommissioningServer } from '@matter/main/behaviors';
import { AggregatorEndpoint, BridgedNodeEndpoint } from '@matter/main/endpoints';
import { NetworkCommissioning } from '@matter/main/clusters';
import { inspect } from 'util';
import type { BridgeDeviceDescription } from '../ioBrokerStorageTypes';
import type { GenericDevice } from '../lib';
import { md5 } from '../lib/utils';
import type { MatterAdapter } from '../main';
import { BaseServerNode } from './BaseServerNode';
import matterDeviceFactory from './to-matter/matterFactory';
import type { GenericDeviceToMatter } from './to-matter/GenericDeviceToMatter';
import type { StructuredJsonFormData } from '../lib/JsonConfigUtils';
import { IoBrokerCommissioningServer } from './behaviors/IoBrokerCommissioningServer';
import { logEndpoint } from './EndpointStructureInspector';
import type { JsonFormSchema } from '@iobroker/dm-utils';

export interface BridgeCreateOptions {
    parameters: BridgeOptions;
    devices: Map<string, { device?: GenericDevice; error?: string; options: BridgeDeviceDescription }>;
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
    #devices: Map<string, { device?: GenericDevice; error?: string; options: BridgeDeviceDescription }>;
    #started = false;
    #aggregator?: Endpoint<AggregatorEndpoint>;
    #deviceEndpoints = new Map<string, Endpoint[]>();
    #mappingDevices = new Map<string, GenericDeviceToMatter>();

    constructor(adapter: MatterAdapter, options: BridgeCreateOptions) {
        super(adapter, 'bridges', options.parameters.uuid);
        this.#parameters = options.parameters;
        this.#devices = options.devices;
    }

    get port(): number {
        return this.#parameters.port;
    }

    /** Creates the Matter device/endpoint and adds it to the code. It also handles Composed vs non-composed structuring. */
    async addBridgedIoBrokerDevice(device: GenericDevice, deviceOptions: BridgeDeviceDescription): Promise<void> {
        if (!this.#aggregator) {
            throw new Error(`Aggregator on Bridge ${deviceOptions.uuid} not initialized. Should never happen`);
        }

        this.adapter.log.info(`Preparing bridged device ${deviceOptions.uuid} "${deviceOptions.name}" for bridge`);

        if (this.#deviceEndpoints.has(deviceOptions.uuid)) {
            this.adapter.log.warn(
                `Device ${deviceOptions.uuid} already in bridge. Should never happen. Closing them before re-adding`,
            );
            for (const endpoint of this.#deviceEndpoints.get(deviceOptions.uuid) ?? []) {
                try {
                    await endpoint.close();
                } catch (error) {
                    const errorText = inspect(error, { depth: 10 });
                    this.adapter.log.error(`Error closing endpoint ${endpoint.id} in bridge: ${errorText}`);
                }
            }
            this.#deviceEndpoints.delete(deviceOptions.uuid);
        }

        const mappingDevice = await matterDeviceFactory(device, deviceOptions.name, deviceOptions.uuid);
        if (mappingDevice) {
            const name = mappingDevice.name;
            const endpoints = mappingDevice.matterEndpoints;
            const serialNumber = deviceOptions.uuid.replace(/-/g, '');
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
                        const errorText = inspect(error, { depth: 10 });
                        this.adapter.log.error(`Error closing endpoint ${endpoint.id} in bridge: ${errorText}`);
                    }

                    const matterName = name.substring(0, 32);
                    endpoint.behaviors.require(BridgedDeviceBasicInformationServer, {
                        nodeLabel: matterName,
                        productName: matterName,
                        productLabel: name.substring(0, 64),
                        serialNumber,
                        uniqueId: md5(endpoint.id),
                        reachable: true,
                    });
                    this.registerMaintenanceClusters(endpoint, device);
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
                        serialNumber,
                        uniqueId: md5(id),
                        reachable: true,
                    },
                    parts: endpoints,
                });
                this.registerMaintenanceClusters(composedEndpoint, device);

                try {
                    await this.#aggregator.add(composedEndpoint);
                } catch (error) {
                    await mappingDevice.destroy();
                    await composedEndpoint.delete();

                    const errorText = inspect(error, { depth: 10 });
                    throw new Error(
                        `Error adding endpoints to bridged device ${deviceOptions.uuid} "${deviceOptions.name}" to bridge: ${errorText}`,
                    );
                }

                this.#deviceEndpoints.set(deviceOptions.uuid, [composedEndpoint]);
            }
            await mappingDevice.init();
            mappingDevice.validChanged.on(() => this.updateUiState());
            this.#mappingDevices.set(deviceOptions.uuid, mappingDevice);

            const addedEndpoints = this.#deviceEndpoints.get(deviceOptions.uuid) as Endpoint<BridgedNodeEndpoint>[];
            for (const endpoint of addedEndpoints) {
                await this.initializeBridgedUnreachableStateHandler(endpoint, device);
                this.initializeMaintenanceStateHandlers(endpoint, device);
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

        const uniqueId = this.#parameters.uuid.replace(/-/g, '');
        if (uniqueId === undefined) {
            throw new Error(`Could not determine device unique id from ${this.#parameters.uuid}`);
        }

        const versions = this.adapter.versions;
        const matterName = deviceName.substring(0, 32);
        const networkId = new Uint8Array(32);

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
                    hardwareVersion: 1,
                    hardwareVersionString: versions.versionStr,
                    softwareVersion: versions.versionNum,
                    softwareVersionString: versions.versionStr,
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

        this.#aggregator = new Endpoint(AggregatorEndpoint, { id: 'bridge' });

        await this.serverNode.add(this.#aggregator);

        let erroredCount = 0;
        for (const [uuid, { device, error, options: deviceOptions }] of this.#devices.entries()) {
            if (!device || error) {
                erroredCount++;
                this.adapter.log.info(`Skipping device ${deviceOptions.uuid} because could not be initialized.`);
                continue;
            }
            try {
                await this.addBridgedIoBrokerDevice(device, deviceOptions);
            } catch (error) {
                erroredCount++;
                const errorText = inspect(error, { depth: 10 });
                this.adapter.log.error(`Error adding device ${deviceOptions.uuid} to bridge: ${errorText}`);
                const details = this.#devices.get(uuid);
                if (details !== undefined) {
                    details.error = error.message;
                    this.#devices.set(uuid, details);
                }
            }
        }
        if (erroredCount === this.#devices.size) {
            await this.destroy();
            throw new Error(`Could not add any device to bridge`);
        }

        this.registerServerNodeHandlers();
    }

    /** Apply an updated configuration for the Bridge. */
    async applyConfiguration(options: BridgeCreateOptions): Promise<void> {
        if (!this.serverNode) {
            this.adapter.log.error(
                `ServerNode for Bridge ${this.#parameters.uuid} not initialized. Should never happen`,
            );
            return;
        }

        // If the device is already commissioned we only allow to modify contained devices partially
        if (this.serverNode.lifecycle.isCommissioned) {
            const newDeviceList = new Set<string>();

            for (const { device, error, options: deviceOptions } of options.devices.values()) {
                const uuid = deviceOptions.uuid;
                this.adapter.log.debug(`Processing device ${uuid} "${deviceOptions.name}" in bridge`);
                const existingDevice = this.#devices.get(uuid)?.device;
                if (existingDevice) {
                    newDeviceList.add(uuid);
                    this.adapter.log.debug(`Device ${uuid} already in bridge. Sync Configuration`);
                    await existingDevice.applyConfiguration(deviceOptions);
                    continue;
                }
                if (!device || error) {
                    this.adapter.log.info(`Skipping device ${uuid} because could not be initialized.`);
                    this.#devices.set(uuid, { device, error, options: deviceOptions });
                    continue;
                }
                newDeviceList.add(uuid);
                this.adapter.log.info(`Adding device ${uuid} "${deviceOptions.name}" to bridge`);
                try {
                    await this.addBridgedIoBrokerDevice(device, deviceOptions);
                    this.#devices.set(uuid, { device, options: deviceOptions });
                } catch (error) {
                    const errorText = inspect(error, { depth: 10 });
                    this.adapter.log.error(`Error adding device ${uuid} to bridge: ${errorText}`);
                    this.#devices.set(uuid, { error: error.message, options: deviceOptions });
                }
            }

            for (const [uuid, endpoints] of this.#deviceEndpoints) {
                if (newDeviceList.has(uuid)) {
                    continue; // It is in current list and also new list, so nothing to do
                }
                this.adapter.log.info(`Removing device ${uuid} from bridge`);

                await this.#mappingDevices.get(uuid)?.destroy();
                this.#mappingDevices.delete(uuid);

                for (const endpoint of endpoints) {
                    this.adapter.log.debug(`Removing endpoint ${endpoint.id} from bridge`);
                    await endpoint.delete();
                }

                this.#deviceEndpoints.delete(uuid);

                const { device } = this.#devices.get(uuid) ?? {};
                await device?.destroy();
                this.#devices.delete(uuid);
            }

            return;
        }

        // Shut down the device
        const wasStarted = this.#started;
        await this.destroy();

        // Reinitialize
        this.#parameters = options.parameters;
        this.#devices = options.devices;
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
        this.#deviceEndpoints.clear();
        for (const { device } of this.#devices.values()) {
            await device?.destroy();
        }
        for (const mappingDevice of this.#mappingDevices.values()) {
            await mappingDevice.destroy();
        }
        await this.serverNode?.close();
        this.serverNode = undefined;
        this.#aggregator = undefined;
        this.#started = false;
        await this.updateUiState();
    }

    get error(): boolean | string[] {
        if (!this.serverNode) {
            return true;
        }
        // Collect enabled devices that have an error state to show them in the UI
        const errors = [...this.#devices.entries()]
            .map(
                ([
                    uuid,
                    {
                        device,
                        error,
                        options: { enabled },
                    },
                ]) => ((error || !device?.isValid) && enabled ? uuid : undefined),
            )
            .filter(uuid => uuid !== undefined);
        return errors.length > 0 ? errors : false;
    }

    getDeviceDetails(message: ioBroker.MessagePayload): StructuredJsonFormData {
        const bridgedDeviceUuid = message.bridgedDeviceUuid;
        const details: StructuredJsonFormData = {};

        if (bridgedDeviceUuid === undefined) {
            const error = this.error;
            if (error) {
                details.error = {
                    __header__error: 'Error information',
                    __text__info: Array.isArray(error)
                        ? `${error.length} Bridged Device(s) are in an error state. Fix the errors before enabling it again.`
                        : `The Bridge could not be initialized. Please check the logfile for more information.`,
                    __text__info2: `Please refer to the error details at the bridged device level.`,
                    uuid: this.uuid,
                };
            } else {
                // The error boolean state should never end here because then this object should have not been created
            }
        } else {
            const { error, device } = this.#devices.get(bridgedDeviceUuid) ?? {};
            const isValid = device?.isValid;
            if (error || !isValid) {
                details.error = {
                    __header__error: 'Error information',
                    __text__info: `Bridged Device is in an error state. Fix the error before enabling it again.`,
                    uuid: `${bridgedDeviceUuid} on ${this.uuid}`,
                    __text__error: `Error: ${error}`,
                };
            }
        }

        if (bridgedDeviceUuid !== undefined) {
            const mappingDevice = this.#mappingDevices.get(bridgedDeviceUuid);

            if (mappingDevice) {
                return {
                    ...details,
                    ...mappingDevice?.getDeviceDetails(),
                };
            }

            return {
                ...details,
                noDevice: {
                    __header__error: 'Device not created',
                    uuid: `${bridgedDeviceUuid} on ${this.uuid}`,
                    __text__error: `Error: The device does not exist on this bridge`,
                },
            };
        }

        details.overview = {
            __header__info: 'Bridge Overview',
            uuid: this.uuid,
            port: this.port,
            deviceName: this.#parameters.deviceName,
            productName: this.#parameters.productName,
            vendorId: this.#parameters.vendorId,
            productId: this.#parameters.productId,
            numberOfBridgedDevices: [...this.#devices.values()].reduce(
                (count, { device }) => count + (device ? 1 : 0),
                0,
            ),
        };

        return details;
    }

    override getDeviceDebugInfo(message: ioBroker.MessagePayload): { schema: JsonFormSchema; data: any } {
        const bridgedDeviceUuid = message.bridgedDeviceUuid;
        let debugInfos: string;
        if (bridgedDeviceUuid === undefined) {
            debugInfos = this.serverNode
                ? logEndpoint(EndpointServer.forEndpoint(this.serverNode))
                : 'Server Node not initialized yet.';
        } else {
            const endpoints = this.#deviceEndpoints.get(bridgedDeviceUuid);
            if (endpoints) {
                debugInfos = endpoints
                    .map(endpoint => logEndpoint(EndpointServer.forEndpoint(endpoint)))
                    .join('\r\n\r\n');
            } else {
                debugInfos = `Device ${bridgedDeviceUuid} not found in bridge`;
            }
        }
        const { schema } = super.getDeviceDebugInfo(message);
        return { schema, data: { debugInfos } };
    }
}

export default BridgedDevices;
