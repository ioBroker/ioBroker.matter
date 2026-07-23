import type { Types } from '@iobroker/type-detector';

export interface MatterAdapterConfig extends ioBroker.AdapterConfig {
    interface: string;
    debug: boolean;
    login: string;
    pass: string;
    /** UUID of the default (alexa-compatible - port 5540)bridge */
    defaultBridge: string;
    controllerFabricLabel: string;
    /** Allow unofficial/custom OTA updates */
    allowUnofficialUpdates: boolean;
    /** Custom path for OTA update files (default: instanceDataDir/custom-ota) */
    customUpdatesPath: string;
}

export interface BridgeDeviceDescription {
    uuid: string;
    enabled: boolean;
    name: ioBroker.StringOrTranslated;
    /** Object ID */
    oid: string;
    type: Types;
    auto?: boolean;
    hasOnState?: boolean;
    noComposed?: boolean;
    dimmerOnLevel?: number;
    dimmerUseLastLevelForOn?: boolean;
    actionAllowedByIdentify?: boolean;
}

export interface BridgeDescription {
    uuid: string;
    enabled: boolean;
    productID: string;
    vendorID: string;
    passcode?: string;
    name: string;
    deleted?: boolean;
    list: BridgeDeviceDescription[];
}

export interface DeviceDescription extends BridgeDeviceDescription {
    deleted?: boolean;
    productID?: string;
    vendorID?: string;
    passcode?: string;
}

export interface DetectedDevice {
    _id: string;
    common: ioBroker.ObjectCommon;
    type: ioBroker.ObjectType;
    deviceType: Types;
    states: ioBroker.StateObject[];
    hasOnState?: boolean;
    roomName: ioBroker.StringOrTranslated;
    vendorID?: string;
    productID?: string;
    auto?: boolean;
    noComposed?: boolean;
}

export interface DetectedRoom {
    _id: `system.room.${string}` | 'unknown';
    common: ioBroker.EnumCommon;
    devices: DetectedDevice[];
}

export interface WifiCredentialEntry {
    id: string;
    ssid: string;
    password: string;
}

export interface ThreadCredentialEntry {
    id: string;
    networkName: string;
    operationalDataset: string;
}

export interface MatterControllerConfig {
    enabled?: boolean;
    ble?: boolean;
    hciId?: string;
    wifiSSID?: string;
    wifiPassword?: string;
    threadNetworkName?: string;
    threadOperationalDataSet?: string;
    /** Named WiFi credential sets in addition to the default scalar set. */
    additionalWifiCredentials?: WifiCredentialEntry[];
    /** Named Thread credential sets in addition to the default scalar set. */
    additionalThreadCredentials?: ThreadCredentialEntry[];
    defaultExposeMatterApplicationClusterData?: boolean;
    defaultExposeMatterSystemClusterData?: boolean;
}

export interface MatterConfig {
    controller: MatterControllerConfig;
    devices: DeviceDescription[];
    bridges: BridgeDescription[];
}

export type ServerAddressIp = {
    type: 'udp';
    ip: string;
    port: number;
};

export type ServerAddressBle = {
    type: 'ble';
    peripheralAddress: string;
};

export type ServerAddress = ServerAddressIp | ServerAddressBle;

export interface CommissionableDevice {
    deviceIdentifier: string;
    /** Discriminator */
    D: number;
    /** Commissioning Mode */
    CM: number;
    /** The device's addresses IP/ port pairs */
    addresses: ServerAddress[];
    /** Vendor ID */
    V?: number;
    /** VendorId + ProductId */
    VP?: string;
    /** Device type */
    DT?: number;
    /** Device advertising name */
    DN?: string;
    /** Rotating device identifier */
    RI?: string;
    /** Pairing hint */
    PH?: number;
    /** Pairing instructions */
    PI?: string;
    /** Sleep Idle Interval */
    SII?: number;
    /** Sleep Active Interval */
    SAI?: number;
    /** Session active threshold */
    SAT?: number;
    /** TCP supported */
    T?: number;
    /** ICD Long Idle Time operating mode supported */
    ICD?: number;
}

export enum NodeStates {
    Creating = 'creating',
    WaitingForCommissioning = 'waitingForCommissioning',
    Commissioned = 'commissioned',
    ConnectedWithController = 'connected',
}

export type Processing = { id: string; inProgress: boolean }[] | null;

export interface ConnectionInfo {
    vendorId: number;
    vendorName: string;
    connected: boolean;
    label?: string;
}

export interface NodeStateResponse {
    status: NodeStates;
    error?: boolean | string[];
    qrPairingCode?: string;
    manualPairingCode?: string;
    connectionInfo?: ConnectionInfo[];
}

export interface GUIMessage {
    command:
        | 'bridgeStates'
        | 'deviceStates'
        | 'stopped'
        | 'updateStates'
        | 'discoveredDevice'
        | 'reconnect'
        | 'progress'
        | 'processing'
        | 'identifyPopup'
        | 'updateController'
        | 'updateSuccess'
        | 'updateFailed'
        | 'networkGraphUpdate'
        | 'threadDiagnosticsUpdate';
    states?: { [uuid: string]: NodeStateResponse };
    device?: CommissionableDevice;
    processing?: { id: string; inProgress: boolean }[] | null;
    /** Network graph data update */
    networkGraphData?: NetworkGraphData;
    /** Single Thread diagnostics batch pushed via `threadDiagnosticsUpdate`. */
    threadDiagnostics?: ThreadDiagnosticsBatch;

    /** Used for identify popup */
    identifyUuid?: string;
    /** Used for identify popup. How long to blink */
    identifySeconds?: number;

    progress?: {
        close?: boolean;
        title?: string;
        text?: string;
        /** Secondary text shown below progress (e.g., patience notice) */
        subText?: string;
        indeterminate?: boolean;
        value?: number;
        /** Whether the progress dialog can be cancelled */
        cancelable?: boolean;
        /** Node ID for cancel action (for OTA updates) */
        cancelNodeId?: string;
    };
}

/** OTA Update states from Matter specification */
export type OtaUpdateState =
    | 'Unknown'
    | 'Idle'
    | 'Querying'
    | 'DelayedOnQuery'
    | 'Downloading'
    | 'Applying'
    | 'DelayedOnApply'
    | 'RollingBack'
    | 'DelayedOnUserConsent';

export interface CommissioningInfo {
    bridges: Record<string, boolean>;
    devices: Record<string, boolean>;
}

// Network Graph Types - shared between backend and frontend
export type NetworkType = 'thread' | 'wifi' | 'ethernet' | 'unknown';

export interface NetworkGraphData {
    nodes: NetworkNodeData[];
    timestamp: number;
}

export interface NetworkNodeData {
    nodeId: string;
    name: string;
    vendorId?: string;
    productId?: string;
    /** Primary application Matter device-type id (for icon selection). */
    deviceType?: number;
    isConnected: boolean;
    networkType: NetworkType;
    wifi?: WiFiDiagnosticsData;
    thread?: ThreadDiagnosticsData;
}

export interface WiFiDiagnosticsData {
    bssid: string | null;
    rssi: number | null;
    channel: number | null;
    securityType: number | null;
    wifiVersion: number | null;
}

export interface ThreadDiagnosticsData {
    channel: number | null;
    routingRole: number | null;
    extendedPanId: string | null;
    rloc16: number | null;
    extendedAddress: string | null;
    /** Thread spec version (NetworkCommissioning ThreadVersion attr); e.g. 4 = Thread 1.3. */
    threadVersion: number | null;
    neighborTable: ThreadNeighborEntry[];
    routeTable: ThreadRouteEntry[];
}

export interface ThreadNeighborEntry {
    extAddress: string;
    rloc16: number;
    age: number;
    averageRssi: number | null;
    lastRssi: number | null;
    lqi: number;
    frameErrorRate: number;
    messageErrorRate: number;
    rxOnWhenIdle: boolean;
    fullThreadDevice: boolean;
    fullNetworkData: boolean;
    isChild: boolean;
}

export interface ThreadRouteEntry {
    extAddress: string;
    rloc16: number;
    routerId: number;
    nextHop: number;
    pathCost: number;
    lqiIn: number;
    lqiOut: number;
    age: number;
    allocated: boolean;
    linkEstablished: boolean;
}

/**
 * Single Thread Border Router record discovered via mDNS.
 *
 * The extended address (xa) is the 64-bit Thread MAC of the border agent and serves as
 * the primary key. It is the same value as ThreadNetworkDiagnostics.NeighborTable.extAddress
 * for a BR that is itself a Thread router, which is what allows the graph to join
 * BRs onto external-device entries seen in commissioned-node neighbor tables.
 */
export interface BorderRouterEntry {
    /** 16-char uppercase hex of the 64-bit Thread MAC. Primary key. */
    extAddressHex: string;
    /** 16-char uppercase hex of the extended PAN ID, when known. */
    extendedPanIdHex?: string;
    /** Friendly Thread network name (`_meshcop` TXT "nn"). */
    networkName?: string;
    /** Vendor name (`_meshcop` TXT "vn"). */
    vendorName?: string;
    /** Model name (`_meshcop` TXT "mn"). */
    modelName?: string;
    /** mDNS hostname from the SRV target, e.g. "Kuche.local.". */
    hostname?: string;
    /** Sorted IPv4 + IPv6 addresses resolved from the SRV target's A/AAAA records. */
    addresses: string[];
    /** Service port from the `_meshcop` SRV record. */
    meshcopPort?: number;
    /** Service port from the `_trel` SRV record. */
    trelPort?: number;
    /** Thread version, e.g. "1.3.0" (`_meshcop` TXT "tv"). */
    threadVersion?: string;
    /** Software/firmware version of the Border Router (`_meshcop` TXT "sv"). Vendor-extension. */
    swVersion?: string;
    /** MeshCoP TXT record format version (`_meshcop` TXT "rv"). */
    recordVersion?: string;
    /** Border agent ID hex (`_meshcop` TXT "dd"); not always present. */
    borderAgentIdHex?: string;
    /** Raw 4-byte state bitmap as hex (`_meshcop` TXT "sb"). Flag parsing left to frontend. */
    stateBitmapHex?: string;
    /** Active timestamp as hex (`_meshcop` TXT "at"). */
    activeTimestampHex?: string;
    /** Partition ID as hex (`_meshcop` TXT "pt"). */
    partitionIdHex?: string;
    /** Vendor-specific data domain name (`_meshcop` TXT "dn"). */
    domainName?: string;
    /** Which mDNS source(s) contributed to this entry. */
    sources: ('meshcop' | 'trel')[];
    /**
     * Epoch milliseconds of the most recent successful mDNS discovery for this entry.
     * `sources.length === 0` means stale; stale age is `Date.now() - lastSeen`.
     */
    lastSeen: number;
}

/*
 * The interfaces below decode the Thread Network Diagnostic TLVs a Border Router / router
 * reports (per the Thread spec / OpenThread `netdiag`). They are all part of the Thread
 * Network diagnostics feature (queried via the `controllerThreadDiagnostics` command and
 * streamed via the `threadDiagnosticsUpdate` GUI event). Distinct from the per-node
 * {@link ThreadDiagnosticsData} above, which is NetworkCommissioning/ThreadNetworkDiagnostics
 * data read from a commissioned node.
 */

/** MODE TLV — device capability/role flags. */
export interface ThreadMode {
    /** Radio stays on when idle (a non-sleepy device). */
    rxOnWhenIdle: boolean;
    /** Full Thread Device (router-eligible) vs a Minimal Thread Device. */
    ftd: boolean;
    /** Requests the full Network Data vs the stable subset. */
    fullNetworkData: boolean;
}

/** CONNECTIVITY TLV — a node's view of its links to neighbors and the leader. */
export interface ThreadConnectivity {
    /** Suitability as a parent: -1 low, 0 medium, 1 high. */
    parentPriority: -1 | 0 | 1;
    /** Count of neighbors with link quality 3 (best) / 2 / 1 (worst). */
    linkQuality3: number;
    linkQuality2: number;
    linkQuality1: number;
    /** Routing cost from this node to the leader. */
    leaderCost: number;
    /** Router-ID assignment sequence number (bumped when the router set changes). */
    idSequence: number;
    /** Number of active routers in the Thread network. */
    activeRouters: number;
    /** Buffer size a parent reserves for a sleepy child (bytes). */
    sedBufferSize: number;
    /** Max IPv6 datagrams a parent queues for a sleepy child. */
    sedDatagramCount: number;
}

/** One neighbor-router row within {@link ThreadRoute64}. */
export interface ThreadRoute64Entry {
    /** Router ID of the neighbor. */
    routerId: number;
    /** Link quality of packets received from / sent to that router (0–3). */
    linkQualityIn: number;
    linkQualityOut: number;
    /** Routing cost to that router. */
    routeCost: number;
}

/** ROUTE64 TLV — the node's routing table to other routers. */
export interface ThreadRoute64 {
    /** Router-ID assignment sequence number. */
    idSequence: number;
    entries: ThreadRoute64Entry[];
}

/** LEADER_DATA TLV — the current leader / partition identity. */
export interface ThreadLeaderData {
    /** Thread partition ID (changes on partition merge/split). */
    partitionId: number;
    /** Leader weighting used to arbitrate leadership. */
    weighting: number;
    /** Full and stable-only Network Data version counters. */
    dataVersion: number;
    stableDataVersion: number;
    /** Router ID of the leader. */
    leaderRouterId: number;
}

/** MAC_COUNTERS TLV — IEEE 802.15.4 MAC packet counters since last reset. */
export interface ThreadMacCounters {
    ifInUnknownProtos: number;
    ifInErrors: number;
    ifOutErrors: number;
    ifInUcastPkts: number;
    ifInBroadcastPkts: number;
    ifInDiscards: number;
    ifOutUcastPkts: number;
    ifOutBroadcastPkts: number;
    ifOutDiscards: number;
}

/** CHILD_TABLE TLV entry — one child attached to this (router) node. */
export interface ThreadChildTableEntry {
    /** Child timeout as a 2^exponent value and its resolved seconds. */
    timeoutExponent: number;
    timeoutSeconds: number;
    /** Link quality of packets received from the child (0–3). */
    incomingLinkQuality: number;
    /** Child ID (low bits of the child's RLOC16). */
    childId: number;
    mode: ThreadMode;
}

/** MLE_COUNTERS TLV — Mesh Link Establishment role/state counters. */
export interface ThreadMleCounters {
    /** Number of times the node entered each role. */
    disabledRole: number;
    detachedRole: number;
    childRole: number;
    routerRole: number;
    leaderRole: number;
    /** Attach / partition-change bookkeeping. */
    attachAttempts: number;
    partitionIdChanges: number;
    betterPartitionAttachAttempts: number;
    parentChanges: number;
    /** Cumulative time spent tracked / in each role, in milliseconds. */
    trackedTime: number;
    disabledTime: number;
    detachedTime: number;
    childTime: number;
    routerTime: number;
    leaderTime: number;
}

/**
 * Diagnostics for a single Thread node, assembled from the diagnostic TLVs it returned.
 * Every field is optional: a node only reports the TLVs it supports / were requested.
 */
export interface ThreadDiagnosticsNode {
    /** 16-char uppercase hex of the 64-bit Thread MAC (extended address). */
    extMacAddress?: string;
    /** Short 16-bit routing locator (router+child) within the mesh. */
    rloc16?: number;
    mode?: ThreadMode;
    /** Polling/child timeout in seconds. */
    timeout?: number;
    connectivity?: ThreadConnectivity;
    route64?: ThreadRoute64;
    leaderData?: ThreadLeaderData;
    /** Hex-encoded raw Network Data blob (prefixes, routes, services). */
    networkData?: string;
    /** Per-node IPv6 addresses, each 16-byte address as uppercase hex. */
    ipv6Addresses?: string[];
    macCounters?: ThreadMacCounters;
    childTable?: ThreadChildTableEntry[];
    /** Supported channel pages (radio band identifiers). */
    channelPages?: number[];
    /** Max child timeout this node grants, in seconds. */
    maxChildTimeout?: number;
    /** 16-char uppercase hex EUI-64 (factory-assigned identifier). */
    eui64?: string;
    /** Thread protocol version the node implements. */
    version?: number;
    /** Vendor identity strings (VENDOR_NAME / MODEL / SW_VERSION TLVs). */
    vendorName?: string;
    vendorModel?: string;
    vendorSwVersion?: string;
    /** OpenThread (or other) stack build string. */
    threadStackVersion?: string;
    vendorAppUrl?: string;
    mleCounters?: ThreadMleCounters;
    /** Battery level (0–100%) and supply voltage (mV) for battery-powered nodes. */
    batteryLevel?: number;
    supplyVoltage?: number;
    /** TLVs this decoder does not model, preserved verbatim; `value` is uppercase hex. */
    unknown?: Array<{ type: number; value: string }>;
}

/** Why a {@link ThreadDiagnosticsBatch} is incomplete (absent when the batch is complete). */
export type ThreadDiagnosticsPartialReason =
    | 'petition_rejected'
    | 'dtls_failed'
    | 'border_router_unreachable'
    | 'no_credentials'
    | 'no_source'
    | 'rest_unreachable'
    | 'rest_protocol'
    | 'timeout'
    /** Streaming multicast query is still active; this is a snapshot, more nodes may follow. */
    | 'in_progress'
    /** Streaming multicast query is active but no responses have arrived yet. */
    | 'meshcop_no_responses_yet'
    /** REST collection query is active but no responses have arrived yet. */
    | 'rest_no_responses_yet';

/**
 * One Thread network's diagnostics snapshot, keyed by extended PAN ID, delivered by the
 * `controllerThreadDiagnostics` command and streamed via the `threadDiagnosticsUpdate` event.
 */
export interface ThreadDiagnosticsBatch {
    /** 16-char uppercase hex extended PAN ID — the network this batch describes. */
    extPanIdHex: string;
    networkName: string;
    /** Epoch ms when the batch was assembled. */
    collectedAt: number;
    /**
     * Which transport produced it: MeshCoP (CoAP/DTLS) or the OTBR REST API.
     * `"none"` when no transport was attempted (e.g. a terminal `border_router_unreachable`
     * or `no_credentials` partial).
     */
    source: 'meshcop' | 'otbr-rest' | 'none';
    nodes: ThreadDiagnosticsNode[];
    /** Set when the snapshot is partial or the query could not complete. */
    partialReason?: ThreadDiagnosticsPartialReason;
}

/**
 * Router/leader sourced purely from diagnostics (route64) that matches no commissioned
 * device, known BR, or neighbor-inferred unknown. Its childTable leaves are not
 * materialized as nodes — they surface as {@link childCount}.
 */
export interface DiagnosticMeshNode {
    kind: 'diagnostic';
    /** Graph id `thread_<EXTMAC>`, else `meshrloc_<extPanId>_<rloc16>`. */
    id: string;
    rloc16: number;
    /** Uppercase hex Thread MAC if known. */
    extAddressHex?: string;
    isRouter: boolean;
    vendorName?: string;
    /** Number of childTable entries this router reports (shown as a label badge). */
    childCount: number;
    networkName: string;
}
