import {
    CommissioningController,
    CommissioningServer,
    MatterServer,
    NodeCommissioningOptions,
} from '@project-chip/matter-node.js';
import { NodeId } from '@project-chip/matter-node.js/datatype';
import { Endpoint } from '@project-chip/matter-node.js/device';
import { toHexString } from '@project-chip/matter-node.js/util';
import {
    asClusterServerInternal,
    ClusterServerObj,
    GlobalAttributes,
    AnyAttributeServer, FabricScopeError,

} from '@project-chip/matter-node.js/cluster';
// import { EventClient } from '@project-chip/matter-node.js/cluster';
import { CommissionableDevice } from '@project-chip/matter-node.js/common';

import { ManualPairingCodeCodec, QrPairingCodeCodec } from '@project-chip/matter-node.js/schema';
import { NodeStateInformation } from '@project-chip/matter-node.js/device';
import { Logger } from '@project-chip/matter-node.js/log';

import { CommissioningOptions } from '@project-chip/matter-node.js/protocol';
import {
    GeneralCommissioning,
} from '@project-chip/matter-node.js/cluster';

import { MatterAdapter } from '../main';

export interface ControllerCreateOptions {
    adapter: MatterAdapter;
    matterServer: MatterServer;
    controllerOptions: ControllerOptions;
}

export interface ControllerOptions {
    ble?: boolean;
    uuid: string;
}

interface AddDeviceResult {
    result: boolean;
    error?: Error;
    nodeId?: string;
}

class Controller {
    private matterServer: MatterServer | undefined;
    private parameters: ControllerOptions;
    private commissioningServer: CommissioningServer | undefined;
    private adapter: MatterAdapter;
    private commissioningController: CommissioningController | null = null;
    private matterNodeIds: NodeId[] = [];

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
        const uniqueStorageKey = this.parameters.uuid.replace(/-/g, '').split('.').pop() || '0000000000000000';

        this.matterServer?.addCommissioningController(this.commissioningController, { uniqueStorageKey });
    }

    async start(): Promise<void> {
        if (!this.commissioningController) {
            throw new Error('CommissioningController not initialized');
        }
        // get nodes
        const nodes = this.commissioningController.getCommissionedNodes();

        // attach all nodes to the controller
        for (const nodeId of nodes) {
            const node = await this.commissioningController.connectNode(nodeId, {
                attributeChangedCallback: (
                    peerNodeId,
                    { path: { nodeId, clusterId, endpointId, attributeName }, value },
                ) =>
                    console.log(
                        `attributeChangedCallback ${peerNodeId}: Attribute ${nodeId}/${endpointId}/${clusterId}/${attributeName} changed to ${Logger.toJSON(
                            value,
                        )}`,
                    ),
                eventTriggeredCallback: (peerNodeId, { path: { nodeId, clusterId, endpointId, eventName }, events }) =>
                    console.log(
                        `eventTriggeredCallback ${peerNodeId}: Event ${nodeId}/${endpointId}/${clusterId}/${eventName} triggered with ${Logger.toJSON(
                            events,
                        )}`,
                    ),
                stateInformationCallback: (peerNodeId, info) => {
                    switch (info) {
                        case NodeStateInformation.Connected:
                            console.log(`stateInformationCallback ${peerNodeId}: Node ${nodeId} connected`);
                            break;
                        case NodeStateInformation.Disconnected:
                            console.log(`stateInformationCallback ${peerNodeId}: Node ${nodeId} disconnected`);
                            break;
                        case NodeStateInformation.Reconnecting:
                            console.log(`stateInformationCallback ${peerNodeId}: Node ${nodeId} reconnecting`);
                            break;
                        case NodeStateInformation.WaitingForDeviceDiscovery:
                            console.log(
                                `stateInformationCallback ${peerNodeId}: Node ${nodeId} waiting for device discovery`,
                            );
                            break;
                        case NodeStateInformation.StructureChanged:
                            console.log(`stateInformationCallback ${peerNodeId}: Node ${nodeId} structure changed`);
                            break;
                    }
                },
            });

            this.matterNodeIds.push(nodeId);

            const rootEndpoint = node.getDeviceById(0);
            if (rootEndpoint === void 0) {
                this.adapter.log.debug(`Node ${nodeId} has not yet been initialized!`);
                return;
            }
            this.endPointToIoBrokerStructure(rootEndpoint);
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

    logClusterServer(clusterServer: ClusterServerObj<any, any>) {
        const featureMap = clusterServer.attributes.featureMap?.getLocal() ?? {};
        const globalAttributes = GlobalAttributes<any>(featureMap);
        const supportedFeatures = new Array<string>();
        for (const featureName in featureMap) {
            if ((featureMap as any)[featureName] === true) supportedFeatures.push(featureName);
        }
        this.adapter.log.debug(
            `Cluster-Server "${clusterServer.name}" (${toHexString(clusterServer.id)}) ${
                supportedFeatures.length ? `(Features: ${supportedFeatures.join(", ")})` : ''
            }`);

        for (const attributeName in globalAttributes) {
            const attribute = clusterServer.attributes[attributeName];
            if (attribute === undefined) {
                continue;
            }

            const value = this.getAttributeServerValue(attribute);
            this.adapter.log.debug(
                `"${attribute.name}" (${toHexString(attribute.id)})${value !== '' ? `: value = ${value}` : ''}`,
            );
        }

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
                `"${attribute.name}" (${toHexString(attribute.id)})${value !== '' ? `: value = ${value}` : ''}`,
            );
        }

        const commands = asClusterServerInternal(clusterServer)._commands;
        for (const commandName in commands) {
            const command = commands[commandName];
            if (command === undefined) continue;
            this.adapter.log.debug(`"${command.name}" (${toHexString(command.invokeId)}/${command.responseId})`);
        }

        const events = asClusterServerInternal(clusterServer)._events;
        for (const eventName in events) {
            const event = events[eventName];
            if (event === undefined) continue;
            this.adapter.log.debug(`"${event.name}" (${toHexString(event.id)})`);
        }
    }

    logClusterClient(endpoint: Endpoint, clusterClient: any) {
        const { supportedFeatures: features } = clusterClient;
        const globalAttributes = GlobalAttributes(features);
        const supportedFeatures = [];
        for (const featureName in features) {
            if (features[featureName] === true) {
                supportedFeatures.push(featureName);
            }
        }
        this.adapter.log.debug(
            `Cluster-Client "${clusterClient.name}" (${toHexString(clusterClient.id)}) ${supportedFeatures.length ? `(Features: ${supportedFeatures.join(", ")})` : ""}`
        );
        this.adapter.log.debug("Global-Attributes:");
        for (const attributeName in globalAttributes) {
            const attribute = clusterClient.attributes[attributeName];
            if (attribute === void 0) {
                continue;
            }
            this.adapter.log.debug(`"${attribute.name}" (${toHexString(attribute.id)})`);
        }

        this.adapter.log.debug("Attributes:");
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
            // this.adapter.log.debug(`"${attribute.name}" (${toHexString(attribute.id)})${info}`);
        }

        this.adapter.log.debug("Commands:");
        for (const commandName in clusterClient.commands) {
            this.adapter.log.debug(`"${commandName}"`);
        }

        this.adapter.log.debug('Events:');
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
            // this.adapter.log.debug(`"${event.name}" (${toHexString(event.id)})${info}`);
        }
    }

    endPointToIoBrokerStructure(endpoint: Endpoint): void {
        this.adapter.log.info(`Endpoint ${endpoint.id} (${endpoint.name}):`);
        for (const clusterServer of endpoint.getAllClusterServers()) {
            this.logClusterServer(clusterServer);
        }

        for (const clusterClient of endpoint.getAllClusterClients()) {
             this.logClusterClient(endpoint, clusterClient);
        }

        for (const childEndpoint of endpoint.getChildEndpoints()) {
            this.endPointToIoBrokerStructure(childEndpoint);
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
        // if (hasParameter("ble")) {
        //     const wifiSsid = getParameter("ble-wifi-ssid");
        //     const wifiCredentials = getParameter("ble-wifi-credentials");
        //     const threadNetworkName = getParameter("ble-thread-networkname");
        //     const threadOperationalDataset = getParameter("ble-thread-operationaldataset");
        //     if (wifiSsid !== undefined && wifiCredentials !== undefined) {
        //         this.adapter.log.debug(`Registering Commissioning over BLE with WiFi: ${wifiSsid}`);
        //         commissioningOptions.wifiNetwork = {
        //             wifiSsid: wifiSsid,
        //             wifiCredentials: wifiCredentials,
        //         };
        //     }
        //     if (threadNetworkName !== undefined && threadOperationalDataset !== undefined) {
        //         this.adapter.log.debug(`Registering Commissioning over BLE with Thread: ${threadNetworkName}`);
        //         commissioningOptions.threadNetwork = {
        //             networkName: threadNetworkName,
        //             operationalDataset: threadOperationalDataset,
        //         };
        //     }
        // }

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

        const options = {
            commissioning: commissioningOptions,
            discovery: {
                commissionableDevice: device || undefined,
                identifierData: longDiscriminator !== undefined
                        ? { longDiscriminator }
                        : shortDiscriminator !== undefined
                            ? { shortDiscriminator }
                            : undefined,
            },
            passcode,
            attributeChangedCallback: (peerNodeId, { path: { nodeId, clusterId, endpointId, attributeName }, value }) =>
                console.log(
                    `attributeChangedCallback ${peerNodeId}: Attribute ${nodeId}/${endpointId}/${clusterId}/${attributeName} changed to ${Logger.toJSON(value)}`,
                ),
            eventTriggeredCallback: (peerNodeId, { path: { nodeId, clusterId, endpointId, eventName }, events }) =>
                console.log(
                    `eventTriggeredCallback ${peerNodeId}: Event ${nodeId}/${endpointId}/${clusterId}/${eventName} triggered with ${Logger.toJSON(events)}`,
                ),
            stateInformationCallback: (peerNodeId, info) => {
                switch (info) {
                    case NodeStateInformation.Connected:
                        console.log(`stateInformationCallback Node ${peerNodeId} connected`);
                        break;
                    case NodeStateInformation.Disconnected:
                        console.log(`stateInformationCallback Node ${peerNodeId} disconnected`);
                        break;
                    case NodeStateInformation.Reconnecting:
                        console.log(`stateInformationCallback Node ${peerNodeId} reconnecting`);
                        break;
                    case NodeStateInformation.WaitingForDeviceDiscovery:
                        console.log(
                            `stateInformationCallback Node ${peerNodeId} waiting that device gets discovered again`,
                        );
                        break;
                    case NodeStateInformation.StructureChanged:
                        console.log(`stateInformationCallback Node ${peerNodeId} structure changed`);
                        break;
                }
            },
        } as NodeCommissioningOptions;

        // this.adapter.log.debug(`Commissioning ... ${JSON.stringify(options)}`);
        try {
            const nodeObject = await this.commissioningController.commissionNode(options);
            this.matterNodeIds.push(nodeObject.nodeId);

            const rootEndpoint = nodeObject.getDeviceById(0);
            if (rootEndpoint === void 0) {
                this.adapter.log.debug(`Node ${nodeObject.nodeId} has not yet been initialized!`);
            } else {
                this.endPointToIoBrokerStructure(rootEndpoint);
            }

            console.log(`Commissioning successfully done with nodeId ${nodeObject.nodeId}`);
            return { result: true, nodeId: Logger.toJSON(nodeObject.nodeId) };
        } catch (error) {
            console.log(`Commissioning failed: ${error}`);
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
        if (this.commissioningController) {
            this.matterServer?.removeCommissioningController(this.commissioningController);
            this.commissioningController = null;
        }
    }
}

export default Controller;