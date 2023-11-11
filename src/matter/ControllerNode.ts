import {
    CommissioningController,
    CommissioningServer,
    MatterServer,
    NodeCommissioningOptions,
} from '@project-chip/matter-node.js';
import { CommissionableDevice } from '@project-chip/matter-node.js/common';
import { NodeId } from '@project-chip/matter-node.js/datatype';

import { ManualPairingCodeCodec, QrPairingCodeCodec } from '@project-chip/matter-node.js/schema';
import { NodeStateInformation } from '@project-chip/matter-node.js/device';
import { Logger } from '@project-chip/matter-node.js/log';

import { CommissioningOptions } from '@project-chip/matter-node.js/protocol';
import {
    GeneralCommissioning,
    OnOffCluster,
} from "@project-chip/matter-node.js/cluster";
import { VendorId } from '@project-chip/matter-node.js/datatype';
import { DeviceTypes } from '@project-chip/matter-node.js/device';

import { GenericDevice } from '../lib';
import { DeviceDescription } from '../ioBrokerStorageTypes';

import matterDeviceFactory from './matterFactory';
import VENDOR_IDS from './vendorIds';
import { NodeStateResponse, NodeStates } from './BridgedDevicesNode';
import { MatterAdapter } from '../main';

export interface ControllerCreateOptions {
    adapter: MatterAdapter;
    parameters: ControllerOptions,
    matterServer: MatterServer;
    controllerOptions: ControllerOptions;
}

export interface ControllerOptions {
    ble?: boolean;
}

class Controller {
    private matterServer: MatterServer | undefined;
    private parameters: ControllerOptions;
    private commissioningServer: CommissioningServer | undefined;
    private adapter: MatterAdapter;
    private commissioned: boolean | null = null;
    private commissioningController: CommissioningController | null = null;
    private matterNodeIds: NodeId[] = [];

    constructor(options: ControllerCreateOptions) {
        this.adapter = options.adapter;
        this.parameters = options.parameters;
        this.matterServer = options.matterServer;
    }

    async init(): Promise<void> {
        const commissionedObj = await this.adapter.getObjectAsync(`devices.${this.parameters.uuid}.commissioned`);
        if (!commissionedObj) {
            await this.adapter.setObjectAsync(`devices.${this.parameters.uuid}.commissioned`, {
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
        }

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
        const deviceName = this.parameters.devicename || 'Matter device';
        const deviceType = DeviceTypes.AGGREGATOR.code;
        const vendorName = 'ioBroker';
        const passcode = this.parameters.passcode; // 20202021;
        const discriminator = this.parameters.discriminator; // 3840);

        // product name / id and vendor id should match what is in the device certificate
        const vendorId = this.parameters.vendorid;// 0xfff1;
        const productName = `ioBroker OnOff-Bridge`;
        const productId = this.parameters.productid; // 0x8000;

        const port = 5540;

        const uniqueId = this.parameters.uuid.replace(/-/g, '').split('.').pop() || '0000000000000000';

        const commissioningOptions: CommissioningOptions = {
            regulatoryLocation: GeneralCommissioning.RegulatoryLocationType.IndoorOutdoor,
            regulatoryCountryCode: 'XX',
        };
        // if (this.controllerOptions?.ble) {
        //     const wifiSsid = getParameter("ble-wifi-ssid");
        //     const wifiCredentials = getParameter("ble-wifi-credentials");
        //     const threadNetworkName = getParameter("ble-thread-networkname");
        //     const threadOperationalDataset = getParameter("ble-thread-operationaldataset");
        //     if (wifiSsid !== undefined && wifiCredentials !== undefined) {
        //         logger.info(`Registering Commissioning over BLE with WiFi: ${wifiSsid}`);
        //         commissioningOptions.wifiNetwork = {
        //             wifiSsid: wifiSsid,
        //             wifiCredentials: wifiCredentials,
        //         };
        //     }
        //     if (threadNetworkName !== undefined && threadOperationalDataset !== undefined) {
        //         logger.info(`Registering Commissioning over BLE with Thread: ${threadNetworkName}`);
        //         commissioningOptions.threadNetwork = {
        //             networkName: threadNetworkName,
        //             operationalDataset: threadOperationalDataset,
        //         };
        //     }
        // }


        this.commissioningController = new CommissioningController({
            autoConnect: false,
        });

        this.matterServer?.addCommissioningController(this.commissioningController);
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
                this.adapter.log.debug(`Node ${this.nodeId} has not yet been initialized!`);
                return;
            }
            logEndpoint(rootEndpoint);
        }

    }

    _endPointToIoBrokerStructure(endpoint: Endpoint): void {
        this.adapter.log.info(`Endpoint ${endpoint.id} (${endpoint.name}):`);
        for (const clusterServer of endpoint.getAllClusterServers()) {
            this.logClusterServer(endpoint, clusterServer);
        }

        // for (const clusterClient of endpoint.getAllClusterClients()) {
        //     this.logClusterClient(endpoint, clusterClient, options);
        // }

        for (const childEndpoint of endpoint.getChildEndpoints()) {
            this._endPointToIoBrokerStructure(childEndpoint);
        }
    }

    async getState(): Promise<NodeStateResponse> {
        if (!this.commissioningServer) {
            return {
                status: NodeStates.Creating,
            };
        }
        /**
         * Print Pairing Information
         *
         * If the device is not already commissioned (this info is stored in the storage system) then get and print the
         * pairing details. This includes the QR code that can be scanned by the Matter app to pair the device.
         */

        // this.adapter.log.info('Listening');

        if (!this.commissioningServer.isCommissioned()) {
            if (this.commissioned !== false) {
                this.commissioned = false;
                await this.adapter.setStateAsync(`devices.${this.parameters.uuid}.commissioned`, this.commissioned, true);
            }
            const pairingData = this.commissioningServer.getPairingCode();
            // const { qrPairingCode, manualPairingCode } = pairingData;
            // console.log(QrCode.encode(qrPairingCode));
            // console.log(
            //     `QR Code URL: https://project-chip.github.io/connectedhomeip/qrcode.html?data=${qrPairingCode}`,
            // );
            // console.log(`Manual pairing code: ${manualPairingCode}`);
            return {
                status: NodeStates.WaitingForCommissioning,
                qrPairingCode: pairingData.qrPairingCode,
                manualPairingCode: pairingData.manualPairingCode,
            };
        } else {
            if (this.commissioned !== true) {
                this.commissioned = true;
                await this.adapter.setStateAsync(`devices.${this.parameters.uuid}.commissioned`, this.commissioned, true);
            }

            const activeSession = this.commissioningServer.getActiveSessionInformation();
            const fabric = this.commissioningServer.getCommissionedFabricInformation();

            const connectionInfo: any = activeSession.map(session => {
                const vendorId = session?.fabric?.rootVendorId;
                return {
                    vendor: (vendorId && VENDOR_IDS[vendorId]) || `0x${(vendorId || 0).toString(16)}`,
                    connected: !!session.numberOfActiveSubscriptions,
                    label: session?.fabric?.label,
                };
            });

            fabric.forEach(fabric => {
                if (!activeSession.find(session => session.fabric?.fabricId === fabric.fabricId)) {
                    connectionInfo.push({
                        vendor: VENDOR_IDS[fabric?.rootVendorId] || `0x${(fabric?.rootVendorId || 0).toString(16)}`,
                        connected: false,
                        label: fabric?.label,
                    });
                }
            });

            if (connectionInfo.find((info: any) => info.connected)) {
                console.log('Controller is already commissioned and connected with controller');
                return {
                    status: NodeStates.ConnectedWithController,
                    connectionInfo,
                };
            } else {
                console.log('Controller is already commissioned. Waiting for controllers to connect ...');
                return {
                    status: NodeStates.Commissioned,
                    connectionInfo,
                };
            }
        }
    }

    async commissionDevice(qrCode: string, manualCode: string, device: CommissionableDevice): Promise<PairedNode> {
        if (!this.commissioningController) {
            return;
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
        //         logger.info(`Registering Commissioning over BLE with WiFi: ${wifiSsid}`);
        //         commissioningOptions.wifiNetwork = {
        //             wifiSsid: wifiSsid,
        //             wifiCredentials: wifiCredentials,
        //         };
        //     }
        //     if (threadNetworkName !== undefined && threadOperationalDataset !== undefined) {
        //         logger.info(`Registering Commissioning over BLE with Thread: ${threadNetworkName}`);
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

        // logger.info(`Commissioning ... ${JSON.stringify(options)}`);
        const nodeObject = await this.commissioningController.commissionNode(options);
        this.matterNodeIds.push(nodeObject.nodeId);

        console.log(`Commissioning successfully done with nodeId ${nodeObject.nodeId}`);
        return nodeObject;
    }

    async discovery(): Promise<void> {
        if (!this.commissioningController) {
            return;
        }
        const results = await this.commissioningController.discoverCommissionableDevices(
            {},
            {
                ble: false,
                onIpNetwork: true,
            },
            device => {
                // console.log(`Discovered device ${this.adapter.log.debug(`Found: ${Logger.toJSON(device)}`)}`);
            },
            60, // timeoutSeconds
        );
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
        // await this.device.destroy();
    }
}

export default Controller;