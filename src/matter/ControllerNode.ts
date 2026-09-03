import {
    ChangeNotificationService,
    ClusterBehavior,
    CommissioningClient,
    ControllerBehavior,
    ClientNodePhysicalProperties,
    Diagnostic,
    Endpoint,
    EndpointLifecycle,
    NodeConnectionState,
    NodeId,
    ObserverGroup,
    Seconds,
    Semaphore,
    SoftwareUpdateManager,
    RemoteDescriptor,
    ServerNode,
    Time,
    VendorId,
    type Behavior,
    type ClientNode,
    type ContinuousDiscovery,
    type ServerAddressUdp,
    type SoftwareUpdateInfo,
    type CommissioningDiscovery,
} from '@matter/main';
import { GeneralCommissioning } from '@matter/main/clusters';
import {
    BasicInformationClient,
    GeneralDiagnosticsClient,
    NetworkCommissioningClient,
    ThreadNetworkDiagnosticsClient,
    TimeSynchronizationClient,
    WiFiNetworkDiagnosticsClient,
} from '@matter/main/behaviors';
import {
    CertificateAuthority,
    CommissioningError,
    DclOtaUpdateService,
    FabricAuthority,
    PeerAddress,
    type CommissionableDevice,
    type DiscoveryData,
    type Fabric,
} from '@matter/main/protocol';
import {
    ManualPairingCodeCodec,
    QrPairingCodeCodec,
    DiscoveryCapabilitiesSchema,
    type FabricIndex,
} from '@matter/main/types';
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
} from '../ioBrokerTypes';
import { DEFAULT_CREDENTIAL_ID } from '../ioBrokerTypes';
import { hasAnyCommissioningCredential, resolveThreadCredential, resolveWifiCredential } from './credentialResolver';
import {
    BorderRouterRegistry,
    type BorderRouterEntry,
    ThreadCredentialsRegistry,
    OtbrRestClient,
    OtbrRestDiagnosticSource,
    connectMeshcop,
} from '@matter/thread-br-client';
import { ThreadDiagnosticsService, type ThreadDiagnosticsBatch } from './ThreadDiagnosticsService';
import { parseRestBaseUrl, registerThreadCredentialsFromHex } from './threadCredentials';
import { serializeBatch } from './serializeBatch';
import { GeneralMatterNode, operationalAddressOf, type PairedNodeConfig } from './GeneralMatterNode';
import type { NodeIcdManager } from './NodeIcdManager';
import { refreshWithLongIdleTimeDeferral, runDedupedByKey } from './longIdleTimeRefresh';
import { pushNodeTime, type TimeSyncInvokers } from './timeSync/timeSyncCommands';
import { ThreadDetailsPoller, type ThreadTopologyConnector } from './timeSync/ThreadDetailsPoller';
import {
    readTimeSyncCapabilities,
    SyncTrigger,
    TIME_FAILURE_EVENT_ID,
    TIME_SYNC_CLUSTER_ID,
    TimeSyncManager,
} from './timeSync/TimeSyncManager';
import { identifyDeviceTypes } from './to-iobroker/ioBrokerFactory';
import type { GeneralNode, MessageResponse } from './GeneralNode';
import { inspect } from 'util';
import { createReadStream } from 'fs';
import { readdir, stat, mkdir, unlink } from 'fs/promises';
import { Readable } from 'stream';
import { join } from 'path';
import { OtaProviderEndpoint } from '@matter/main/endpoints';

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
export type {
    NetworkGraphData,
    NetworkNodeData,
    NetworkType,
    WiFiDiagnosticsData,
    ThreadDiagnosticsData,
    BorderRouterEntry,
};

/**
 * How long endpoint changes of one peer are collected before its ioBroker structure is rebuilt.
 *
 * Measured from the first change, not restarted by later ones, so a device reporting its endpoints slowly
 * still ends in one rebuild.
 */
const STRUCTURE_REBUILD_DELAY_MS = 5_000;

interface WatchedPeer {
    peer: ClientNode;
    observers: ObserverGroup;
    /** Last address the peer reported, because it is already gone when the decommission is announced. */
    commissionedNodeId?: NodeId;
    /** Set once the peer itself starts being destroyed, so a rebuild cannot recreate what is being removed. */
    tearingDown?: boolean;
    rebuildTimer?: ioBroker.Timeout;
}

type EndUserCommissioningOptions = (
    | { qrCode: string }
    | { manualCode: string }
    | { passcode: number; vendorId: number; productId: number; ip: string; port: number }
) & { device: CommissionableDevice; wifiCredentialId?: string; threadCredentialId?: string };

class Controller implements GeneralNode {
    #parameters: MatterControllerConfig;
    readonly #adapter: MatterAdapter;
    readonly #updateCallback: () => void;
    #fabricLabel: string;
    #serverNode?: ServerNode;
    #otaProvider?: Endpoint<OtaProviderEndpoint>;
    #fabric?: Fabric;
    #nodes = new Map<string, GeneralMatterNode>();
    /** Serializes nodeToIoBrokerStructure per node id; entries are pruned once a node is decommissioned. */
    #nodeLocks = new Map<string, Semaphore>();
    #discovering = false;
    #activeDiscovery?: ContinuousDiscovery;
    /** Everyone waiting for the running discovery, so a second command joins it instead of starting one. */
    #discoveryCallbacks = new Array<ioBroker.Message>();
    #useBle = false;
    #commissioningStatus = new Map<number, { status: 'finished' | 'error' | 'inprogress'; result?: MessageResponse }>();
    #observers = new ObserverGroup();
    /**
     * The peers this controller observes, keyed by the peer itself but typed as its endpoint so the owner
     * walk of an arbitrary endpoint can look one up directly.
     */
    readonly #watchedPeers = new Map<Endpoint, WatchedPeer>();
    #networkGraphUpdateTimer?: ioBroker.Timeout;
    #closing = false;
    #borderRouterRegistry?: BorderRouterRegistry;
    readonly #threadCredentials = new ThreadCredentialsRegistry();
    #threadDiagnostics?: ThreadDiagnosticsService;
    #timeSyncManager?: TimeSyncManager;
    #threadDetailsPoller?: ThreadDetailsPoller;
    #fabricIndex?: FabricIndex;
    /** Guards against subscribing to the same icd.changed more than once across repeated registration calls. */
    readonly #icdChangeSubscribed = new WeakSet<GeneralMatterNode>();
    /** Node ids with an unawaited LIT network-data read still in flight; see `refreshNodeNetworkData`. */
    readonly #pendingLongIdleTimeReads = new Set<string>();

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
        return this.#otaProvider;
    }

    init(): void {
        if (this.#parameters.ble) {
            if (hasAnyCommissioningCredential(this.#parameters)) {
                this.#adapter.matterEnvironment.vars.set('ble.enable', true);
                const hciId = this.#parameters.hciId === undefined ? undefined : parseInt(this.#parameters.hciId);
                if (hciId !== undefined && (hciId >= 0 || hciId <= 255)) {
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
        if (!isInit) {
            // Feed updated Thread datasets into the live credentials registry so diagnostics pick them up
            // without a restart (register is idempotent per extended PAN id).
            this.#registerStoredThreadCredentials();
        }
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
        if (this.#serverNode === undefined) {
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
                            .finally(() =>
                                this.#adapter.setTimeout(
                                    () => this.#commissioningStatus.delete(pollingId),
                                    60 * 60_000,
                                ),
                            );
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
                    // The app reconstructs our fabric from the CA root and the fabric material, runs PASE
                    // itself, and hands the node back through controllerCompletePaseCommissioning.
                    const caConfig = this.#serverNode?.env.get(CertificateAuthority).config;
                    const fabricData = this.#fabric?.config;
                    if (caConfig === undefined || fabricData === undefined) {
                        return { error: 'Controller fabric is not available.' };
                    }
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
                case 'controllerThreadBorderRouters': {
                    // Return Thread border routers discovered via mDNS
                    const borderRouters: BorderRouterEntry[] = this.#borderRouterRegistry?.list() ?? [];
                    return { result: borderRouters };
                }
                case 'controllerThreadDiagnostics': {
                    // Query Thread mesh diagnostics from border routers (MeshCoP/CoAP or OTBR REST)
                    const force = message.force as boolean | undefined;
                    const extPanId = message.extPanId as string | undefined;
                    if (extPanId) {
                        // Single-network form: always a batch or null (never an array)
                        const batch = this.#threadDiagnostics
                            ? await this.#threadDiagnostics.getOrFetch(extPanId, { force })
                            : undefined;
                        return { result: batch ? serializeBatch(batch) : null };
                    }
                    // All-networks form: always an array
                    if (!this.#threadDiagnostics) {
                        return { result: [] };
                    }
                    this.#threadDiagnostics.refreshAllKnown({ force });
                    return { result: this.#threadDiagnostics.listCached().map(serializeBatch) };
                }
            }
        } catch (error) {
            const errorText = inspect(error, { depth: 10 });
            this.#adapter.log.warn(`Error while executing command "${command}": ${errorText}`);
            return { error: `Error while executing command "${command}": ${error.message}`, result: false };
        }

        return { error: `Unknown command "${command}"` };
    }

    /**
     * Give up on a controller that could not be brought up.
     *
     * `handleCommand()` treats a set `#serverNode` as a controller the GUI may act on, so a node that never
     * became usable has to be dropped rather than left behind.
     */
    async #discardServerNode(serverNode: ServerNode): Promise<void> {
        this.#serverNode = undefined;
        this.#otaProvider = undefined;
        this.#fabric = undefined;
        this.#fabricIndex = undefined;
        this.#unwatchAllPeers();
        // A node that will not close keeps its mDNS sockets and storage handles
        await serverNode.close().catch(error => this.#adapter.log.warn(`Error closing controller: ${error}`));
    }

    #registerChangeHandlers(): void {
        const serverNode = this.#serverNode;
        if (serverNode === undefined) {
            return;
        }

        this.#observers.on(serverNode.env.get(ChangeNotificationService).change, change => {
            const peer = this.#peerOf(change.endpoint);
            if (peer === undefined || !peer.lifecycle.isCommissioned) {
                return;
            }
            this.#handlePeerChange(peer, change);
        });

        const watchPeer = (peer: ClientNode): void => {
            if (this.#watchedPeers.has(peer)) {
                return;
            }
            const observers = new ObserverGroup();
            const watched: WatchedPeer = { peer, observers };
            this.#watchedPeers.set(peer, watched);

            // A peer can be watched before it is commissioned, so the id is kept current while it is known.
            const rememberNodeId = (): void => {
                const nodeId = peer.state.commissioning?.peerAddress?.nodeId;
                if (nodeId !== undefined) {
                    watched.commissionedNodeId = nodeId;
                }
            };
            rememberNodeId();

            observers.on(peer.lifecycle.connectionStateChanged, state => {
                rememberNodeId();
                this.#handleConnectionState(peer, state);
            });
            // Seeding happens on the first structure read, which for a peer restored from cache is before this
            // runs; `seeded` emits once and does not replay, so the Connected path below arms these as well.
            observers.on(peer.lifecycle.seeded, () => {
                rememberNodeId();
                this.#registerNodeForTimeSync(peer);
                this.#registerNodeForThreadPolling(peer);
            });
            observers.on(peer.lifecycle.decommissioned, () => {
                this.#adapter.log.info(`Node "${peer.id}" decommissioned`);
                const nodeId = watched.commissionedNodeId;
                if (nodeId !== undefined) {
                    this.#unregisterNodeFromTimeSync(nodeId);
                    this.#unregisterNodeFromThreadPolling(nodeId);
                }
                this.#updateCallback();
            });
            // A change notification reports an endpoint that went away but never one that appeared, so the
            // structure of a bridge that gains a device is only seen here.
            observers.on(peer.lifecycle.changed, (type, endpoint) => {
                switch (type) {
                    case EndpointLifecycle.Change.Destroying:
                        if (endpoint === peer) {
                            watched.tearingDown = true;
                            this.#cancelStructureRebuild(watched);
                        }
                        break;
                    case EndpointLifecycle.Change.Installed:
                    case EndpointLifecycle.Change.Destroyed:
                        if (endpoint !== peer) {
                            this.#scheduleStructureRebuild(watched);
                        }
                        break;
                }
            });
        };
        // Discovery adds commissionable devices to the same collection, and the expiration cull drops them
        // again, so the observers of a peer have to go when the peer does.
        const unwatchPeer = (peer: Endpoint): void => {
            const watched = this.#watchedPeers.get(peer);
            if (watched === undefined) {
                return;
            }
            this.#cancelStructureRebuild(watched);
            watched.observers.close();
            this.#watchedPeers.delete(peer);
        };

        for (const peer of serverNode.peers.commissioned) {
            watchPeer(peer);
        }
        this.#observers.on(serverNode.peers.added, watchPeer);
        this.#observers.on(serverNode.peers.deleted, unwatchPeer);
    }

    /** The peer whose subtree `endpoint` belongs to, if it is one of ours. */
    #peerOf(endpoint: Endpoint): ClientNode | undefined {
        for (let current: Endpoint | undefined = endpoint; current !== undefined; current = current.owner) {
            const watched = this.#watchedPeers.get(current);
            if (watched !== undefined) {
                return watched.peer;
            }
        }
        return undefined;
    }

    #unwatchAllPeers(): void {
        for (const watched of this.#watchedPeers.values()) {
            this.#cancelStructureRebuild(watched);
            watched.observers.close();
        }
        this.#watchedPeers.clear();
    }

    /** Rebuild the ioBroker structure of a peer whose endpoints changed. */
    #scheduleStructureRebuild(watched: WatchedPeer): void {
        if (watched.tearingDown || this.#closing || this.#adapter.closing || watched.rebuildTimer !== undefined) {
            return;
        }
        watched.rebuildTimer = this.#adapter.setTimeout(() => {
            watched.rebuildTimer = undefined;
            if (watched.tearingDown || this.#closing || this.#adapter.closing) {
                return;
            }
            this.#adapter.log.info(`Node "${watched.peer.id}" structure changed`);
            this.nodeToIoBrokerStructure(watched.peer).then(
                () => this.#updateCallback(),
                error => this.#adapter.log.info(`Error while updating structure: ${error}`),
            );
        }, STRUCTURE_REBUILD_DELAY_MS);
    }

    #cancelStructureRebuild(watched: WatchedPeer): void {
        if (watched.rebuildTimer !== undefined) {
            this.#adapter.clearTimeout(watched.rebuildTimer);
            watched.rebuildTimer = undefined;
        }
    }

    #handlePeerChange(peer: ClientNode, change: ChangeNotificationService.Change): void {
        // matter.js drops the state of an endpoint that is being destroyed, and this runs while one is
        const nodeIdStr = peer.state.commissioning?.peerAddress?.nodeId.toString() ?? peer.id;
        const deviceNode = this.#nodes.get(nodeIdStr);
        switch (change.kind) {
            case 'update': {
                if (!ClusterBehavior.is(change.behavior)) {
                    return;
                }
                const clusterId = change.behavior.cluster.id;
                deviceNode
                    ?.handleChangedAttributes(change.endpoint, change.behavior, change.properties)
                    .catch(error => this.#adapter.log.error(`Error handling attribute change: ${error}`));
                if (this.#isNetworkRelevantCluster(clusterId)) {
                    this.#sendNetworkGraphUpdate();
                }
                break;
            }
            case 'event': {
                if (!ClusterBehavior.is(change.behavior)) {
                    return;
                }
                deviceNode
                    ?.handleTriggeredEvent(change)
                    .catch(error => this.#adapter.log.error(`Error handling event: ${error}`));

                if (change.behavior.cluster.id === TIME_SYNC_CLUSTER_ID && change.event.id === TIME_FAILURE_EVENT_ID) {
                    const peerAddress = peer.state.commissioning.peerAddress;
                    if (peerAddress !== undefined) {
                        this.#adapter.log.debug(`Received timeFailure event from node ${nodeIdStr}`);
                        this.#timeSyncManager?.syncNode(peerAddress, SyncTrigger.TimeFailure);
                    }
                }
                break;
            }
            case 'delete': {
                const watched = this.#watchedPeers.get(peer);
                if (watched === undefined || watched.tearingDown) {
                    // The peer itself is going away, so rebuilding would recreate what is being removed
                    return;
                }
                this.#adapter.log.info(`Node "${nodeIdStr}" lost endpoint ${change.endpoint.maybeNumber}`);
                this.#scheduleStructureRebuild(watched);
                break;
            }
        }
    }

    #handleConnectionState(peer: ClientNode, state: NodeConnectionState): void {
        const nodeIdStr = peer.state.commissioning.peerAddress?.nodeId.toString() ?? peer.id;
        const deviceNode = this.#nodes.get(nodeIdStr);
        if (deviceNode) {
            deviceNode.handleStateChange(state, { operationalAddress: operationalAddressOf(peer) });
        } else if (state !== NodeConnectionState.Disconnected) {
            this.#adapter.log.info(`Matter node "${nodeIdStr}" not initialized ... Got State change to ${state}`);
        }
        this.#updateCallback();

        if (state === NodeConnectionState.Connected) {
            this.#registerNodeForTimeSync(peer);
            this.#registerNodeForThreadPolling(peer);
        }

        this.#sendNetworkGraphUpdate();
    }

    async start(): Promise<void> {
        if (this.#serverNode) {
            throw new Error('Controller already started!');
        }

        const serverNode = await ServerNode.create(ServerNode.RootEndpoint.with(ControllerBehavior), {
            environment: this.#adapter.matterEnvironment,
            id: 'controller',
            // A controller is never commissionable itself, and subscription persistence is a device feature.
            commissioning: { enabled: false },
            subscriptions: { persistenceEnabled: false },
            network: { tcp: true, transportPreference: 'tcp' },
            controller: { adminFabricLabel: this.#fabricLabel, ble: this.#useBle },
        });
        this.#serverNode = serverNode;
        this.#otaProvider = await serverNode.add(new Endpoint(OtaProviderEndpoint, { id: 'ota-provider' }));

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
            const fabricAuthority = await serverNode.env.load(FabricAuthority);
            this.#fabric = await fabricAuthority.defaultFabric({ adminFabricLabel: this.#fabricLabel });
            await serverNode.start();
        } catch (error) {
            const errorText = inspect(error, { depth: 10 });
            this.#adapter.log.error(`Failed to start the controller: ${errorText}`);
            await this.#discardServerNode(serverNode);
            return;
        }

        this.#fabricIndex = this.#fabric?.fabricIndex;

        let peers: ClientNode[];
        try {
            // Loading the peers is deferred to the first access of this getter, so it fails here rather than
            // in whichever call site happens to touch it first.
            peers = serverNode.peers.commissioned;
        } catch (error) {
            this.#adapter.log.error(`Failed to load the paired nodes: ${inspect(error, { depth: 10 })}`);
            this.#adapter.log.error(
                'The controller is stopped because its nodes could not be loaded. Restart the instance ' +
                    'first. If that does not help, the controller data is inconsistent - restore the instance ' +
                    'data directory and the objects of this instance from the same backup.',
            );
            await this.#discardServerNode(serverNode);
            return;
        }

        this.#startTimeSync();

        this.#startThreadDiagnostics();

        this.#registerChangeHandlers();

        this.#adapter.log.info(
            `Found ${peers.length} nodes: ${peers.map(peer => peer.state.commissioning.peerAddress?.nodeId).join(', ')}`,
        );
        // Connecting them is automatic; this only builds their ioBroker representation.
        for (const peer of peers) {
            try {
                this.#adapter.log.info(`Initializing node "${peer.id}" ...`);
                await this.nodeToIoBrokerStructure(peer);
            } catch (error) {
                this.#adapter.log.info(`Failed to initialize node "${peer.id}": ${error.stack}`);
            }
        }

        const otaProvider = this.#otaProvider;
        this.#observers.on(otaProvider.eventsOf(SoftwareUpdateManager).updateAvailable, (peerAddress, info) => {
            const nodeIdStr = peerAddress.nodeId.toString();
            const node = this.#nodes.get(nodeIdStr);
            if (node === undefined) {
                return;
            }
            // Use the new method that persists to state
            this.#adapter.log.info(
                `Software update available for node ${nodeIdStr}: version ${info.softwareVersionString} (${info.softwareVersion}), source: ${info.source}`,
            );
            node.setSoftwareUpdateAvailable(info);
            // Refresh UI to show the update available icon
            this.#adapter.refreshControllerDevices();
        });
        this.#observers.on(otaProvider.eventsOf(SoftwareUpdateManager).updateDone, peerAddress => {
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
        });
        this.#observers.on(otaProvider.eventsOf(SoftwareUpdateManager).updateFailed, peerAddress => {
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
        });
    }

    #getNodeLock(nodeIdStr: string): Semaphore {
        let lock = this.#nodeLocks.get(nodeIdStr);
        if (lock === undefined) {
            lock = new Semaphore(`controller-node-${nodeIdStr}`);
            this.#nodeLocks.set(nodeIdStr, lock);
        }
        return lock;
    }

    async nodeToIoBrokerStructure(node: ClientNode, nodeDetails?: { operationalAddress?: string }): Promise<void> {
        const nodeIdStr = node.state.commissioning.peerAddress?.nodeId.toString() ?? node.id;

        // One rebuild per node id at a time, so a losing GeneralMatterNode is never overwritten in #nodes undestroyed.
        const slot = await this.#getNodeLock(nodeIdStr).obtainSlot();
        try {
            if (this.#closing || this.#adapter.closing) {
                // A queued call may only get its slot after stop() already cleared #nodes.
                return;
            }
            if (!this.#watchedPeers.has(node)) {
                // The peer was removed while this waited for its slot, so rebuilding would bring it back.
                return;
            }

            const oldDevice = this.#nodes.get(nodeIdStr);
            await oldDevice?.destroy();

            const device = new GeneralMatterNode(this.#adapter, node, this.#parameters, this.#otaProvider);
            this.#nodes.set(nodeIdStr, device);
            await device.initialize(nodeDetails);

            // An already-connected node emits no further stateChanged, so register it here too
            this.#registerNodeForTimeSync(node);
            this.#registerNodeForThreadPolling(node);
        } finally {
            slot.close();
        }
    }

    #peerAddress(nodeId: NodeId): PeerAddress | undefined {
        if (this.#fabricIndex === undefined) {
            return undefined;
        }
        return PeerAddress({ nodeId, fabricIndex: this.#fabricIndex });
    }

    #startTimeSync(): void {
        const { enableTimeSync } = this.#adapter.config as MatterAdapterConfig;
        if (enableTimeSync === false) {
            this.#adapter.log.info('Time synchronization is disabled');
            return;
        }
        this.#adapter.log.info('Time synchronization enabled');
        this.#timeSyncManager = new TimeSyncManager({
            syncTime: peer => this.#syncNodeTime(peer.nodeId),
            nodeConnected: peer => this.#nodes.get(peer.nodeId.toString())?.isConnected ?? false,
            commissionedNodeCount: () => this.#serverNode?.peers.commissioned.length ?? 0,
        });
    }

    /**
     * Ensures ICD detection has run for a node and that both periodic processors (time sync, Thread
     * topology polling) observe its LIT status toggling, regardless of which one triggers first.
     *
     * Subscribes on `deviceNode.icdChanged` rather than `deviceNode.icd.changed`: the latter is
     * recreated (and the old instance's listeners dropped) every time `applyConfiguration()` runs a
     * clear-and-rebuild, which would otherwise silently stop LIT toggles from reaching either
     * processor until the node's next reconnect. `icdChanged` outlives that rebuild, so one
     * subscription per `GeneralMatterNode` is enough.
     */
    #ensureIcdTracking(node: ClientNode, deviceNode: GeneralMatterNode): NodeIcdManager | undefined {
        // The peer's root endpoint structure can still be unpopulated at this point on a node's first
        // remote initialization, which is exactly when a fresh registration matters most; retry so LIT
        // capability is not silently defaulted to false for the rest of the process lifetime.
        deviceNode.ensureIcdManager();
        if (!this.#icdChangeSubscribed.has(deviceNode)) {
            this.#icdChangeSubscribed.add(deviceNode);
            // register()/unregister() (Battery Saver Mode toggle) flip the peer's operating mode without
            // reconnecting, so only this re-registers the peer with its current LIT status.
            deviceNode.icdChanged.on(() => {
                this.#registerNodeForTimeSync(node);
                this.#registerNodeForThreadPolling(node);
            });
        }
        return deviceNode.icd;
    }

    #registerNodeForTimeSync(node: ClientNode): void {
        if (this.#timeSyncManager === undefined || !node.lifecycle.isSeeded) {
            return;
        }
        const peer = node.state.commissioning.peerAddress;
        if (peer === undefined) {
            return;
        }
        try {
            const deviceNode = this.#nodes.get(peer.nodeId.toString());
            const icd = deviceNode !== undefined ? this.#ensureIcdTracking(node, deviceNode) : undefined;
            this.#timeSyncManager.registerNode(peer, readTimeSyncCapabilities(node), icd?.longIdleTimeActive ?? false);
        } catch (error) {
            this.#adapter.log.debug(`Error registering node ${node.id} for time synchronization: ${error}`);
        }
    }

    #unregisterNodeFromTimeSync(nodeId: NodeId): void {
        const peer = this.#peerAddress(nodeId);
        if (peer !== undefined) {
            this.#timeSyncManager?.unregisterNode(peer);
        }
    }

    #registerNodeForThreadPolling(node: ClientNode): void {
        if (this.#threadDetailsPoller === undefined || !node.lifecycle.isSeeded) {
            return;
        }
        const peer = node.state.commissioning.peerAddress;
        if (peer === undefined) {
            return;
        }
        try {
            const deviceNode = this.#nodes.get(peer.nodeId.toString());
            const icd = deviceNode !== undefined ? this.#ensureIcdTracking(node, deviceNode) : undefined;
            const isThreadNode = this.#getNetworkType(node) === 'thread';
            this.#threadDetailsPoller.registerNode(peer, isThreadNode, icd?.longIdleTimeActive ?? false);
        } catch (error) {
            this.#adapter.log.debug(`Error registering node ${node.id} for Thread topology polling: ${error}`);
        }
    }

    #unregisterNodeFromThreadPolling(nodeId: NodeId): void {
        const peer = this.#peerAddress(nodeId);
        if (peer !== undefined) {
            this.#threadDetailsPoller?.unregisterNode(peer);
        }
    }

    /**
     * Push UTC time (and, for TimeZone-feature nodes, time zone + DST) to a node's
     * TimeSynchronization cluster.
     */
    async #syncNodeTime(nodeId: NodeId): Promise<void> {
        const rootEndpoint = this.#nodes.get(nodeId.toString())?.node;
        if (rootEndpoint === undefined) {
            throw new Error(`Node ${nodeId} is not available`);
        }
        const capabilities = readTimeSyncCapabilities(rootEndpoint);
        if (!capabilities.supported) {
            throw new Error(`Node ${nodeId} does not expose the TimeSynchronization cluster`);
        }
        const commands = rootEndpoint.commandsOf(TimeSynchronizationClient);
        const invokers: TimeSyncInvokers = {
            setUtcTime: async fields => {
                await commands.setUtcTime(fields);
            },
            setTimeZone: fields => commands.setTimeZone(fields),
            setDstOffset: async fields => {
                await commands.setDstOffset(fields);
            },
        };
        await pushNodeTime({ invokers, capabilities, nowMs: Time.nowMs });
    }

    #registerStoredThreadCredentials(): void {
        registerThreadCredentialsFromHex(
            this.#threadCredentials,
            this.#parameters.threadOperationalDataSet,
            'stored:default',
        );
        for (const entry of this.#parameters.additionalThreadCredentials ?? []) {
            registerThreadCredentialsFromHex(this.#threadCredentials, entry.operationalDataset, `stored:${entry.id}`);
        }
    }

    #startThreadDiagnostics(): void {
        // Thread diagnostics are non-critical; never let their setup abort controller startup
        try {
            this.#registerStoredThreadCredentials();

            const env = this.#adapter.matterEnvironment;
            const registry = new BorderRouterRegistry(env);
            this.#borderRouterRegistry = registry;
            registry.start().catch(error => {
                this.#adapter.log.warn(`Failed to start Thread border router discovery: ${error}`);
            });

            const threadDiagnosticsEnabled =
                (this.#adapter.config as MatterAdapterConfig).threadDiagnosticsEnabled ?? true;
            const service = new ThreadDiagnosticsService({
                enabled: threadDiagnosticsEnabled,
                borderRouters: registry,
                credentials: this.#threadCredentials,
                makeRestSource: cap => {
                    const { host, port } = parseRestBaseUrl(cap.baseUrl);
                    return new OtbrRestDiagnosticSource(new OtbrRestClient({ host, port }), cap);
                },
                makeMeshcopSource: (creds, br) => connectMeshcop({ environment: env, creds, br }),
                bootstrapCredentialsFromRest: async cap => {
                    const { host, port } = parseRestBaseUrl(cap.baseUrl);
                    const ds = await new OtbrRestClient({ host, port }).getActiveDataset();
                    if (ds !== undefined) {
                        this.#threadCredentials.register(ds);
                    }
                },
            });
            this.#threadDiagnostics = service;
            this.#observers.on(service.events.batchUpdated, batch => this.#sendThreadDiagnosticsUpdate(batch));

            if (threadDiagnosticsEnabled) {
                const connector: ThreadTopologyConnector = {
                    nodeConnected: peer => this.#nodes.get(peer.nodeId.toString())?.isConnected ?? false,
                    readTopology: async peer => {
                        await this.#refreshSingleNodeNetworkData(peer.nodeId.toString());
                        this.#sendNetworkGraphUpdate();
                    },
                };
                this.#threadDetailsPoller = new ThreadDetailsPoller(connector);
            }
        } catch (error) {
            this.#adapter.log.warn(`Failed to start Thread diagnostics: ${error}`);
        }
    }

    #sendThreadDiagnosticsUpdate(batch: ThreadDiagnosticsBatch): void {
        if (this.#closing || this.#adapter.closing || !this.#adapter.shouldSendToGui) {
            return;
        }
        this.#adapter
            .sendToGui({ command: 'threadDiagnosticsUpdate', threadDiagnostics: serializeBatch(batch) })
            .catch(error => this.#adapter.log.debug(`Error sending thread diagnostics update: ${error}`));
    }

    async getState(): Promise<void> {
        // nothing to do
    }

    async commissionDevice(data: EndUserCommissioningOptions): Promise<AddDeviceResult> {
        const serverNode = this.#serverNode;
        if (!serverNode) {
            return { error: 'Controller is not activated.', result: false };
        }
        const commissioningOptions: CommissioningClient.BaseCommissioningOptions = {
            regulatoryLocation: GeneralCommissioning.RegulatoryLocationType.IndoorOutdoor,
            regulatoryCountryCode: 'XX',
        };

        if (this.#useBle) {
            const wifi = resolveWifiCredential(this.#parameters, data.wifiCredentialId);
            if (wifi) {
                this.#adapter.log.debug(`Registering Commissioning over BLE with WiFi: ${wifi.ssid}`);
                commissioningOptions.wifiNetwork = { wifiSsid: wifi.ssid, wifiCredentials: wifi.password };
            } else if (data.wifiCredentialId && data.wifiCredentialId !== DEFAULT_CREDENTIAL_ID) {
                this.#adapter.log.warn(
                    `WiFi credential set "${data.wifiCredentialId}" is not configured; commissioning without WiFi credentials.`,
                );
            }

            const thread = resolveThreadCredential(this.#parameters, data.threadCredentialId);
            if (thread) {
                this.#adapter.log.debug(`Registering Commissioning over BLE with Thread: ${thread.networkName}`);
                commissioningOptions.threadNetwork = {
                    networkName: thread.networkName,
                    operationalDataset: thread.operationalDataset,
                };
            } else if (data.threadCredentialId && data.threadCredentialId !== DEFAULT_CREDENTIAL_ID) {
                this.#adapter.log.warn(
                    `Thread credential set "${data.threadCredentialId}" is not configured; commissioning without Thread credentials.`,
                );
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
            // A QR payload does not have to carry them, and the commissioning options only take the pair
            const codeVendorId = pairingCodeCodec[0].vendorId;
            vendorId = codeVendorId === undefined ? undefined : VendorId(codeVendorId, false);
            productId = pairingCodeCodec[0].productId;
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

        const options: CommissioningDiscovery.Options = {
            ...commissioningOptions,
            passcode,
            discoveryCapabilities: { onIpNetwork: true, ble: this.#useBle },
            ...(longDiscriminator !== undefined ? { discriminator: longDiscriminator } : {}),
        };

        // An address the mobile app supplied is more specific than a discovery record, so it wins.
        const descriptor = knownAddress !== undefined ? { addresses: [knownAddress] } : (device ?? undefined);
        let peer: ClientNode;
        if (descriptor !== undefined) {
            peer = await serverNode.peers.forDescriptor(descriptor);
            await peer.commission(options);
        } else {
            // Without a descriptor the identifiers steer discovery, which commission() runs itself.
            peer = await serverNode.peers.commission({
                ...options,
                ...(shortDiscriminator !== undefined ? { shortDiscriminator } : {}),
                ...(vendorId !== undefined ? { vendorId, productId } : {}),
            });
        }

        const nodeId = peer.state.commissioning.peerAddress?.nodeId;
        if (nodeId === undefined) {
            return { result: false, error: 'Commissioning finished without a node id' };
        }
        await this.registerCommissionedNode(nodeId, peer);

        return { result: true, nodeId: nodeId.toString() };
    }

    async completeCommissioningForNode(nodeId: NodeId, discoveryData?: DiscoveryData): Promise<AddDeviceResult> {
        if (!this.#serverNode) {
            return {
                result: false,
                error: `Can not register NodeId "${nodeId}" because controller not initialized.`,
            };
        }

        const peer = await this.#serverNode.peers.completeCommissioning(nodeId, discoveryData);

        await this.registerCommissionedNode(nodeId, peer);

        return { result: true, nodeId: nodeId.toString() };
    }

    async registerCommissionedNode(nodeId: NodeId, peer?: ClientNode): Promise<void> {
        const peerAddress = this.#peerAddress(nodeId);
        const node = peer ?? (peerAddress === undefined ? undefined : this.#serverNode?.peers.get(peerAddress));
        if (node === undefined) {
            // should never happen
            throw new Error(`Node ${nodeId} is not connected but commissioning was successful. Should not happen.`);
        }

        await this.nodeToIoBrokerStructure(node, { operationalAddress: operationalAddressOf(node) });

        this.#adapter.log.debug(`Commissioning successfully completed with nodeId "${nodeId}"`);
        this.#updateCallback();
    }

    async #discovery(obj: ioBroker.Message): Promise<void> {
        const serverNode = this.#serverNode;
        if (!serverNode) {
            return;
        }
        if (this.#activeDiscovery !== undefined) {
            // A second scan would report the same devices while leaving the first one running unstoppable,
            // so the caller joins the one in flight instead.
            this.#adapter.log.info(`Discovering already running, waiting for its result...`);
            this.#discoveryCallbacks.push(obj);
            return;
        }

        await this.#adapter.setState('controller.info.discovering', true, true);
        this.#discovering = true;
        this.#adapter.log.info(`Start the discovering...`);
        const discovery = serverNode.peers.discover({ timeout: Seconds(60) });
        this.#activeDiscovery = discovery;
        this.#discoveryCallbacks.push(obj);

        const observers = new ObserverGroup();
        // The same device announces repeatedly for as long as discovery runs.
        const seen = new Set<string>();
        observers.on(discovery.discovered, node => {
            const commissioning = node.maybeStateOf(CommissioningClient);
            if (commissioning === undefined) {
                return;
            }
            const device = RemoteDescriptor.fromLongForm(commissioning) as CommissionableDevice;
            const identifier = device.deviceIdentifier ?? JSON.stringify(device.addresses ?? []);
            if (seen.has(identifier)) {
                return;
            }
            seen.add(identifier);
            this.#adapter.log.debug(`Discovered Device: ${Diagnostic.json(device)}`);
            if (this.#discovering) {
                this.#adapter
                    .sendToGui({
                        command: 'discoveredDevice',
                        device,
                    })
                    .catch(error => this.#adapter.log.info(`Error sending to GUI: ${error}`));
            }
        });

        const finish = async (): Promise<void> => {
            observers.close();
            this.#activeDiscovery = undefined;
            this.#discovering = false;
            await this.#adapter
                .setState('controller.info.discovering', false, true)
                .catch(error => this.#adapter.log.info(`Error setting state: ${error}`));
        };
        const answer = (response: Record<string, unknown>): void => {
            const callers = this.#discoveryCallbacks;
            this.#discoveryCallbacks = [];
            for (const caller of callers) {
                if (caller.callback) {
                    this.#adapter.sendTo(caller.from, caller.command, response, caller.callback);
                }
            }
        };

        discovery
            .then(async nodes => {
                const result = nodes
                    .map(node => node.maybeStateOf(CommissioningClient))
                    .filter(commissioning => commissioning !== undefined)
                    .map(commissioning => RemoteDescriptor.fromLongForm(commissioning) as CommissionableDevice);
                await finish();
                this.#adapter.log.info(`Discovering stopped. Found ${result.length} devices.`);
                answer({ result });
            })
            .catch(async error => {
                const errorText = inspect(error, { depth: 10 });
                await finish();
                this.#adapter.log.warn(`Error while handling command "${obj.command}" for controller: ${errorText}`);
                answer({ error: error.message });
            });
    }

    async #discoveryStop(): Promise<void> {
        if (this.#activeDiscovery) {
            this.#discovering = false;
            await this.#adapter.setState('controller.info.discovering', false, true);
            this.#adapter.log.info(`Stop the discovering...`);
            // Resolves the discovery, so its own handler answers the callers and clears #activeDiscovery
            this.#activeDiscovery.stop();
        }
    }

    async showNewCommissioningCode(nodeId: NodeId): Promise<{
        manualPairingCode: string;
        qrPairingCode: string;
    } | null> {
        const peerAddress = this.#peerAddress(nodeId);
        const node = peerAddress === undefined ? undefined : this.#serverNode?.peers.get(peerAddress);
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
        const path = customPath || adapterConfig.customUpdatesPath || this.#adapter.defaultCustomOtaPath;

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
     *
     * LIT nodes are deferred (see `refreshWithLongIdleTimeDeferral`) so a sleeping peer cannot block
     * this command's resolution for the rest of the batch, or for whatever else is waiting on the
     * shared controller-action queue this command runs under.
     */
    async refreshNodeNetworkData(nodeIds: string[]): Promise<void> {
        this.#adapter.log.debug(`Refreshing network data for nodes: ${nodeIds.join(', ')}`);

        const isLongIdleTime = (nodeIdStr: string): boolean => {
            const node = this.#nodes.get(nodeIdStr);
            // The root endpoint structure can still be unpopulated the first time this runs for a
            // node (mirrors #ensureIcdTracking); without the retry, #icd stays undefined and this
            // would default to "not LIT", awaiting a sleeping peer's read for the rest of the batch.
            node?.ensureIcdManager();
            return node?.icd?.longIdleTimeActive ?? false;
        };

        const readNode = async (nodeIdStr: string): Promise<void> => {
            try {
                await this.#refreshSingleNodeNetworkData(nodeIdStr);
            } catch (error) {
                this.#adapter.log.debug(`Error refreshing network data for node ${nodeIdStr}: ${error}`);
            }
        };

        const readWithoutDuplicateLongIdleTimeReads = async (nodeIdStr: string): Promise<void> => {
            if (!isLongIdleTime(nodeIdStr)) {
                await readNode(nodeIdStr);
                return;
            }
            await runDedupedByKey(
                this.#pendingLongIdleTimeReads,
                nodeIdStr,
                () => readNode(nodeIdStr),
                () => this.#adapter.log.debug(`Skipping refresh for node ${nodeIdStr}: a LIT read is already pending`),
            );
        };

        await refreshWithLongIdleTimeDeferral(nodeIds, isLongIdleTime, readWithoutDuplicateLongIdleTimeReads, () =>
            this.#sendNetworkGraphUpdate(),
        );

        // Send updated network graph data
        this.#sendNetworkGraphUpdate();
    }

    /**
     * Re-read one node's network diagnostics cluster (Thread or WiFi) by node type. NeighborTable,
     * RouteTable and WiFi signal attributes are otherwise reported only on subscription
     * (re)establishment; this is also what the periodic Thread topology poller calls per node.
     */
    /**
     * Narrows a wanted attribute list to the ones the peer actually exposes. Several diagnostics attributes
     * are conformance-optional (Rloc16 for one) and `getStateOf` rejects the whole read if a single requested
     * attribute is absent. `behaviors.elementsOf().attributes` is the same set matter.js validates against;
     * the cached state object is not, as it carries keys for unsupported attributes too.
     */
    #supportedAttributes<const T extends readonly string[]>(
        endpoint: Endpoint,
        type: Behavior.Type,
        wanted: T,
    ): T[number][] {
        const supported = endpoint.behaviors.elementsOf(type).attributes;
        return wanted.filter(name => supported.has(name));
    }

    async #refreshSingleNodeNetworkData(nodeIdStr: string): Promise<void> {
        const node = this.#nodes.get(nodeIdStr);
        if (!node) {
            this.#adapter.log.debug(`Node ${nodeIdStr} not found for refresh`);
            return;
        }

        if (!node.isConnected) {
            this.#adapter.log.debug(`Node ${nodeIdStr} is offline, skipping refresh`);
            return;
        }

        const networkType = this.#getNetworkType(node.node);

        if (networkType === 'thread') {
            const attributes = this.#supportedAttributes(node.node, ThreadNetworkDiagnosticsClient, [
                'channel',
                'routingRole',
                'neighborTable',
                'routeTable',
                'rloc16',
            ]);
            if (attributes.length === 0) {
                this.#adapter.log.debug(`Node ${nodeIdStr} exposes no Thread diagnostics attributes to refresh`);
                return;
            }
            await node.node.getStateOf(ThreadNetworkDiagnosticsClient, attributes, {
                includeKnownVersions: true,
            });
        } else if (networkType === 'wifi') {
            const attributes = this.#supportedAttributes(node.node, WiFiNetworkDiagnosticsClient, [
                'bssid',
                'securityType',
                'wiFiVersion',
                'channelNumber',
                'rssi',
            ]);
            if (attributes.length === 0) {
                this.#adapter.log.debug(`Node ${nodeIdStr} exposes no WiFi diagnostics attributes to refresh`);
                return;
            }
            await node.node.getStateOf(WiFiNetworkDiagnosticsClient, attributes, {
                includeKnownVersions: true,
            });
        } else {
            this.#adapter.log.debug(`Node ${nodeIdStr} has no network diagnostics to refresh`);
            return;
        }

        this.#adapter.log.debug(`Successfully refreshed network data for node ${nodeIdStr}`);
    }

    /**
     * Send network graph update to GUI with debouncing to avoid excessive updates.
     * Debounce time is 1 second to batch rapid changes.
     */
    #sendNetworkGraphUpdate(): void {
        if (this.#networkGraphUpdateTimer) {
            this.#adapter.clearTimeout(this.#networkGraphUpdateTimer);
        }
        if (this.#closing || this.#adapter.closing) {
            return;
        }
        this.#networkGraphUpdateTimer = this.#adapter.setTimeout(async () => {
            // getNetworkGraphData() walks every endpoint of every node and does a model lookup per device type
            if (!this.#adapter.shouldSendToGui) {
                return;
            }
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
        const networkType = this.#getNetworkType(node.node);
        const wifiDiagnostics = this.#getWiFiDiagnostics(node);
        const threadDiagnostics = this.#getThreadDiagnostics(node);

        // Get vendorId and productId from basicInformation
        const basicInfo = node.node.maybeStateOf(BasicInformationClient);
        const vendorId =
            basicInfo?.vendorId !== undefined ? `0x${basicInfo.vendorId.toString(16).toUpperCase()}` : undefined;
        const productId =
            basicInfo?.productId !== undefined ? `0x${basicInfo.productId.toString(16).toUpperCase()}` : undefined;

        return {
            nodeId,
            name: node.name,
            vendorId,
            productId,
            deviceType: this.#getPrimaryDeviceType(node),
            isConnected: node.isConnected,
            networkType,
            wifi: wifiDiagnostics,
            thread: threadDiagnostics,
        };
    }

    /**
     * Primary application Matter device-type id of a node, for icon selection. Prefers an
     * application device type on any endpoint over utility types (Root/OTA/Power), which are
     * commonly reported alongside the real device type.
     */
    #getPrimaryDeviceType(node: GeneralMatterNode): number | undefined {
        const rootEndpoint = node.node;
        if (rootEndpoint === undefined) {
            return undefined;
        }
        // Infrastructure device types that should never drive the node icon. The Matter
        // DeviceClassification reports Aggregator as a non-utility ("simple") app type, so
        // it lands in appTypes and would otherwise mask the real bridged device behind it.
        const INFRA_DEVICE_TYPES = new Set<number>([
            0x000e, // Aggregator
            0x0013, // Bridged Node
            0x0011, // Power Source
            0x0012, // OTA Requestor
            0x0014, // OTA Provider
            0x0016, // Root Node
            0x0019, // Secondary Network Interface
        ]);
        // Children first so a real device endpoint wins over the root/aggregator endpoint.
        const endpoints = new Array<Endpoint>();
        const collect = (endpoint: Endpoint): void => {
            for (const child of endpoint.parts) {
                collect(child);
            }
            endpoints.push(endpoint);
        };
        try {
            collect(rootEndpoint);
            let fallback: number | undefined;
            for (const endpoint of endpoints) {
                const { appTypes, primaryDeviceType } = identifyDeviceTypes(endpoint);
                const appType = appTypes.find(t => !INFRA_DEVICE_TYPES.has(t.deviceType.id));
                if (appType !== undefined) {
                    return appType.deviceType.id;
                }
                if (fallback === undefined) {
                    fallback = primaryDeviceType?.deviceType.id;
                }
            }
            return fallback;
        } catch {
            return undefined;
        }
    }

    #getNetworkType(node: ClientNode): NetworkType {
        const properties = ClientNodePhysicalProperties(node);
        if (properties.threadActive || properties.supportsThread) {
            return 'thread';
        }
        if (properties.supportsWifi) {
            return 'wifi';
        }
        if (properties.supportsEthernet) {
            return 'ethernet';
        }

        return 'unknown';
    }

    #getWiFiDiagnostics(node: GeneralMatterNode): WiFiDiagnosticsData | undefined {
        if (!node.isConnected) {
            return undefined;
        }

        const wifiState = node.node.maybeStateOf(WiFiNetworkDiagnosticsClient);
        if (wifiState === undefined) {
            return undefined;
        }

        const bssidRaw = wifiState.bssid ?? null;
        let bssid: string | null = null;
        if (bssidRaw) {
            // Convert Uint8Array to base64 string
            bssid = Buffer.from(new Uint8Array(bssidRaw as ArrayBuffer)).toString('base64');
        }

        return {
            bssid,
            rssi: wifiState.rssi ?? null,
            channel: wifiState.channelNumber ?? null,
            securityType: wifiState.securityType ?? null,
            wifiVersion: wifiState.wiFiVersion ?? null,
        };
    }

    #getThreadDiagnostics(node: GeneralMatterNode): ThreadDiagnosticsData | undefined {
        if (!node.isConnected) {
            return undefined;
        }

        try {
            const threadState = node.node.maybeStateOf(ThreadNetworkDiagnosticsClient);
            if (threadState === undefined) {
                return undefined;
            }

            // Get extended address from General Diagnostics cluster
            const extendedAddress = this.#getExtendedAddress(node);

            // Get neighbor table
            const neighborTableRaw = threadState.neighborTable ?? [];

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
            const routeTableRaw = threadState.routeTable ?? [];

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
            const extPanIdRaw = threadState.extendedPanId;
            if (extPanIdRaw !== undefined && extPanIdRaw !== null) {
                extendedPanId = this.#bigIntToBase64(extPanIdRaw);
            }

            // Thread spec version from NetworkCommissioning (only present on Thread interfaces)
            let threadVersion: number | null = null;
            const netCommState = node.node.maybeStateOf(NetworkCommissioningClient);
            if (netCommState !== undefined && 'threadVersion' in netCommState) {
                const v = netCommState.threadVersion;
                threadVersion = typeof v === 'number' ? v : null;
            }

            return {
                channel: threadState.channel ?? null,
                routingRole: threadState.routingRole ?? null,
                extendedPanId,
                rloc16: threadState.rloc16 ?? null,
                extendedAddress,
                threadVersion,
                neighborTable,
                routeTable,
            };
        } catch {
            return undefined;
        }
    }

    #getExtendedAddress(node: GeneralMatterNode): string | null {
        try {
            const diagState = node.node.maybeStateOf(GeneralDiagnosticsClient);
            if (diagState === undefined) {
                return null;
            }

            const networkInterfaces = diagState.networkInterfaces ?? null;

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
        this.#closing = true;
        this.#adapter.log.info(`Stopping Controller...`);
        if (this.#discovering) {
            await this.#discoveryStop();
        }

        // Clear any pending network graph update timer
        if (this.#networkGraphUpdateTimer) {
            this.#adapter.clearTimeout(this.#networkGraphUpdateTimer);
            this.#networkGraphUpdateTimer = undefined;
        }

        // Stop diagnostics streams before the registry they depend on
        if (this.#threadDiagnostics) {
            await this.#threadDiagnostics.stop();
            this.#threadDiagnostics = undefined;
        }
        if (this.#borderRouterRegistry) {
            await this.#borderRouterRegistry.stop();
            this.#borderRouterRegistry = undefined;
        }

        if (this.#timeSyncManager) {
            const manager = this.#timeSyncManager;
            this.#timeSyncManager = undefined;
            // An in-flight setUtcTime on a node that silently went offline is not cancelable and
            // can outlast the adapter's stopTimeout, so never block shutdown on it. Adapter timers
            // are unavailable during unload, hence the matter.js one.
            const shutdownTimeout = Time.sleep('time-sync-shutdown', Seconds(2));
            await Promise.race([
                manager.stop().catch(error => this.#adapter.log.debug(`Error stopping time sync: ${error}`)),
                shutdownTimeout,
            ]);
            shutdownTimeout.cancel();
        }

        if (this.#threadDetailsPoller) {
            const poller = this.#threadDetailsPoller;
            this.#threadDetailsPoller = undefined;
            // Same reasoning as the time sync shutdown above: an in-flight topology read is not
            // cancelable and must not block shutdown.
            const shutdownTimeout = Time.sleep('thread-details-poller-shutdown', Seconds(2));
            await Promise.race([
                poller
                    .stop()
                    .catch(error => this.#adapter.log.debug(`Error stopping Thread topology poller: ${error}`)),
                shutdownTimeout,
            ]);
            shutdownTimeout.cancel();
        }

        for (const node of this.#nodes.values()) {
            // One node that fails to tear down must not skip the controller teardown below
            try {
                await node.destroy();
            } catch (error) {
                this.#adapter.log.warn(`Error destroying node ${node.nodeId}: ${error}`);
            }
        }

        this.#nodes.clear();

        if (this.#serverNode) {
            this.#observers.close();
            this.#unwatchAllPeers();
            await this.#serverNode.close();
            this.#serverNode = undefined;
            this.#otaProvider = undefined;
        }
    }

    async decommissionNode(nodeId: string): Promise<void> {
        const serverNode = this.#serverNode;
        if (!serverNode) {
            throw new Error(`Can not decommission NodeId "${nodeId}" because controller not initialized.`);
        }
        // Shares nodeToIoBrokerStructure's lock so a concurrent rebuild can't race the delete below.
        const removedNodeId = NodeId(BigInt(nodeId));
        const slot = await this.#getNodeLock(nodeId).obtainSlot();
        try {
            const removedPeerAddress = this.#peerAddress(removedNodeId);
            const peer = removedPeerAddress === undefined ? undefined : serverNode.peers.get(removedPeerAddress);
            if (peer === undefined) {
                this.#adapter.log.warn(
                    `Node "${nodeId}" is unknown to the controller; removing it locally only. It may still hold our fabric.`,
                );
            } else if (peer.lifecycle.isConnected) {
                // Decommissioning talks to the device; a peer we cannot reach is only dropped locally.
                await peer.decommission();
            } else {
                await peer.delete();
            }
            this.#unregisterNodeFromTimeSync(removedNodeId);
            this.#unregisterNodeFromThreadPolling(removedNodeId);
            // A rebuild that was queued on this lock replaces the entry, so what is dropped here is not
            // necessarily the object the caller is tearing down.
            await this.#nodes.get(nodeId)?.destroy();
            this.#nodes.delete(nodeId);
        } finally {
            slot.close();
        }
        // Only prune if nothing is currently queued or running on this node's lock, so an in-flight
        // nodeToIoBrokerStructure call never has its slot pulled out from under it.
        const lock = this.#nodeLocks.get(nodeId);
        if (lock !== undefined && lock.count === 0 && lock.running === 0) {
            this.#nodeLocks.delete(nodeId);
        }
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
