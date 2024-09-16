import { BleNode } from '@project-chip/matter-node-ble.js/ble';
import { CommissioningController, NodeCommissioningOptions } from '@project-chip/matter.js';
import { Ble } from '@project-chip/matter.js/ble';
import {
    AnyAttributeServer,
    asClusterServerInternal,
    BasicInformationCluster,
    ClusterServerObj,
    FabricScopeError,
    GeneralCommissioning,
    GlobalAttributes,
} from '@project-chip/matter.js/cluster';
import { CommissionableDevice, DiscoveryData } from '@project-chip/matter.js/common';
import { NodeId /* , ClusterId */ } from '@project-chip/matter.js/datatype';
import {
    CommissioningControllerNodeOptions,
    Endpoint,
    NodeStateInformation,
    PairedNode,
} from '@project-chip/matter.js/device';
import { Environment } from '@project-chip/matter.js/environment';
import { Logger } from '@project-chip/matter.js/log';
import { CommissioningOptions } from '@project-chip/matter.js/protocol';
import { ManualPairingCodeCodec, QrPairingCodeCodec } from '@project-chip/matter.js/schema';
import { singleton, toHex } from '@project-chip/matter.js/util';
import type { MatterControllerConfig } from '../../src-admin/src/types';
import type { MatterAdapter } from '../main';
import Base from './clusters/Base';
import Factories from './clusters/factories';
import { GeneralNode, MessageResponse } from './GeneralNode';

export interface ControllerCreateOptions {
    adapter: MatterAdapter;
    controllerOptions: MatterControllerConfig;
    matterEnvironment: Environment;
}

interface AddDeviceResult {
    result: boolean;
    /** The error message */
    error?: string;
    nodeId?: string;
}

type EndUserCommissioningOptions = (
    | { qrCode: string }
    | { manualCode: string }
    | { passCode: number; vendorId: number; productId: number; ip: string; port: number }
) & { device: CommissionableDevice };

// const IGNORE_CLUSTERS: ClusterId[] = [
//     ClusterId(0x0004), // Groups
//     ClusterId(0x0005), // Scenes
//     ClusterId(0x001D), // Descriptor
//     ClusterId(0x001D), // Descriptor
//     ClusterId(0x001E), // Binding
//     ClusterId(0x001F), // Access Control
//     ClusterId(0x002B), // Localization Configuration
//     ClusterId(0x002C), // Time Format Localization
//     ClusterId(0x002D), // Unit Localization
//     ClusterId(0x002E), // Power Source Configuration
//     ClusterId(0x0030), // General Commissioning
//     ClusterId(0x0031), // Network Commissioning
//     ClusterId(0x0032), // Diagnostic Logs
//     ClusterId(0x0033), // General Diagnostics
//     ClusterId(0x0034), // Software Diagnostics
//     ClusterId(0x0035), // Thread Network ClusterId(Diagnostics
//     ClusterId(0x0036), // Wi-Fi Network Diagnostics
//     ClusterId(0x0037), // Ethernet Network Diagnostics
//     ClusterId(0x0038), // Time Synchronization
//     ClusterId(0x0039), // Bridged Device Basic Information
//     ClusterId(0x003C), // Administrator Commissioning
//     ClusterId(0x003E), // Node Operational Credentials
//     ClusterId(0x003F), // Group Key Management
//     ClusterId(0x0046), // ICD Management S
// ];

interface Device {
    clusters: Base[];
    nodeId: string;
    connectionStateId: string;
    connectionStatusId: string;
}

class Controller implements GeneralNode {
    #parameters: MatterControllerConfig;
    readonly #adapter: MatterAdapter;
    readonly #matterEnvironment: Environment;
    #commissioningController?: CommissioningController;
    #devices = new Map<string, Device>();
    #delayedStates: { [nodeId: string]: NodeStateInformation } = {};
    #connected: { [nodeId: string]: boolean } = {};
    #discovering = false;
    #useBle = false;

    constructor(options: ControllerCreateOptions) {
        this.#adapter = options.adapter;
        this.#parameters = options.controllerOptions;
        this.#matterEnvironment = options.matterEnvironment;
    }

    async init(): Promise<void> {
        await this.applyConfiguration(this.#parameters, true);
        this.#commissioningController = new CommissioningController({
            autoConnect: false,
            environment: {
                environment: this.#matterEnvironment,
                id: 'controller',
            },
        });
    }

    async applyConfiguration(config: MatterControllerConfig, isInitialization = false): Promise<MessageResponse> {
        const currentConfig: MatterControllerConfig = isInitialization ? { enabled: true } : this.#parameters;

        this.#useBle = false;
        if (config.ble !== currentConfig.ble || config.hciId !== currentConfig.hciId) {
            if (
                config.ble &&
                ((config.wifiSSID && config.wifiPassword) ||
                    (config.threadNetworkName !== undefined && config.threadOperationalDataSet !== undefined))
            ) {
                try {
                    const hciId = config.hciId === undefined ? undefined : parseInt(config.hciId);
                    Ble.get = singleton(() => new BleNode({ hciId }));
                    this.#useBle = true;
                } catch (error) {
                    this.#adapter.log.warn(`Failed to initialize BLE: ${error.message}`);
                    config.ble = false;
                    return { error: `Can not adjust configuration and enable BLE because of error: ${error.message}` };
                }
            }
        }
        this.#parameters = config;
        return { result: true };
    }

    async handleCommand(command: string, message: ioBroker.MessagePayload): Promise<MessageResponse> {
        if (this.#commissioningController === undefined) {
            return { error: 'Controller is not initialized.' };
        }
        try {
            switch (command) {
                case 'controllerDiscovery':
                    // Discover for Matter devices in the IP and potentially BLE network
                    return { result: await this.discovery() };
                case 'controllerDiscoveryStop':
                    // Stop Discovery
                    if (this.#discovering) {
                        await this.#discoveryStop();
                        return { result: 'ok' };
                    } else {
                        // let's return ok because in fact it is stopped
                        return { result: 'ok' };
                    }
                case 'controllerCommissionDevice':
                    // Commission a new device with Commissioning payloads like a QR Code or pairing code
                    const options = message as EndUserCommissioningOptions;
                    return await this.commissionDevice(options);
                case 'controllerDeviceQrCode':
                    // Opens a new commissioning window for a paired node and returns the QRCode and pairing code for display
                    return { result: await this.showNewCommissioningCode(message.nodeId) };
                case 'controllerInitializePaseCommissioner':
                    // Returns the data needed to initialize a PaseCommissioner on the mobile App
                    return { result: this.#commissioningController.paseCommissionerData };
                case 'controllerCompletePaseCommissioning':
                    // Completes a commissioning process that was started by the mobile app in the main controller
                    return await this.completeCommissioningForNode(message.peerNodeId, message.discoveryData);
            }
        } catch (error) {
            this.#adapter.log.warn(`Error while executing command "${command}": ${error.stack}`);
            return { error: `Error while executing command "${command}": ${error.message}` };
        }

        return { error: `Unknown command "${command}"` };
    }

    initEventHandlers(): CommissioningControllerNodeOptions {
        return {
            attributeChangedCallback: (
                peerNodeId: NodeId,
                { path: { nodeId, clusterId, endpointId, attributeName }, value }: any,
            ) => {
                this.#adapter.log.debug(
                    `attributeChangedCallback "${peerNodeId}": Attribute ${nodeId}/${endpointId}/${clusterId}/${attributeName} changed to ${Logger.toJSON(
                        value,
                    )}`,
                );
            },

            eventTriggeredCallback: (
                peerNodeId: NodeId,
                { path: { nodeId, clusterId, endpointId, eventName }, events }: any,
            ) => {
                this.#adapter.log.debug(
                    `eventTriggeredCallback "${peerNodeId}": Event ${nodeId}/${endpointId}/${clusterId}/${eventName} triggered with ${Logger.toJSON(
                        events,
                    )}`,
                );
            },

            stateInformationCallback: async (peerNodeId: NodeId, info: NodeStateInformation) => {
                const nodeIdStr = peerNodeId.toString();
                const node = this.#commissioningController?.getConnectedNode(peerNodeId);
                const device = this.#devices.get(nodeIdStr);
                if (this.#connected[nodeIdStr] !== undefined) {
                    if (node?.isConnected && !this.#connected[nodeIdStr]) {
                        this.#connected[nodeIdStr] = true;
                        // Rebuild node structure
                        await this.nodeToIoBrokerStructure(node);
                    } else if (!node?.isConnected && this.#connected[nodeIdStr]) {
                        this.#connected[nodeIdStr] = false;
                    }
                }

                if (device) {
                    await this.#adapter.setState(
                        device.connectionStateId,
                        info === NodeStateInformation.Connected,
                        true,
                    );
                    await this.#adapter.setState(device.connectionStatusId, info, true);
                } else {
                    this.#adapter.log.info(`New Matter node "${nodeIdStr}" detected ...`);
                    // delayed state
                    this.#delayedStates[nodeIdStr] = info;
                }

                switch (info) {
                    case NodeStateInformation.Connected:
                        this.#adapter.log.debug(`Node "${peerNodeId}" connected`);
                        break;
                    case NodeStateInformation.Disconnected:
                        this.#adapter.log.debug(`Node "${peerNodeId}" disconnected`);
                        break;
                    case NodeStateInformation.Reconnecting:
                        this.#adapter.log.debug(`Node "${peerNodeId}" reconnecting`);
                        break;
                    case NodeStateInformation.WaitingForDeviceDiscovery:
                        this.#adapter.log.debug(`Node "${peerNodeId}" waiting for device discovery`);
                        break;
                    case NodeStateInformation.StructureChanged:
                        this.#adapter.log.debug(`Node "${peerNodeId}" structure changed`);
                        break;
                }
            },
        };
    }

    async start(): Promise<void> {
        if (!this.#commissioningController) {
            throw new Error('CommissioningController not initialized');
        }

        await this.#adapter.extendObject('controller.info', {
            type: 'channel',
            common: {
                name: 'Information',
            },
            native: {},
        });

        await this.#adapter.extendObject('controller.info.discovering', {
            type: 'state',
            common: {
                name: 'Discovering',
                role: 'indicator',
                type: 'boolean',
                read: true,
                write: false,
                def: false,
            },
            native: {},
        });

        await this.#adapter.setState('controller.info.discovering', false, true);

        await this.#commissioningController.start();

        // get nodes
        const nodes = this.#commissioningController.getCommissionedNodes();
        this.#adapter.log.info(`Found ${nodes.length} nodes: ${Logger.toJSON(nodes)}`);

        // attach all nodes to the controller
        for (const nodeId of nodes) {
            try {
                this.#adapter.log.info(`Connecting to node "${nodeId}" ...`);
                const node = await this.#commissioningController.connectNode(nodeId, this.initEventHandlers());
                await this.nodeToIoBrokerStructure(node);
            } catch (error) {
                this.#adapter.log.info(`Failed to connect to node "${nodeId}": ${error.stack}`);
            }
        }
    }

    getAttributeServerValue(attribute: AnyAttributeServer<any>): string {
        let value = '';
        try {
            const attributeValue = attribute.getLocal();
            const attributeValueType = typeof attributeValue;
            if (attributeValueType !== 'object' || attributeValue === null) {
                value = attributeValue === null ? 'null' : attributeValue.toString();
            } else if (attributeValueType === 'object' && attributeValue) {
                value = Logger.toJSON(attributeValue);
            }
        } catch (error) {
            if (error instanceof FabricScopeError) {
                value = 'Fabric-Scoped';
            } else {
                value = `Error: ${(error as any).message}`;
            }
        }
        return value;
    }

    logClusterServer(nodeId: NodeId, clusterServer: ClusterServerObj<any>, level: number): void {
        const featureMap = clusterServer.attributes.featureMap?.getLocal() ?? {};
        const globalAttributes = GlobalAttributes<any>(featureMap);
        const supportedFeatures = new Array<string>();
        for (const featureName in featureMap) {
            if ((featureMap as any)[featureName] === true) {
                supportedFeatures.push(featureName);
            }
        }
        this.#adapter.log.debug(
            `${''.padStart(level * 2)}Cluster-Server "${clusterServer.name}" (${toHex(clusterServer.id)}) ${
                supportedFeatures.length ? `(Features: ${supportedFeatures.join(', ')})` : ''
            }`,
        );
        this.#adapter.log.debug(`${''.padStart(level * 2 + 2)}Global-Attributes:`);
        for (const attributeName in globalAttributes) {
            const attribute = clusterServer.attributes[attributeName];
            if (attribute === undefined) {
                continue;
            }

            const value = this.getAttributeServerValue(attribute);
            this.#adapter.log.debug(
                `${''.padStart(level * 2 + 4)}"${attribute.name}" (${toHex(attribute.id)})${value !== '' ? `: value = ${value}` : ''}`,
            );
        }

        this.#adapter.log.debug(`${''.padStart(level * 2 + 2)}Cluster-Attributes:`);
        for (const attributeName in clusterServer.attributes) {
            if (attributeName in globalAttributes) {
                continue;
            }
            const attribute = clusterServer.attributes[attributeName];
            if (attribute === undefined) {
                continue;
            }

            const value = this.getAttributeServerValue(attribute);
            this.#adapter.log.debug(
                `${''.padStart(level * 2 + 4)}"${attribute.name}" (${toHex(attribute.id)})${value !== '' ? `: value = ${value}` : ''}`,
            );
        }

        this.#adapter.log.debug(`${''.padStart(level * 2 + 2)}Commands:`);
        const commands = asClusterServerInternal(clusterServer).commands;
        for (const commandName in commands) {
            const command = commands[commandName];
            if (command === undefined) continue;
            this.#adapter.log.debug(
                `${''.padStart(level * 2 + 4)}"${command.name}" (${toHex(command.invokeId)}/${command.responseId})`,
            );
        }

        this.#adapter.log.debug(`${''.padStart(level * 2 + 2)}Events:`);
        const events = asClusterServerInternal(clusterServer).events;
        for (const eventName in events) {
            const event = events[eventName];
            if (event === undefined) continue;
            this.#adapter.log.debug(`${''.padStart(level * 2 + 4)}"${event.name}" (${toHex(event.id)})`);
        }
    }

    async logClusterClient(nodeId: NodeId, clusterClient: any, level: number): Promise<void> {
        const { supportedFeatures: features } = clusterClient;
        const globalAttributes = GlobalAttributes(features);
        const supportedFeatures = [];
        for (const featureName in features) {
            if (features[featureName] === true) {
                supportedFeatures.push(featureName);
            }
        }
        // const id = `controller.${Logger.toJSON(nodeId).replace(/"/g, '')}.${clusterClient.name}`;
        // let channelObj = await this.#adapter.getObjectAsync(id);
        // if (!channelObj) {
        //     channelObj = {
        //         _id: id,
        //         type: 'channel',
        //         common: {
        //             name: clusterClient.name,
        //         },
        //         native: {
        //             nodeId: Logger.toJSON(nodeId),
        //             clusterId: clusterClient.id,
        //         },
        //     };
        //     await this.#adapter.setObjectAsync(channelObj._id, channelObj);
        // }

        this.#adapter.log.debug(
            `${''.padStart(level * 2)}Cluster-Client "${clusterClient.name}" (${toHex(clusterClient.id)}) ${supportedFeatures.length ? `(Features: ${supportedFeatures.join(', ')})` : ''}`,
        );
        this.#adapter.log.debug(`${''.padStart(level * 2 + 2)}Global-Attributes:`);
        for (const attributeName in globalAttributes) {
            const attribute = clusterClient.attributes[attributeName];
            if (attribute === void 0) {
                continue;
            }

            this.#adapter.log.debug(
                `${''.padStart(level * 2 + 4)}"${attribute.name}" (${toHex(attribute.id)}) = ${this.getAttributeServerValue(attribute)}`,
            );
        }

        this.#adapter.log.debug(`${''.padStart(level * 2 + 2)}Attributes:`);
        for (const attributeName in clusterClient.attributes) {
            if (attributeName in globalAttributes) {
                continue;
            }
            const attribute = clusterClient.attributes[attributeName];
            if (attribute === void 0) {
                continue;
            }
            // const present = attribute instanceof PresentAttributeClient;
            // const unknown = attribute instanceof UnknownPresentAttributeClient;
            // let info = "";
            // if (!present) {
            //     info += " (Not Present)";
            // }
            // if (unknown) {
            //     info += " (Unknown)";
            // }
            this.#adapter.log.debug(
                `${''.padStart(level * 2 + 4)}"${attribute.name}" (${toHex(attribute.id)}) = ${this.getAttributeServerValue(attribute)}`,
            );
        }

        this.#adapter.log.debug(`${''.padStart(level * 2 + 2)}Commands:`);
        for (const commandName in clusterClient.commands) {
            this.#adapter.log.debug(`${''.padStart(level * 2 + 4)}"${commandName}"`);
        }

        this.#adapter.log.debug(`${''.padStart(level * 2 + 2)}Events:`);
        for (const eventName in clusterClient.events) {
            const event = clusterClient.events[eventName];
            if (event === void 0) {
                continue;
            }
            // const present = event instanceof PresentEventClient;
            // const unknown = event instanceof UnknownPresentEventClient;
            // let info = '';
            // if (!present) {
            //     info += ' (Not Present)';
            // }
            // if (unknown) {
            //     info += ' (Unknown)';
            // }
            this.#adapter.log.debug(`${''.padStart(level * 2 + 4)}"${event.name}" (${toHex(event.id)})`);
        }
    }

    async nodeToIoBrokerStructure(node: PairedNode): Promise<void> {
        const nodeIdStr = node.nodeId.toString();

        // find and clear the old device if existing
        const oldDevice = this.#devices.get(nodeIdStr);
        if (oldDevice !== undefined) {
            for (const cluster of oldDevice.clusters) {
                await cluster.destroy();
            }
        }

        const rootEndpoint = node.getRootEndpoint();
        if (rootEndpoint === undefined) {
            this.#adapter.log.warn(`Node "${node.nodeId}" has not yet been initialized! Should not not happen`);
            return;
        }

        // create device
        const id = `controller.${nodeIdStr}`;
        const deviceObj: ioBroker.Object = {
            _id: id,
            type: 'folder',
            common: {
                name: nodeIdStr,
                statusStates: {
                    onlineId: `controller.${nodeIdStr}.info.connection`,
                },
            },
            native: {
                nodeId: nodeIdStr,
            },
        };

        const info = node.getRootClusterClient(BasicInformationCluster);
        if (info !== undefined) {
            deviceObj.common.name = await info.getProductNameAttribute();
            deviceObj.native.vendorId = `0x${(await info.getVendorIdAttribute()).toString(16).padStart(4, '0')}`;
            deviceObj.native.vendorName = await info.getVendorNameAttribute();
            deviceObj.native.productId = `0x${(await info.getProductIdAttribute()).toString(16).padStart(4, '0')}`;
            deviceObj.native.nodeLabel = await info.getNodeLabelAttribute();
            deviceObj.native.productLabel = info.isAttributeSupportedByName('productLabel')
                ? await info.getProductLabelAttribute()
                : undefined;
            deviceObj.native.serialNumber = info.isAttributeSupportedByName('serialNumber')
                ? await info.getSerialNumberAttribute()
                : undefined;
        }

        await this.#adapter.extendObject(deviceObj._id, deviceObj);

        await this.#adapter.setObjectNotExists(`${id}.info`, {
            type: 'channel',
            common: {
                name: 'Node connection info',
            },
            native: {},
        });

        const device: Device = {
            nodeId: nodeIdStr,
            connectionStateId: `${id}.info.connection`,
            connectionStatusId: `${id}.info.status`,
            clusters: [],
        };

        await this.#adapter.setObjectNotExists(device.connectionStateId, {
            type: 'state',
            common: {
                name: 'Connected',
                role: 'indicator.connected',
                type: 'boolean',
                read: true,
                write: false,
            },
            native: {},
        });

        await this.#adapter.setObjectNotExists(device.connectionStatusId, {
            type: 'state',
            common: {
                name: 'Connection status',
                role: 'state',
                type: 'number',
                states: {
                    [NodeStateInformation.Connected]: 'connected',
                    [NodeStateInformation.Disconnected]: 'disconnected',
                    [NodeStateInformation.Reconnecting]: 'reconnecting',
                    [NodeStateInformation.WaitingForDeviceDiscovery]: 'waitingForDeviceDiscovery',
                    [NodeStateInformation.StructureChanged]: 'structureChanged',
                },
                read: true,
                write: false,
            },
            native: {},
        });

        const delayedNodeState = this.#delayedStates[nodeIdStr];
        if (delayedNodeState !== undefined) {
            delete this.#delayedStates[nodeIdStr];
            await this.#adapter.setState(
                device.connectionStateId,
                delayedNodeState === NodeStateInformation.Connected,
                true,
            );
            await this.#adapter.setState(device.connectionStatusId, delayedNodeState, true);
        }

        await this.endPointToIoBrokerStructure(node.nodeId, rootEndpoint, 0, [], device);

        this.#devices.set(nodeIdStr, device);
    }

    addCluster(device: Device, cluster: Base | undefined): void {
        if (cluster) {
            device.clusters.push(cluster);
        }
    }

    async endPointToIoBrokerStructure(
        nodeId: NodeId,
        endpoint: Endpoint,
        level: number,
        path: number[],
        device: Device,
    ): Promise<void> {
        this.#adapter.log.info(`${''.padStart(level * 2)}Endpoint ${endpoint.number} (${endpoint.name}):`);
        if (level) {
            for (let f = 0; f < Factories.length; f++) {
                this.addCluster(device, await Factories[f](this.#adapter, nodeId, endpoint, path));
            }
        }

        // for (const clusterServer of endpoint.getAllClusterServers()) {
        //     this.logClusterServer(nodeId, clusterServer, level + 1);
        // }

        // const clusters = endpoint.getAllClusterClients();
        // for (const clusterClient of clusters) {
        //     if (IGNORE_CLUSTERS.includes(clusterClient.id) || processedClusters.includes(clusterClient.id)) {
        //         continue;
        //     }
        //
        //      await this.logClusterClient(nodeId, clusterClient, level + 1);
        // }

        const endpoints = endpoint.getChildEndpoints();
        path.push(0);
        for (let i = 0; i < endpoints.length; i++) {
            path[path.length - 1] = i;
            await this.endPointToIoBrokerStructure(nodeId, endpoints[i], level + 1, path, device);
        }
    }

    async getState(): Promise<void> {
        // nothing to do
    }

    async commissionDevice(data: EndUserCommissioningOptions): Promise<AddDeviceResult> {
        if (!this.#commissioningController) {
            return { error: 'Controller is not activated.', result: false };
        }
        const commissioningOptions: CommissioningOptions = {
            regulatoryLocation: GeneralCommissioning.RegulatoryLocationType.IndoorOutdoor,
            regulatoryCountryCode: 'XX',
        };

        if (this.#useBle) {
            if (this.#parameters.wifiSSID && this.#parameters.wifiPassword) {
                this.#adapter.log.debug(`Registering Commissioning over BLE with WiFi: ${this.#parameters.wifiSSID}`);
                commissioningOptions.wifiNetwork = {
                    wifiSsid: this.#parameters.wifiSSID,
                    wifiCredentials: this.#parameters.wifiPassword,
                };
            }
            if (
                this.#parameters.threadNetworkName !== undefined &&
                this.#parameters.threadOperationalDataSet !== undefined
            ) {
                this.#adapter.log.debug(
                    `Registering Commissioning over BLE with Thread: ${this.#parameters.threadNetworkName}`,
                );
                commissioningOptions.threadNetwork = {
                    networkName: this.#parameters.threadNetworkName,
                    operationalDataset: this.#parameters.threadOperationalDataSet,
                };
            }
        }

        let passcode: number | undefined = undefined;
        let shortDiscriminator: number | undefined = undefined;
        let longDiscriminator: number | undefined = undefined;
        let productId: number | undefined = undefined;
        //let vendorId: number | undefined = undefined;
        if ('manualCode' in data) {
            const pairingCodeCodec = ManualPairingCodeCodec.decode(data.manualCode);
            shortDiscriminator = pairingCodeCodec.shortDiscriminator;
            longDiscriminator = undefined;
            passcode = pairingCodeCodec.passcode;
        } else if ('qrCode' in data) {
            const pairingCodeCodec = QrPairingCodeCodec.decode(data.qrCode);
            // TODO handle the case where multiple devices are included
            longDiscriminator = pairingCodeCodec[0].discriminator;
            shortDiscriminator = undefined;
            passcode = pairingCodeCodec[0].passcode;
        } else if ('passcode' in data) {
            passcode = data.passCode;
            // TODO also use vendor Id once matter.js can discover for both together
            // TODO also try ip/port once matter.js can use this without a full discoverableDevice
            //vendorId = data.vendorId;
            productId = data.productId;
        }
        const { device } = data;
        if (device) {
            longDiscriminator = undefined;
            shortDiscriminator = undefined;
        }

        // this.#adapter.log.debug(`Commissioning ... ${JSON.stringify(options)}`);
        try {
            if (passcode === undefined) {
                throw new Error('Passcode is missing');
            }

            const options: NodeCommissioningOptions = {
                ...this.initEventHandlers(),
                commissioning: commissioningOptions,
                discovery: {
                    commissionableDevice: device || undefined,
                    identifierData:
                        longDiscriminator !== undefined
                            ? { longDiscriminator }
                            : shortDiscriminator !== undefined
                              ? { shortDiscriminator }
                              : productId !== undefined
                                ? { productId }
                                : undefined,
                },
                passcode,
            };

            const nodeId = await this.#commissioningController.commissionNode(options);

            await this.registerCommissionedNode(nodeId);

            return { result: true, nodeId: nodeId.toString() };
        } catch (e) {
            this.#adapter.log.info(`Commissioning failed: ${e.stack}`);
            return { error: e.message, result: false };
        }
    }

    async completeCommissioningForNode(nodeId: NodeId, discoveryData?: DiscoveryData): Promise<AddDeviceResult> {
        if (!this.#commissioningController) {
            return {
                result: false,
                error: `Can not register NodeId "${nodeId}" because controller not initialized.`,
            };
        }

        await this.#commissioningController.completeCommissioningForNode(nodeId, discoveryData);

        await this.registerCommissionedNode(nodeId);

        return { result: true, nodeId: nodeId.toString() };
    }

    async registerCommissionedNode(nodeId: NodeId): Promise<void> {
        if (!this.#commissioningController) {
            throw new Error(`Can not register NodeId "${nodeId}" because controller not initialized.`);
        }

        const node = this.#commissioningController.getConnectedNode(nodeId);
        if (node === undefined) {
            // should never happen
            throw new Error(`Node ${nodeId} is not connected but commissioning was successful. Should not happen.`);
        }

        await this.nodeToIoBrokerStructure(node);

        this.#adapter.log.debug(`Commissioning successfully completed with nodeId "${nodeId}"`);
    }

    async discovery(): Promise<CommissionableDevice[] | null> {
        if (!this.#commissioningController) {
            return null;
        }
        await this.#adapter.setState('controller.info.discovering', true, true);
        this.#discovering = true;
        this.#adapter.log.info(`Start the discovering...`);
        const result = await this.#commissioningController.discoverCommissionableDevices(
            {},
            {
                ble: this.#useBle,
                onIpNetwork: true,
            },
            device => {
                this.#adapter.log.debug(`Found: ${Logger.toJSON(device)}`);
                this.#adapter.sendToGui({
                    command: 'discoveredDevice',
                    device,
                });
            },
            60, // timeoutSeconds
        );
        this.#adapter.log.info(`Discovering stopped. Found ${result.length} devices.`);
        await this.#adapter.setState('controller.info.discovering', false, true);
        this.#discovering = false;
        return result;
    }

    async #discoveryStop(): Promise<void> {
        this.#discovering = false;
        await this.#adapter.setState('controller.info.discovering', false, true);
        if (this.#commissioningController && this.#discovering) {
            this.#adapter.log.info(`Stop the discovering...`);
            this.#commissioningController.cancelCommissionableDeviceDiscovery(
                {},
                {
                    ble: this.#useBle,
                    onIpNetwork: true,
                },
            );
        }
    }

    async showNewCommissioningCode(nodeId: NodeId): Promise<{
        manualPairingCode: string;
        qrPairingCode: string;
    } | null> {
        if (!this.#commissioningController) {
            return null;
        }
        const node = this.#commissioningController.getConnectedNode(nodeId);
        if (node) {
            return await node.openEnhancedCommissioningWindow();
        }
        return null;
    }

    async stop(): Promise<void> {
        if (this.#discovering) {
            await this.#discoveryStop();
        }

        for (const device of this.#devices.values()) {
            for (const cluster of device.clusters) {
                await cluster.destroy();
            }
        }

        this.#devices.clear();

        if (this.#commissioningController) {
            await this.#commissioningController.close();
            this.#commissioningController = undefined;
        }
    }
}

export default Controller;
