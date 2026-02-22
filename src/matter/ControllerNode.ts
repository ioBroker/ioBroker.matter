import type { Endpoint, ServerAddressUdp, SoftwareUpdateInfo } from '@matter/main';
import {
    ObserverGroup,
    SoftwareUpdateManager,
    Diagnostic,
    NodeId,
    VendorId,
    Seconds,
    ClusterId,
    EndpointNumber,
    AttributeId,
} from '@matter/main';
import {
    GeneralCommissioning,
    GeneralDiagnosticsCluster,
    NetworkCommissioning,
    ThreadNetworkDiagnostics,
    WiFiNetworkDiagnosticsCluster,
} from '@matter/main/clusters';
import type {
    PeerAddress,
    CommissionableDevice,
    ControllerCommissioningFlowOptions,
    DiscoveryData,
} from '@matter/main/protocol';
import { CommissioningError, DclOtaUpdateService } from '@matter/main/protocol';
import { ManualPairingCodeCodec, QrPairingCodeCodec, DiscoveryCapabilitiesSchema } from '@matter/main/types';
import { CommissioningController, type NodeCommissioningOptions } from '@project-chip/matter.js';
import {
    NodeStates as PairedNodeStates,
    type CommissioningControllerNodeOptions,
    type PairedNode,
} from '@project-chip/matter.js/device';
import type { MatterAdapter } from '../main';
import type {
    MatterAdapterConfig,
    MatterControllerConfig,
    NetworkGraphData,
    NetworkNodeData,
    NetworkType,
    WiFiDiagnosticsData,
    ThreadDiagnosticsData,
    ThreadNeighborEntry,
    ThreadRouteEntry,
} from '../ioBrokerStorageTypes';
import { GeneralMatterNode, type PairedNodeConfig } from './GeneralMatterNode';
import type { GeneralNode, MessageResponse } from './GeneralNode';
import { inspect } from 'util';
import { createReadStream } from 'fs';
import { readdir, stat, mkdir, unlink } from 'fs/promises';
import { Readable } from 'stream';
import { join } from 'path';
import type { OtaProviderEndpoint } from '@matter/main/endpoints';

export interface ControllerCreateOptions {
    adapter: MatterAdapter;
    controllerOptions: MatterControllerConfig;
    updateCallback: () => void;
    fabricLabel: string;
}

interface AddDeviceResult {
    result: boolean;
    /** The error message */
    error?: string;
    nodeId?: string;
}

// Re-export network types for external use
export type { NetworkGraphData, NetworkNodeData, NetworkType, WiFiDiagnosticsData, ThreadDiagnosticsData };

type EndUserCommissioningOptions = (
    | { qrCode: string }
    | { manualCode: string }
    | { passcode: number; vendorId: number; productId: number; ip: string; port: number }
) & { device: CommissionableDevice };

class Controller implements GeneralNode {
    #parameters: MatterControllerConfig;
    readonly #adapter: MatterAdapter;
    readonly #updateCallback: () => void;
    #fabricLabel: string;
    #commissioningController?: CommissioningController;
    #nodes = new Map<string, GeneralMatterNode>();
    #discovering = false;
    #useBle = false;
    #commissioningStatus = new Map<number, { status: 'finished' | 'error' | 'inprogress'; result?: MessageResponse }>();
    #observers = new ObserverGroup();
    #networkGraphUpdateTimer?: ReturnType<typeof setTimeout>;

    constructor(options: ControllerCreateOptions) {
        const { adapter, controllerOptions, updateCallback, fabricLabel } = options;
        this.#adapter = adapter;
        this.#parameters = controllerOptions;
        this.#updateCallback = updateCallback;
        this.#fabricLabel = fabricLabel;
    }

    get nodes(): Map<string, GeneralMatterNode> {
        return this.#nodes;
    }

    get otaProvider(): Endpoint<OtaProviderEndpoint> | undefined {
        return this.#commissioningController?.otaProvider;
    }

    init(): void {
        if (this.#parameters.ble) {
            if (
                (this.#parameters.wifiSSID && this.#parameters.wifiPassword) ||
                (this.#parameters.threadNetworkName !== undefined &&
                    this.#parameters.threadOperationalDataSet !== undefined)
            ) {
                this.#adapter.matterEnvironment.vars.set('ble.enable', true);
                const hciId = this.#parameters.hciId === undefined ? undefined : parseInt(this.#parameters.hciId);
                if (hciId !== undefined && (hciId < 0 || hciId > 255)) {
                    this.#adapter.matterEnvironment.vars.set('ble.hci.id', hciId);
                }
                this.#useBle = true;
            } else {
                this.#adapter.log.warn(
                    `BLE enabled but no WiFi or Thread configuration provided. BLE will stay disabled.`,
                );
                this.#parameters.ble = false;
            }
        }
        this.applyConfiguration(this.#parameters, true);
    }

    applyConfiguration(config: MatterControllerConfig, isInit = false): MessageResponse {
        const currentConfig: MatterControllerConfig = {
            enabled: true,
            defaultExposeMatterApplicationClusterData: false,
            defaultExposeMatterSystemClusterData: false,
            ...(this.#parameters as Partial<MatterControllerConfig>),
        };

        if (!isInit && (config.ble !== currentConfig.ble || config.hciId !== currentConfig.hciId)) {
            this.#adapter.setTimeout(() => this.#adapter.restart(), 5000);
            // Restart of the adapter needed
            return {
                error: `BLE configuration adjusted. The adapter will restart in 5 seconds.`,
            };
        }
        this.#parameters = config;
        return { result: true };
    }

    async applyPairedNodeConfiguration(nodeId: string, config: PairedNodeConfig, forcedUpdate = false): Promise<void> {
        const node = this.#nodes.get(nodeId);
        if (node === undefined) {
            this.#adapter.log.warn(`Node ${nodeId} not found`);
            return;
        }
        return node.applyConfiguration(config, forcedUpdate);
    }

    async handleCommand(obj: ioBroker.Message): Promise<MessageResponse> {
        if (this.#commissioningController === undefined) {
            return { error: 'Controller is not initialized.' };
        }
        const { command, message } = obj;
        try {
            switch (command) {
                case 'controllerDiscovery':
                    // Discover for Matter devices in the IP and potentially BLE network
                    // Response is handled by method and runs asynchronous
                    await this.#discovery(obj);
                    return;
                case 'controllerDiscoveryStop':
                    // Stop Discovery
                    if (this.#discovering) {
                        await this.#discoveryStop();
                        return { result: 'ok' };
                    }
                    // let's return ok because in fact it is stopped
                    return { result: 'ok' };
                case 'controllerCommissionDevice': {
                    // Commission a new device with Commissioning payloads like a QR Code or pairing code
                    const options = message as EndUserCommissioningOptions;
                    if (message.pollResponse) {
                        const pollingId = Date.now(); // should be good enough
                        this.#commissioningStatus.set(pollingId, { status: 'inprogress' });
                        // We return the pollingId and execute the commissioning async
                        this.commissionDevice(options)
                            .then(result => this.#commissioningStatus.set(pollingId, { status: 'finished', result }))
                            .catch(error => {
                                if (error instanceof CommissioningError) {
                                    // TODO Remove after next matter.js update
                                    if (error.message.startsWith('Commission error for "addNoc": 9,')) {
                                        error.message =
                                            'This device is already paired to this Controller! You can not pair it again.';
                                    }
                                }
                                this.#commissioningStatus.set(pollingId, {
                                    status: 'error',
                                    result: { error: error.message },
                                });
                            })
                            .finally(() => setTimeout(() => this.#commissioningStatus.delete(pollingId), 60 * 60_000));
                        return { result: { pollingId } };
                    }
                    return await this.commissionDevice(options);
                }
                case 'controllerCommissionDeviceStatus': {
                    // Get the status of a commissioning process
                    const pollingId = message.pollingId as number;
                    const status = this.#commissioningStatus.get(pollingId);
                    if (status === undefined) {
                        this.#adapter.log.warn(`No commissioning process with pollingId ${pollingId} found`);
                        return { error: `No commissioning process with pollingId ${pollingId} found.` };
                    }
                    const { status: statusText, result } = status;
                    this.#adapter.log.debug(
                        `Commissioning process with pollingId ${pollingId} is in status ${statusText}`,
                    );
                    if (statusText === 'inprogress') {
                        return { result: { status: statusText } };
                    }
                    return result;
                }
                case 'controllerDeviceQrCode':
                    // Opens a new commissioning window for a paired node and returns the QRCode and pairing code for display
                    return { result: await this.showNewCommissioningCode(message.nodeId) };
                case 'controllerInitializePaseCommissioner': {
                    // Returns the data needed to initialize a PaseCommissioner on the mobile App
                    const { caConfig, fabricData } = this.#commissioningController.paseCommissionerConfig;
                    return {
                        result: {
                            rootCertificateData: caConfig,
                            fabricData,
                        },
                    };
                }
                case 'controllerCompletePaseCommissioning':
                    // Completes a commissioning process that was started by the mobile app in the main controller
                    return await this.completeCommissioningForNode(message.peerNodeId, message.discoveryData);
                case 'controllerCancelUpdate': {
                    // Cancel an ongoing software update for a node
                    const nodeId = message.nodeId as string;
                    const node = this.#nodes.get(nodeId);
                    if (!node) {
                        return { error: `Node ${nodeId} not found` };
                    }
                    await node.cancelSoftwareUpdate();
                    return { result: 'ok' };
                }
                case 'controllerNetworkGraphData': {
                    // Get network graph data for visualization
                    const data = this.getNetworkGraphData();
                    return { result: data };
                }
                case 'controllerRefreshNodeNetworkData': {
                    // Refresh network diagnostics data for specified nodes
                    const nodeIds = message.nodeIds as string[];
                    if (!Array.isArray(nodeIds) || nodeIds.length === 0) {
                        return { error: 'No node IDs provided' };
                    }
                    await this.refreshNodeNetworkData(nodeIds);
                    return { result: 'ok' };
                }
            }
        } catch (error) {
            const errorText = inspect(error, { depth: 10 });
            this.#adapter.log.warn(`Error while executing command "${command}": ${errorText}`);
            return { error: `Error while executing command "${command}": ${error.message}`, result: false };
        }

        return { error: `Unknown command "${command}"` };
    }

    #registerNodeHandlers(node: PairedNode): void {
        node.events.attributeChanged.on(data => {
            this.#nodes
                .get(node.nodeId.toString())
                ?.handleChangedAttribute(data)
                .catch(error => this.#adapter.log.error(`Error handling attribute change: ${error}`));

            // Check if this is a network-relevant attribute change and send update to GUI
            if (this.#isNetworkRelevantCluster(data.path.clusterId)) {
                this.#sendNetworkGraphUpdate();
            }
        });
        node.events.eventTriggered.on(data => {
            this.#nodes
                .get(node.nodeId.toString())
                ?.handleTriggeredEvent(data)
                .catch(error => this.#adapter.log.error(`Error handling event: ${error}`));
        });
        node.events.stateChanged.on((info: PairedNodeStates) => {
            const nodeDetails = (this.#commissioningController?.getCommissionedNodesDetails() ?? []).find(
                n => n.nodeId === node.nodeId,
            );
            const nodeIdStr = node.nodeId.toString();
            const deviceNode = this.#nodes.get(nodeIdStr);
            if (deviceNode) {
                deviceNode.handleStateChange(info, nodeDetails);
            } else {
                if (info !== PairedNodeStates.Disconnected) {
                    this.#adapter.log.info(
                        `Matter node "${nodeIdStr}" not initialized ... Got State change to ${info}`,
                    );
                }
            }
            this.#updateCallback();

            // Send network graph update on connection state changes
            this.#sendNetworkGraphUpdate();
        });
        node.events.structureChanged.on(() => {
            this.#adapter.log.info(`Node "${node.nodeId}" structure changed`);
            this.nodeToIoBrokerStructure(node).then(
                () => this.#updateCallback(),
                error => this.#adapter.log.info(`Error while updating structure: ${error}`),
            );
            this.#updateCallback();
        });
        node.events.decommissioned.on(() => {
            this.#adapter.log.info(`Node "${node.nodeId}" decommissioned`);
            // TODO Delete the node from config and objects
            this.#updateCallback();
        });
        node.events.connectionAlive.on(() => {
            const nodeIdStr = node.nodeId.toString();
            const deviceNode = this.#nodes.get(nodeIdStr);
            if (deviceNode) {
                deviceNode.handleConnectionAlive();
            }
        });
    }

    get nodeConnectSettings(): CommissioningControllerNodeOptions {
        return {
            subscribeMinIntervalFloorSeconds: 1,
            subscribeMaxIntervalCeilingSeconds: undefined,
        };
    }

    async start(): Promise<void> {
        if (this.#commissioningController) {
            throw new Error('CommissioningController already started!');
        }

        this.#commissioningController = new CommissioningController({
            autoConnect: false,
            environment: {
                environment: this.#adapter.matterEnvironment,
                id: 'controller',
            },
            adminFabricLabel: this.#fabricLabel,
            enableOtaProvider: true,
        });

        await this.#adapter.extendObjectAsync('controller.info', {
            type: 'channel',
            common: {
                name: 'Information',
            },
            native: {},
        });

        await this.#adapter.extendObjectAsync('controller.info.discovering', {
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

        try {
            await this.#commissioningController.start();
        } catch (error) {
            const errorText = inspect(error, { depth: 10 });
            this.#adapter.log.error(`Failed to start the controller: ${errorText}`);
            return;
        }

        const nodesDetails = this.#commissioningController.getCommissionedNodesDetails();
        this.#adapter.log.info(
            `Found ${nodesDetails.length} nodes: ${nodesDetails.map(({ nodeId }) => nodeId.toString()).join(', ')}`,
        );
        // attach all nodes to the controller
        for (const details of nodesDetails) {
            const { nodeId } = details;
            try {
                this.#adapter.log.info(`Initializing node "${nodeId}" ...`);
                const node = await this.#commissioningController.getNode(nodeId);
                this.#registerNodeHandlers(node);
                await this.nodeToIoBrokerStructure(node, details, this.nodeConnectSettings);
            } catch (error) {
                this.#adapter.log.info(`Failed to connect to node "${nodeId}": ${error.stack}`);
            }
        }

        this.#observers.on(
            this.#commissioningController.otaProvider.eventsOf(SoftwareUpdateManager).updateAvailable,
            (peerAddress, info) => {
                const nodeIdStr = peerAddress.nodeId.toString();
                const node = this.#nodes.get(nodeIdStr);
                if (node === undefined) {
                    return;
                }
                // Use the new method that persists to state
                node.setSoftwareUpdateAvailable(info);
                // Refresh UI to show the update available icon
                this.#adapter.refreshControllerDevices();
            },
        );
        this.#observers.on(
            this.#commissioningController.otaProvider.eventsOf(SoftwareUpdateManager).updateDone,
            peerAddress => {
                const nodeIdStr = peerAddress.nodeId.toString();
                const node = this.#nodes.get(nodeIdStr);
                if (node === undefined) {
                    return;
                }
                // Use the new method that clears the persisted state
                node.clearSoftwareUpdateAvailable().catch(error => {
                    this.#adapter.log.error(`Error clearing update available state for node ${nodeIdStr}: ${error}`);
                });
                // Notify the node that the update is complete (closes progress dialog)
                node.onSoftwareUpdateComplete(true).catch(error => {
                    this.#adapter.log.error(`Error handling update complete for node ${nodeIdStr}: ${error}`);
                });
                // Refresh UI to remove the update available icon
                this.#adapter.refreshControllerDevices();
            },
        );
        this.#observers.on(
            this.#commissioningController.otaProvider.eventsOf(SoftwareUpdateManager).updateFailed,
            peerAddress => {
                const nodeIdStr = peerAddress.nodeId.toString();
                const node = this.#nodes.get(nodeIdStr);
                if (node === undefined) {
                    return;
                }
                this.#adapter.log.warn(`Software update failed for node ${nodeIdStr}`);
                // Notify the node that the update failed (closes progress dialog, shows error)
                node.onSoftwareUpdateFailed().catch(error => {
                    this.#adapter.log.error(`Error handling update failure for node ${nodeIdStr}: ${error}`);
                });
                // Refresh UI
                this.#adapter.refreshControllerDevices();
            },
        );
    }

    async nodeToIoBrokerStructure(
        node: PairedNode,
        nodeDetails?: { operationalAddress?: string },
        connectOptions?: CommissioningControllerNodeOptions,
    ): Promise<void> {
        const nodeIdStr = node.nodeId.toString();

        // find and clear the old device if existing
        const oldDevice = this.#nodes.get(nodeIdStr);
        await oldDevice?.destroy();

        const device = new GeneralMatterNode(this.#adapter, node, this.#parameters, this.#commissioningController);
        this.#nodes.set(nodeIdStr, device);
        await device.initialize(nodeDetails);
        device.connect(connectOptions);
    }

    async getState(): Promise<void> {
        // nothing to do
    }

    async commissionDevice(data: EndUserCommissioningOptions): Promise<AddDeviceResult> {
        if (!this.#commissioningController) {
            return { error: 'Controller is not activated.', result: false };
        }
        const commissioningOptions: ControllerCommissioningFlowOptions = {
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
        let vendorId: VendorId | undefined = undefined;
        let knownAddress: ServerAddressUdp | undefined = undefined;
        if ('manualCode' in data && data.manualCode.length > 0) {
            const pairingCodeCodec = ManualPairingCodeCodec.decode(data.manualCode);
            shortDiscriminator = pairingCodeCodec.shortDiscriminator;
            longDiscriminator = undefined;
            passcode = pairingCodeCodec.passcode;
        } else if ('qrCode' in data && data.qrCode.length > 0) {
            const pairingCodeCodec = QrPairingCodeCodec.decode(data.qrCode);
            // TODO handle the case where multiple devices are included
            const capabilities = DiscoveryCapabilitiesSchema.decode(pairingCodeCodec[0].discoveryCapabilities);
            if (!capabilities.onIpNetwork && capabilities.ble && !this.#useBle) {
                throw new Error(
                    'This device can only be paired using BLE but BLE is disabled. Please use the ioBroker Visu App to pair this device or enable the Host BLE.',
                );
            }
            longDiscriminator = pairingCodeCodec[0].discriminator;
            shortDiscriminator = undefined;
            passcode = pairingCodeCodec[0].passcode;
        } else if ('passcode' in data) {
            passcode = data.passcode;
            vendorId = VendorId(data.vendorId);
            productId = data.productId;
            if (data.ip && data.port) {
                // Mainly Android
                if (data.ip.startsWith('/')) {
                    // Sometimes strange character is there
                    data.ip = data.ip.substring(1);
                }
                // Link local addresses from Mobile devices are not really useful
                if (!data.ip.startsWith('fe80')) {
                    knownAddress = {
                        type: 'udp',
                        ip: data.ip,
                        port: data.port,
                    };
                }
            }
        }
        const { device } = data;
        if (device) {
            longDiscriminator = undefined;
            shortDiscriminator = undefined;
        }

        // this.#adapter.log.debug(`Commissioning ... ${JSON.stringify(options)}`);
        if (passcode === undefined) {
            throw new Error('Passcode is missing');
        }

        const options: NodeCommissioningOptions = {
            ...this.nodeConnectSettings,
            commissioning: commissioningOptions,
            discovery: {
                knownAddress,
                commissionableDevice: device || undefined,
                identifierData:
                    longDiscriminator !== undefined
                        ? { longDiscriminator }
                        : shortDiscriminator !== undefined
                          ? { shortDiscriminator }
                          : vendorId !== undefined
                            ? { vendorId, productId }
                            : {},
            },
            passcode,
        };

        const nodeId = await this.#commissioningController.commissionNode(options);

        await this.registerCommissionedNode(nodeId);

        return { result: true, nodeId: nodeId.toString() };
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

        const node = await this.#commissioningController.getNode(nodeId);
        if (node === undefined) {
            // should never happen
            throw new Error(`Node ${nodeId} is not connected but commissioning was successful. Should not happen.`);
        }

        this.#registerNodeHandlers(node);
        await this.nodeToIoBrokerStructure(
            node,
            this.#commissioningController.getCommissionedNodesDetails().find(n => n.nodeId === nodeId),
        );

        this.#adapter.log.debug(`Commissioning successfully completed with nodeId "${nodeId}"`);
        this.#updateCallback();
    }

    async #discovery(obj: ioBroker.Message): Promise<void> {
        if (!this.#commissioningController) {
            return;
        }
        await this.#adapter.setState('controller.info.discovering', true, true);
        this.#discovering = true;
        this.#adapter.log.info(`Start the discovering...`);
        this.#commissioningController
            .discoverCommissionableDevices(
                {},
                {
                    ble: this.#useBle,
                    onIpNetwork: true,
                },
                device => {
                    this.#adapter.log.debug(`Discovered Device: ${Diagnostic.json(device)}`);
                    if (this.#discovering) {
                        this.#adapter
                            .sendToGui({
                                command: 'discoveredDevice',
                                device,
                            })
                            .catch(error => this.#adapter.log.info(`Error sending to GUI: ${error}`));
                    }
                },
                Seconds(60), // timeoutSeconds
            )
            .then(result => {
                this.#adapter.log.info(`Discovering stopped. Found ${result.length} devices.`);
                this.#adapter
                    .setState('controller.info.discovering', false, true)
                    .catch(error => this.#adapter.log.info(`Error setting state: ${error}`));
                this.#discovering = false;
                if (obj.callback) {
                    this.#adapter.log.info(`Sending result to "${JSON.stringify(result)}"`);
                    this.#adapter.sendTo(obj.from, obj.command, { result }, obj.callback);
                }
            })
            .catch(error => {
                const errorText = inspect(error, { depth: 10 });
                this.#adapter.log.warn(`Error while handling command "${obj.command}" for controller: ${errorText}`);
                if (obj.callback) {
                    this.#adapter.sendTo(obj.from, obj.command, { error: error.message }, obj.callback);
                }
            });
    }

    async #discoveryStop(): Promise<void> {
        if (this.#commissioningController && this.#discovering) {
            this.#discovering = false;
            await this.#adapter.setState('controller.info.discovering', false, true);
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
        const node = await this.#commissioningController.getNode(nodeId);
        if (node) {
            return await node.openEnhancedCommissioningWindow();
        }
        return null;
    }

    /**
     * Import custom OTA update files from a directory.
     *
     * @param customPath Optional custom path. If not provided, uses adapter config or default.
     * @returns Number of imported files
     */
    async importCustomOtaUpdates(customPath?: string): Promise<number> {
        const adapterConfig = this.#adapter.config as MatterAdapterConfig;

        // Determine the path to scan
        const path = customPath || adapterConfig.customUpdatesPath || join(this.#adapter.instanceDataDir, 'custom-ota');

        // Check if custom updates are enabled
        if (!adapterConfig.allowUnofficialUpdates) {
            this.#adapter.log.debug('Custom OTA updates are disabled');
            return 0;
        }

        // Ensure directory exists
        try {
            await mkdir(path, { recursive: true });
        } catch {
            // Directory might already exist
        }

        // Get the OTA service from the environment
        const otaService = this.#adapter.matterEnvironment.get(DclOtaUpdateService);

        // Find all .ota files in the directory
        let files: string[];
        try {
            const entries = await readdir(path);
            files = entries.filter(f => f.toLowerCase().endsWith('.ota'));
        } catch (error) {
            this.#adapter.log.warn(`Cannot read custom OTA directory "${path}": ${error}`);
            return 0;
        }

        if (files.length === 0) {
            this.#adapter.log.info(`No OTA files found in "${path}"`);
            return 0;
        }

        this.#adapter.log.info(`Found ${files.length} OTA files in "${path}"`);
        let imported = 0;

        for (const file of files) {
            const filePath = join(path, file);
            try {
                // Check if file exists and is readable
                const fileStat = await stat(filePath);
                if (!fileStat.isFile()) {
                    continue;
                }

                this.#adapter.log.debug(`Importing OTA file: ${file}`);

                // Create a stream for reading header info
                const stream1 = Readable.toWeb(createReadStream(filePath)) as ReadableStream<Uint8Array>;
                const updateInfo = await otaService.updateInfoFromStream(stream1, `file://${filePath}`);

                this.#adapter.log.info(
                    `OTA file "${file}": vendorId=${updateInfo.vid}, productId=${updateInfo.pid}, version=${updateInfo.softwareVersion}`,
                );

                // Create another stream for storing
                const stream2 = Readable.toWeb(createReadStream(filePath)) as ReadableStream<Uint8Array>;
                await otaService.store(stream2, updateInfo, 'local');

                imported++;
                this.#adapter.log.info(`Successfully imported OTA file: ${file}`);

                // Delete the original file after a successful import
                await unlink(filePath);
                this.#adapter.log.debug(`Deleted original OTA file: ${file}`);
            } catch (error) {
                this.#adapter.log.warn(`Failed to import OTA file "${file}": ${error}`);
            }
        }

        this.#adapter.log.info(`Imported ${imported} of ${files.length} OTA files`);
        return imported;
    }

    /**
     * Get network graph data for all connected nodes.
     * Collects WiFi and Thread diagnostics data for visualization.
     */
    getNetworkGraphData(): NetworkGraphData {
        const nodes: NetworkNodeData[] = [];

        for (const [nodeId, node] of this.#nodes) {
            try {
                const nodeData = this.#collectNodeNetworkData(nodeId, node);
                if (nodeData) {
                    nodes.push(nodeData);
                }
            } catch (error) {
                this.#adapter.log.debug(`Error collecting network data for node ${nodeId}: ${error}`);
            }
        }

        return { nodes, timestamp: Date.now() };
    }

    /**
     * Refresh network diagnostics data for specified nodes by re-reading cluster attributes.
     * Uses getMultipleAttributes to send one efficient request per node.
     */
    async refreshNodeNetworkData(nodeIds: string[]): Promise<void> {
        this.#adapter.log.debug(`Refreshing network data for nodes: ${nodeIds.join(', ')}`);

        // Thread Network Diagnostics cluster ID: 0x0035 (53)
        // Attribute IDs: channel=0, routingRole=1, neighborTable=7, routeTable=8, rloc16=64
        const threadClusterId = ClusterId(0x0035);
        const threadAttributes = [
            { endpointId: EndpointNumber(0), clusterId: threadClusterId, attributeId: AttributeId(0) }, // channel
            { endpointId: EndpointNumber(0), clusterId: threadClusterId, attributeId: AttributeId(1) }, // routingRole
            { endpointId: EndpointNumber(0), clusterId: threadClusterId, attributeId: AttributeId(7) }, // neighborTable
            { endpointId: EndpointNumber(0), clusterId: threadClusterId, attributeId: AttributeId(8) }, // routeTable
            { endpointId: EndpointNumber(0), clusterId: threadClusterId, attributeId: AttributeId(64) }, // rloc16
        ];

        // WiFi Network Diagnostics cluster ID: 0x0036 (54)
        // Attribute IDs: bssid=0, securityType=1, wiFiVersion=2, channelNumber=3, rssi=4
        const wifiClusterId = ClusterId(0x0036);
        const wifiAttributes = [
            { endpointId: EndpointNumber(0), clusterId: wifiClusterId, attributeId: AttributeId(0) }, // bssid
            { endpointId: EndpointNumber(0), clusterId: wifiClusterId, attributeId: AttributeId(1) }, // securityType
            { endpointId: EndpointNumber(0), clusterId: wifiClusterId, attributeId: AttributeId(2) }, // wiFiVersion
            { endpointId: EndpointNumber(0), clusterId: wifiClusterId, attributeId: AttributeId(3) }, // channelNumber
            { endpointId: EndpointNumber(0), clusterId: wifiClusterId, attributeId: AttributeId(4) }, // rssi
        ];

        const refreshPromises = nodeIds.map(async nodeIdStr => {
            const node = this.#nodes.get(nodeIdStr);
            if (!node) {
                this.#adapter.log.debug(`Node ${nodeIdStr} not found for refresh`);
                return;
            }

            if (!node.isConnected) {
                this.#adapter.log.debug(`Node ${nodeIdStr} is offline, skipping refresh`);
                return;
            }

            try {
                // Get interaction client for this node
                const client = await node.node.getInteractionClient();

                // Determine network type and read appropriate diagnostics
                const networkType = this.#getNetworkType(node);
                const attributes =
                    networkType === 'thread' ? threadAttributes : networkType === 'wifi' ? wifiAttributes : [];

                if (attributes.length === 0) {
                    this.#adapter.log.debug(`Node ${nodeIdStr} has no network diagnostics to refresh`);
                    return;
                }

                // Read all attributes in one request
                await client.getMultipleAttributes({ attributes });

                this.#adapter.log.debug(`Successfully refreshed network data for node ${nodeIdStr}`);
            } catch (error) {
                this.#adapter.log.debug(`Error refreshing network data for node ${nodeIdStr}: ${error}`);
            }
        });

        await Promise.all(refreshPromises);

        // Send updated network graph data
        this.#sendNetworkGraphUpdate();
    }

    /**
     * Send network graph update to GUI with debouncing to avoid excessive updates.
     * Debounce time is 1 second to batch rapid changes.
     */
    #sendNetworkGraphUpdate(): void {
        if (this.#networkGraphUpdateTimer) {
            clearTimeout(this.#networkGraphUpdateTimer);
        }
        this.#networkGraphUpdateTimer = setTimeout(async () => {
            try {
                const data = this.getNetworkGraphData();
                await this.#adapter.sendToGui({
                    command: 'networkGraphUpdate',
                    networkGraphData: data,
                });
            } catch (error) {
                this.#adapter.log.debug(`Error sending network graph update: ${error}`);
            }
        }, 1000);
    }

    /**
     * Check if the cluster ID is relevant for network graph visualization.
     */
    #isNetworkRelevantCluster(clusterId: number): boolean {
        // WiFiNetworkDiagnostics cluster ID: 0x0036 (54)
        // ThreadNetworkDiagnostics cluster ID: 0x0035 (53)
        // NetworkCommissioning cluster ID: 0x0031 (49)
        return clusterId === 0x0036 || clusterId === 0x0035 || clusterId === 0x0031;
    }

    #collectNodeNetworkData(nodeId: string, node: GeneralMatterNode): NetworkNodeData | null {
        const networkType = this.#getNetworkType(node);
        const wifiDiagnostics = this.#getWiFiDiagnostics(node);
        const threadDiagnostics = this.#getThreadDiagnostics(node);

        // Get vendorId and productId from basicInformation
        const basicInfo = node.node.basicInformation;
        const vendorId =
            basicInfo?.vendorId !== undefined ? `0x${basicInfo.vendorId.toString(16).toUpperCase()}` : undefined;
        const productId =
            basicInfo?.productId !== undefined ? `0x${basicInfo.productId.toString(16).toUpperCase()}` : undefined;

        return {
            nodeId,
            name: node.name,
            vendorId,
            productId,
            isConnected: node.isConnected,
            networkType,
            wifi: wifiDiagnostics,
            thread: threadDiagnostics,
        };
    }

    #getNetworkType(node: GeneralMatterNode): NetworkType {
        // Use the deviceInformation from PairedNode which is more reliable
        if (node.node.deviceInformation?.threadConnected) {
            return 'thread';
        }
        if (node.node.deviceInformation?.wifiConnected) {
            return 'wifi';
        }
        if (node.node.deviceInformation?.ethernetConnected) {
            return 'ethernet';
        }

        // Fallback: try to detect from NetworkCommissioning cluster feature map
        try {
            const networkCommissioning = node.node.getRootClusterClient(NetworkCommissioning.Complete);
            if (networkCommissioning) {
                const features = networkCommissioning.supportedFeatures;
                if (features.threadNetworkInterface) {
                    return 'thread';
                }
                if (features.wiFiNetworkInterface) {
                    return 'wifi';
                }
                if (features.ethernetNetworkInterface) {
                    return 'ethernet';
                }
            }
        } catch {
            // Ignore errors
        }

        return 'unknown';
    }

    #getWiFiDiagnostics(node: GeneralMatterNode): WiFiDiagnosticsData | undefined {
        if (!node.isConnected) {
            return undefined;
        }

        try {
            const cluster = node.node.getRootClusterClient(WiFiNetworkDiagnosticsCluster);
            if (!cluster) {
                return undefined;
            }

            const bssidRaw = cluster.isAttributeSupportedByName('bssid') ? cluster.getBssidAttributeFromCache() : null;
            let bssid: string | null = null;
            if (bssidRaw) {
                // Convert Uint8Array to base64 string
                bssid = Buffer.from(new Uint8Array(bssidRaw as ArrayBuffer)).toString('base64');
            }

            return {
                bssid,
                rssi: cluster.isAttributeSupportedByName('rssi') ? (cluster.getRssiAttributeFromCache() ?? null) : null,
                channel: cluster.isAttributeSupportedByName('channelNumber')
                    ? (cluster.getChannelNumberAttributeFromCache() ?? null)
                    : null,
                securityType: cluster.isAttributeSupportedByName('securityType')
                    ? ((cluster.getSecurityTypeAttributeFromCache() as number | null | undefined) ?? null)
                    : null,
                wifiVersion: cluster.isAttributeSupportedByName('wiFiVersion')
                    ? ((cluster.getWiFiVersionAttributeFromCache() as number | null | undefined) ?? null)
                    : null,
            };
        } catch {
            return undefined;
        }
    }

    #getThreadDiagnostics(node: GeneralMatterNode): ThreadDiagnosticsData | undefined {
        if (!node.isConnected) {
            return undefined;
        }

        try {
            const cluster = node.node.getRootClusterClient(ThreadNetworkDiagnostics.Cluster);
            if (!cluster) {
                return undefined;
            }

            // Get extended address from General Diagnostics cluster
            const extendedAddress = this.#getExtendedAddress(node);

            // Get neighbor table
            const neighborTableRaw = cluster.isAttributeSupportedByName('neighborTable')
                ? (cluster.getNeighborTableAttributeFromCache() ?? [])
                : [];

            const neighborTable: ThreadNeighborEntry[] = neighborTableRaw.map(entry => ({
                extAddress: this.#bigIntToBase64(entry.extAddress),
                rloc16: entry.rloc16,
                age: entry.age,
                averageRssi: entry.averageRssi,
                lastRssi: entry.lastRssi,
                lqi: entry.lqi,
                frameErrorRate: entry.frameErrorRate,
                messageErrorRate: entry.messageErrorRate,
                rxOnWhenIdle: entry.rxOnWhenIdle,
                fullThreadDevice: entry.fullThreadDevice,
                fullNetworkData: entry.fullNetworkData,
                isChild: entry.isChild,
            }));

            // Get route table
            const routeTableRaw = cluster.isAttributeSupportedByName('routeTable')
                ? (cluster.getRouteTableAttributeFromCache() ?? [])
                : [];

            const routeTable: ThreadRouteEntry[] = routeTableRaw.map(entry => ({
                extAddress: this.#bigIntToBase64(entry.extAddress),
                rloc16: entry.rloc16,
                routerId: entry.routerId,
                nextHop: entry.nextHop,
                pathCost: entry.pathCost,
                lqiIn: entry.lqiIn,
                lqiOut: entry.lqiOut,
                age: entry.age,
                allocated: entry.allocated,
                linkEstablished: entry.linkEstablished,
            }));

            // Get extended PAN ID
            let extendedPanId: string | null = null;
            if (cluster.isAttributeSupportedByName('extendedPanId')) {
                const extPanIdRaw = cluster.getExtendedPanIdAttributeFromCache();
                if (extPanIdRaw !== undefined && extPanIdRaw !== null) {
                    extendedPanId = this.#bigIntToBase64(extPanIdRaw);
                }
            }

            return {
                channel: cluster.isAttributeSupportedByName('channel')
                    ? (cluster.getChannelAttributeFromCache() ?? null)
                    : null,
                routingRole: cluster.isAttributeSupportedByName('routingRole')
                    ? ((cluster.getRoutingRoleAttributeFromCache() as number | null | undefined) ?? null)
                    : null,
                extendedPanId,
                rloc16: cluster.isAttributeSupportedByName('rloc16')
                    ? (cluster.getRloc16AttributeFromCache() ?? null)
                    : null,
                extendedAddress,
                neighborTable,
                routeTable,
            };
        } catch {
            return undefined;
        }
    }

    #getExtendedAddress(node: GeneralMatterNode): string | null {
        try {
            const cluster = node.node.getRootClusterClient(GeneralDiagnosticsCluster);
            if (!cluster) {
                return null;
            }

            const networkInterfaces = cluster.isAttributeSupportedByName('networkInterfaces')
                ? cluster.getNetworkInterfacesAttributeFromCache()
                : null;

            if (!networkInterfaces?.length) {
                return null;
            }

            // Find Thread interface (type 4) or use first with hardware address
            const threadIface = networkInterfaces.find(i => i.type === 4) || networkInterfaces[0];
            if (!threadIface?.hardwareAddress) {
                return null;
            }

            return Buffer.from(new Uint8Array(threadIface.hardwareAddress as ArrayBuffer)).toString('base64');
        } catch {
            return null;
        }
    }

    /**
     * Convert a bigint (like extended address) to base64 string
     */
    #bigIntToBase64(value: bigint | number): string {
        const bigValue = typeof value === 'number' ? BigInt(value) : value;
        // Convert bigint to 8-byte buffer (big-endian)
        const bytes = new Uint8Array(8);
        let remaining = bigValue;
        for (let i = 7; i >= 0; i--) {
            bytes[i] = Number(remaining & 0xffn);
            remaining >>= 8n;
        }
        return Buffer.from(bytes).toString('base64');
    }

    async stop(): Promise<void> {
        this.#adapter.log.info(`Stopping Controller...`);
        if (this.#discovering) {
            await this.#discoveryStop();
        }

        // Clear any pending network graph update timer
        if (this.#networkGraphUpdateTimer) {
            clearTimeout(this.#networkGraphUpdateTimer);
            this.#networkGraphUpdateTimer = undefined;
        }

        for (const node of this.#nodes.values()) {
            await node.destroy();
        }

        this.#nodes.clear();

        if (this.#commissioningController) {
            this.#observers.close();
            await this.#commissioningController.close();
            this.#commissioningController = undefined;
        }
    }

    async decommissionNode(nodeId: string): Promise<void> {
        if (!this.#commissioningController) {
            throw new Error(`Can not decommission NodeId "${nodeId}" because controller not initialized.`);
        }
        await this.#commissioningController.removeNode(
            NodeId(BigInt(nodeId)),
            !!this.#nodes.get(nodeId)?.node.isConnected,
        );
        this.#nodes.delete(nodeId);
        this.#updateCallback();
    }

    async queryUpdates(): Promise<
        {
            peerAddress: PeerAddress;
            info: SoftwareUpdateInfo;
        }[]
    > {
        if (!this.otaProvider) {
            this.#adapter.log.warn('No OTA provider available, cannot query for updates');
            return [];
        }
        // Query OTA provider for updates using dynamic behavior access
        const updatesAvailable = await this.otaProvider.act(agent =>
            agent.get(SoftwareUpdateManager).queryUpdates({
                includeStoredUpdates: true,
            }),
        );
        this.#adapter.log.info(`OTA updates available for ${updatesAvailable.length} nodes`);
        return updatesAvailable;
    }
}

export default Controller;
