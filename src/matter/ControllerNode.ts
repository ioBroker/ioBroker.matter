import {
    CommissioningController,
    CommissioningServer,
    MatterServer,
    NodeCommissioningOptions,
} from '@project-chip/matter-node.js';
import { NodeId, ClusterId } from '@project-chip/matter-node.js/datatype';
import {
    Endpoint, CommissioningControllerNodeOptions,
    PairedNode,
} from '@project-chip/matter-node.js/device';
import { toHexString } from '@project-chip/matter-node.js/util';
import {
    asClusterServerInternal,
    ClusterServerObj,
    GlobalAttributes,
    AnyAttributeServer, FabricScopeError,
    BasicInformationCluster,
} from '@project-chip/matter-node.js/cluster';
import { CommissionableDevice } from '@project-chip/matter-node.js/common';

import { ManualPairingCodeCodec, QrPairingCodeCodec } from '@project-chip/matter-node.js/schema';
import { NodeStateInformation } from '@project-chip/matter-node.js/device';
import { Logger } from '@project-chip/matter-node.js/log';

import { CommissioningOptions } from '@project-chip/matter-node.js/protocol';
import {
    GeneralCommissioning,
} from '@project-chip/matter-node.js/cluster';

import { MatterAdapter } from '../main';
import Factories from './clusters/factories';
import Base from './clusters/Base';

export interface ControllerCreateOptions {
    adapter: MatterAdapter;
    matterServer: MatterServer;
    controllerOptions: ControllerOptions;
}

export interface ControllerOptions {
    ble?: boolean;
    uuid: string;
    wifiSSID?: string;
    wifiPasword?: string;
    threadNetworkname?: string;
    threadOperationalDataSet?: string;
}

interface AddDeviceResult {
    result: boolean;
    error?: Error;
    nodeId?: string;
}

const IGNORE_CLUSTERS: ClusterId[] = [
    0x0004 as ClusterId, // Groups
    0x0005 as ClusterId, // Scenes
    0x001D as ClusterId, // Descriptor
    0x001D as ClusterId, // Descriptor
    0x001E as ClusterId, // Binding
    0x001F as ClusterId, // Access Control
    0x002B as ClusterId, // Localization Configuration
    0x002C as ClusterId, // Time Format Localization
    0x002D as ClusterId, // Unit Localization
    0x002E as ClusterId, // Power Source Configuration
    0x0030 as ClusterId, // General Commissioning
    0x0031 as ClusterId, // Network Commissioning
    0x0032 as ClusterId, // Diagnostic Logs
    0x0033 as ClusterId, // General Diagnostics
    0x0034 as ClusterId, // Software Diagnostics
    0x0035 as ClusterId, // Thread Network Diagnostics
    0x0036 as ClusterId, // Wi-Fi Network Diagnostics
    0x0037 as ClusterId, // Ethernet Network Diagnostics
    0x0038 as ClusterId, // Time Synchronization
    0x0039 as ClusterId, // Bridged Device Basic Information
    0x003C as ClusterId, // Administrator Commissioning
    0x003E as ClusterId, // Node Operational Credentials
    0x003F as ClusterId, // Group Key Management
    0x0046 as ClusterId, // ICD Management S
];

interface Device {
    clusters: Base[];
    nodeId: string;
    connectionStateId?: string;
    connectionStatusId?: string;
}

class Controller {
    private matterServer: MatterServer | undefined;
    private parameters: ControllerOptions;
    private commissioningServer: CommissioningServer | undefined;
    private adapter: MatterAdapter;
    private commissioningController: CommissioningController | null = null;
    private matterNodeIds: NodeId[] = [];
    private devices: Device[] = [];
    private delayedStates: { [nodeId: string]: NodeStateInformation } = {};
    private connected: { [nodeId: string]: boolean } = {};

    constructor(options: ControllerCreateOptions) {
        this.adapter = options.adapter;
        this.parameters = options.controllerOptions;
        this.matterServer = options.matterServer;
    }

    async init(): Promise<void> {
        /**
         * Collect all needed data
         *
         * This block makes sure to collect all needed data from cli or storage. Replace this with where ever your data
         * come from.
         *
         * Note: This example also uses the initialized storage system to store the device parameter data for convenience
         * and easy reuse. When you also do that, be careful to not overlap with Matter-Server own contexts
         * (so maybe better not ;-)).
         */

        this.commissioningController = new CommissioningController({
            autoConnect: false,
        });

        this.matterServer?.addCommissioningController(this.commissioningController, { uniqueStorageKey: this.parameters.uuid });
    }

    initEventHandlers(originalNodeId: NodeId | null, options?: any): any {
        return Object.assign(options || {}, {
            attributeChangedCallback: (peerNodeId: NodeId, { path: { nodeId, clusterId, endpointId, attributeName }, value }: any) => {
                this.adapter.log.debug(
                    `attributeChangedCallback ${peerNodeId}: Attribute ${nodeId}/${endpointId}/${clusterId}/${attributeName} changed to ${Logger.toJSON(
                        value,
                    )}`,
                )
            },
            eventTriggeredCallback: (peerNodeId: NodeId, { path: { nodeId, clusterId, endpointId, eventName }, events }: any) => {
                this.adapter.log.debug(
                    `eventTriggeredCallback ${peerNodeId}: Event ${nodeId}/${endpointId}/${clusterId}/${eventName} triggered with ${Logger.toJSON(
                        events,
                    )}`,
                );
            },
            stateInformationCallback: async (peerNodeId: NodeId, info: NodeStateInformation) => {
                const jsonNodeId = peerNodeId.toString();
                const node = this.commissioningController?.getConnectedNode(peerNodeId);
                const device: Device | undefined = this.devices.find(device => device.nodeId === jsonNodeId);
                if (this.connected[jsonNodeId] !== undefined) {
                    if (node?.isConnected && !this.connected[jsonNodeId]) {
                        this.connected[jsonNodeId] = true;
                        // Rebuild node structure
                        await this.nodeToIoBrokerStructure(node);
                    } else if (!node?.isConnected && this.connected[jsonNodeId]) {
                        this.connected[jsonNodeId] = false;
                    }
                }

                if (device) {
                    device.connectionStateId && (await this.adapter.setStateAsync(device.connectionStateId, info === NodeStateInformation.Connected, true));
                    device.connectionStatusId && (await this.adapter.setStateAsync(device.connectionStatusId, info, true));
                } else {
                    this.adapter.log.warn(`Device ${jsonNodeId} not found`);
                    // delayed state
                    this.delayedStates[jsonNodeId] = info;
                }

                switch (info) {
                    case NodeStateInformation.Connected:
                        this.adapter.log.debug(`stateInformationCallback ${peerNodeId}: Node ${originalNodeId} connected`);
                        break;
                    case NodeStateInformation.Disconnected:
                        this.adapter.log.debug(`stateInformationCallback ${peerNodeId}: Node ${originalNodeId} disconnected`);
                        break;
                    case NodeStateInformation.Reconnecting:
                        this.adapter.log.debug(`stateInformationCallback ${peerNodeId}: Node ${originalNodeId} reconnecting`);
                        break;
                    case NodeStateInformation.WaitingForDeviceDiscovery:
                        this.adapter.log.debug(
                            `stateInformationCallback ${peerNodeId}: Node ${originalNodeId} waiting for device discovery`,
                        );
                        break;
                    case NodeStateInformation.StructureChanged:
                        this.adapter.log.debug(`stateInformationCallback ${peerNodeId}: Node ${originalNodeId} structure changed`);
                        break;
                }
            },
        });
    }

    async start(): Promise<void> {
        if (!this.commissioningController) {
            throw new Error('CommissioningController not initialized');
        }
        // get nodes
        const nodes = this.commissioningController.getCommissionedNodes();

        // attach all nodes to the controller
        for (const nodeId of nodes) {
            try {
                const node = await this.commissioningController.connectNode(nodeId, this.initEventHandlers(nodeId) as CommissioningControllerNodeOptions);
                this.matterNodeIds.push(nodeId);
                await this.nodeToIoBrokerStructure(node);
            } catch (error) {
                this.adapter.log.debug(`Failed to connect node ${nodeId}: ${error}`);
            }
        }
    }

    getAttributeServerValue(attribute: AnyAttributeServer<any>) {
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

    logClusterServer(nodeId: NodeId, clusterServer: ClusterServerObj<any, any>, level: number) {
        const featureMap = clusterServer.attributes.featureMap?.getLocal() ?? {};
        const globalAttributes = GlobalAttributes<any>(featureMap);
        const supportedFeatures = new Array<string>();
        for (const featureName in featureMap) {
            if ((featureMap as any)[featureName] === true) {
                supportedFeatures.push(featureName);
            }
        }
        this.adapter.log.debug(
            `${''.padStart(level * 2)}Cluster-Server "${clusterServer.name}" (${toHexString(clusterServer.id)}) ${
                supportedFeatures.length ? `(Features: ${supportedFeatures.join(", ")})` : ''
            }`);
        this.adapter.log.debug(`${''.padStart(level * 2 + 2)}Global-Attributes:`);
        for (const attributeName in globalAttributes) {
            const attribute = clusterServer.attributes[attributeName];
            if (attribute === undefined) {
                continue;
            }

            const value = this.getAttributeServerValue(attribute);
            this.adapter.log.debug(
                `${''.padStart(level * 2 + 4)}"${attribute.name}" (${toHexString(attribute.id)})${value !== '' ? `: value = ${value}` : ''}`,
            );
        }

        this.adapter.log.debug(`${''.padStart(level * 2 + 2)}Cluster-Attributes:`);
        for (const attributeName in clusterServer.attributes) {
            if (attributeName in globalAttributes) {
                continue;
            }
            const attribute = clusterServer.attributes[attributeName];
            if (attribute === undefined) {
                continue;
            }

            const value = this.getAttributeServerValue(attribute);
            this.adapter.log.debug(
                `${''.padStart(level * 2 + 4)}"${attribute.name}" (${toHexString(attribute.id)})${value !== '' ? `: value = ${value}` : ''}`,
            );
        }

        this.adapter.log.debug(`${''.padStart(level * 2 + 2)}Commands:`);
        const commands = asClusterServerInternal(clusterServer)._commands;
        for (const commandName in commands) {
            const command = commands[commandName];
            if (command === undefined) continue;
            this.adapter.log.debug(`${''.padStart(level * 2 + 4)}"${command.name}" (${toHexString(command.invokeId)}/${command.responseId})`);
        }

        this.adapter.log.debug(`${''.padStart(level * 2 + 2)}Events:`);
        const events = asClusterServerInternal(clusterServer)._events;
        for (const eventName in events) {
            const event = events[eventName];
            if (event === undefined) continue;
            this.adapter.log.debug(`${''.padStart(level * 2 + 4)}"${event.name}" (${toHexString(event.id)})`);
        }
    }

    async logClusterClient(nodeId: NodeId, clusterClient: any, level: number) {
        const { supportedFeatures: features } = clusterClient;
        const globalAttributes = GlobalAttributes(features);
        const supportedFeatures = [];
        for (const featureName in features) {
            if (features[featureName] === true) {
                supportedFeatures.push(featureName);
            }
        }
        // const id = `controller.${Logger.toJSON(nodeId).replace(/"/g, '')}.${clusterClient.name}`;
        // let channelObj = await this.adapter.getObjectAsync(id);
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
        //     await this.adapter.setObjectAsync(channelObj._id, channelObj);
        // }

        this.adapter.log.debug(
            `${''.padStart(level * 2)}Cluster-Client "${clusterClient.name}" (${toHexString(clusterClient.id)}) ${supportedFeatures.length ? `(Features: ${supportedFeatures.join(", ")})` : ""}`
        );
        this.adapter.log.debug(`${''.padStart(level * 2 + 2)}Global-Attributes:`);
        for (const attributeName in globalAttributes) {
            const attribute = clusterClient.attributes[attributeName];
            if (attribute === void 0) {
                continue;
            }

            this.adapter.log.debug(`${''.padStart(level * 2 + 4)}"${attribute.name}" (${toHexString(attribute.id)}) = ${this.getAttributeServerValue(attribute)}`);
        }

        this.adapter.log.debug(`${''.padStart(level * 2 + 2)}Attributes:`);
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
            this.adapter.log.debug(`${''.padStart(level * 2 + 4)}"${attribute.name}" (${toHexString(attribute.id)}) = ${this.getAttributeServerValue(attribute)}`);
        }

        this.adapter.log.debug(`${''.padStart(level * 2 + 2)}Commands:`);
        for (const commandName in clusterClient.commands) {
            this.adapter.log.debug(`${''.padStart(level * 2 + 4)}"${commandName}"`);
        }

        this.adapter.log.debug(`${''.padStart(level * 2 + 2)}Events:`);
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
            this.adapter.log.debug(`${''.padStart(level * 2 + 4)}"${event.name}" (${toHexString(event.id)})`);
        }
    }

    async nodeToIoBrokerStructure(nodeObject: PairedNode): Promise<void> {
        const nodeIdString = nodeObject.nodeId.toString();

        // find and destroy the old device
        const oldNodeIndex = this.devices.findIndex(device => device.nodeId === nodeIdString);
        if (oldNodeIndex !== -1) {
            for (let c = 0; c < this.devices[oldNodeIndex].clusters.length; c++) {
                await this.devices[oldNodeIndex].clusters[c].destroy();
            }
            this.devices.splice(oldNodeIndex, 1);
        }

        const rootEndpoint = nodeObject.getDeviceById(0); // later use getRootEndpoint
        if (rootEndpoint === void 0) {
            this.adapter.log.debug(`Node ${nodeObject.nodeId} has not yet been initialized!`);
        } else {
            // create device
            const id = `controller.${nodeIdString}`;
            let deviceObj = await this.adapter.getObjectAsync(id);
            let changed = false;
            if (!deviceObj) {
                changed = true;
                deviceObj = {
                    _id: id,
                    type: 'folder',
                    common: {
                        name: nodeIdString,
                        statusStates: {
                            onlineId: 'info.connection',
                        },
                    },
                    native: {
                        nodeId: nodeIdString,
                    },
                };
                await this.adapter.setObjectAsync(deviceObj._id, deviceObj);
            }

            const device: Device = {
                nodeId: nodeIdString,
                clusters: [],
            };

            this.devices.push(device);

            const infoId = `controller.${nodeIdString}.info`;
            let infoObj = await this.adapter.getObjectAsync(infoId);
            if (!infoObj) {
                infoObj = {
                    _id: infoId,
                    type: 'channel',
                    common: {
                        name: 'Connection info',
                    },
                    native: {

                    },
                };
                await this.adapter.setObjectAsync(infoObj._id, infoObj);
            }

            const infoConnectionId = `controller.${nodeIdString}.info.connection`;
            let infoConnectionObj = await this.adapter.getObjectAsync(infoConnectionId);
            if (!infoConnectionObj) {
                infoConnectionObj = {
                    _id: infoConnectionId,
                    type: 'state',
                    common: {
                        name: 'Connected',
                        role: 'indicator.connected',
                        type: 'boolean',
                        read: true,
                        write: false,
                    },
                    native: {

                    },
                };
                await this.adapter.setObjectAsync(infoConnectionObj._id, infoConnectionObj);
            }
            device.connectionStateId = infoConnectionId;

            const infoStatusId = `controller.${nodeIdString}.info.status`;
            let infoStatusObj = await this.adapter.getObjectAsync(infoStatusId);
            if (!infoStatusObj) {
                infoStatusObj = {
                    _id: infoStatusId,
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
                    native: {

                    },
                };
                await this.adapter.setObjectAsync(infoStatusObj._id, infoStatusObj);
            }
            device.connectionStatusId = infoStatusId;
            if (this.delayedStates[nodeIdString] !== undefined) {
                await this.adapter.setStateAsync(infoConnectionId, this.delayedStates[nodeIdString] === NodeStateInformation.Connected, true);
                await this.adapter.setStateAsync(infoStatusId, this.delayedStates[nodeIdString], true);
                delete this.delayedStates[nodeIdString];
            }

            // Example to initialize a ClusterClient and access concrete fields as API methods
            // const descriptor = nodeObject.getRootClusterClient(DescriptorCluster);
            // if (descriptor !== undefined) {
            //     console.log(await descriptor.attributes.deviceTypeList.get()); // you can call that way
            //     console.log(await descriptor.getServerListAttribute()); // or more convenient that way
            // } else {
            //     console.log("No Descriptor Cluster found. This should never happen!");
            // }

            // Example to subscribe to a field and get the value
            const info = nodeObject.getRootClusterClient(BasicInformationCluster);
            if (info !== undefined) {
                const name = await info.getProductNameAttribute(); // This call is executed remotely
                if (deviceObj.common.name !== name) {
                    changed = true;
                    deviceObj.common.name = name;
                }

                // todo: iterate here over all attributes in info
            }

            if (changed) {
                await this.adapter.setObjectAsync(deviceObj._id, deviceObj);
            }

            await this.endPointToIoBrokerStructure(nodeObject.nodeId, rootEndpoint, 0, [], device);
        }
    }

    addCluster(device: Device, cluster: Base | undefined) {
        if (cluster) {
            device.clusters.push(cluster);
        }
    }

    async endPointToIoBrokerStructure(nodeId: NodeId, endpoint: Endpoint, level: number, path: number[], device: Device): Promise<void> {
        this.adapter.log.info(`${''.padStart(level * 2)}Endpoint ${endpoint.id} (${endpoint.name}):`);
        if (level) {
            for (let f = 0; f < Factories.length; f++) {
                this.addCluster(device, await Factories[f](this.adapter, nodeId, endpoint, path));
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
        if (!this.commissioningServer) {
            return;
        }
    }

    async commissionDevice(qrCode: string | undefined, manualCode: string | undefined, device: CommissionableDevice): Promise<AddDeviceResult | null> {
        if (!this.commissioningController) {
            return null;
        }
        const commissioningOptions: CommissioningOptions = {
            regulatoryLocation: GeneralCommissioning.RegulatoryLocationType.IndoorOutdoor,
            regulatoryCountryCode: 'XX',
        };
        if (this.parameters.ble) {
            if (this.parameters.wifiSSID && this.parameters.wifiPasword) {
                this.adapter.log.debug(`Registering Commissioning over BLE with WiFi: ${this.parameters.wifiSSID}`);
                commissioningOptions.wifiNetwork = {
                    wifiSsid: this.parameters.wifiSSID,
                    wifiCredentials: this.parameters.wifiPasword,
                };
            }
            if (this.parameters.threadNetworkname !== undefined && this.parameters.threadOperationalDataSet !== undefined) {
                this.adapter.log.debug(`Registering Commissioning over BLE with Thread: ${this.parameters.threadNetworkname}`);
                commissioningOptions.threadNetwork = {
                    networkName: this.parameters.threadNetworkname,
                    operationalDataset: this.parameters.threadOperationalDataSet,
                };
            }
        }

        let passcode: number | undefined;
        let shortDiscriminator: number | undefined;
        let longDiscriminator: number | undefined;
        if (manualCode) {
            const pairingCodeCodec = ManualPairingCodeCodec.decode(manualCode);
            shortDiscriminator = pairingCodeCodec.shortDiscriminator;
            longDiscriminator = undefined;
            passcode = pairingCodeCodec.passcode;
        } else if (qrCode) {
            const pairingCodeCodec = QrPairingCodeCodec.decode(qrCode);
            longDiscriminator = pairingCodeCodec.discriminator;
            shortDiscriminator = undefined;
            passcode = pairingCodeCodec.passcode;
        }
        if (device) {
            longDiscriminator = undefined;
            shortDiscriminator = undefined;
        }

        const options = this.initEventHandlers(null, {
            commissioning: commissioningOptions,
            discovery: {
                commissionableDevice: device || undefined,
                identifierData: longDiscriminator !== undefined
                    ? {longDiscriminator}
                    : shortDiscriminator !== undefined
                        ? {shortDiscriminator}
                        : undefined,
            },
            passcode,
        }) as NodeCommissioningOptions;

        // this.adapter.log.debug(`Commissioning ... ${JSON.stringify(options)}`);
        try {
            const nodeObject = await this.commissioningController.commissionNode(options);
            this.matterNodeIds.push(nodeObject.nodeId);

            await this.nodeToIoBrokerStructure(nodeObject);

            this.adapter.log.debug(`Commissioning successfully done with nodeId ${nodeObject.nodeId}`);
            return { result: true, nodeId: nodeObject.nodeId.toString() };
        } catch (error) {
            this.adapter.log.debug(`Commissioning failed: ${error}`);
            return { error, result: false };
        }
    }

    async discovery(): Promise<CommissionableDevice[] | null> {
        if (!this.commissioningController) {
            return null;
        }
        this.adapter.log.info(`Start the discovering...`);
        const result = await this.commissioningController.discoverCommissionableDevices(
            {},
            {
                ble: false,
                onIpNetwork: true,
            },
            device => {
                this.adapter.log.debug(`Found: ${Logger.toJSON(device)}`);
                this.adapter.sendToGui({
                    command: 'discoveredDevice',
                    device,
                })
            },
            60, // timeoutSeconds
        );
        this.adapter.log.info(`Discovering stopped. Found ${result.length} devices.`);
        return result;
    }

    async showNewCommissioningCode(nodeId: NodeId): Promise<{
        manualPairingCode: string;
        qrPairingCode: string;
    } | null> {
        if (!this.commissioningController) {
            return null;
        }
        const node = this.commissioningController.getConnectedNode(nodeId);
        if (node) {
            return await node.openEnhancedCommissioningWindow();
        }
        return null;
    }

    async stop(): Promise<void> {
        for (let d = 0; d < this.devices.length; d++) {
            for (let c = 0; c < this.devices[d].clusters.length; c++) {
                await this.devices[d].clusters[c].destroy();
            }
        }

        this.devices = [];

        if (this.commissioningController) {
            this.matterServer?.removeCommissioningController(this.commissioningController);
            this.commissioningController = null;
        }
    }
}

export default Controller;