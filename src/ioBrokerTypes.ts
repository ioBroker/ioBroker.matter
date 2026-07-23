export interface MatterAdapterConfig extends ioBroker.AdapterConfig {
    interface: string;
    debug: boolean;
    login: string;
    pass: string;
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
    name: string;
    oid: string;
    type: string;
    auto: boolean;
    noComposed: boolean;
}

export interface BridgeDescription {
    uuid: string;
    enabled: boolean;
    productID: string;
    vendorID: string;
    passcode: string;
    name: string;
    list: BridgeDeviceDescription[];
}

export interface DeviceDescription extends BridgeDeviceDescription {
    productID: string;
    vendorID: string;
    passcode: string;
}

/** Reserved id of the scalar (legacy) credential set stored directly on the controller config. */
export const DEFAULT_CREDENTIAL_ID = 'default';

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

// Network Graph Types - used by Controller for network visualization
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

// Thread diagnostics wire types — the serialized shape produced by serializeBatch() and sent to the
// admin UI. Mirror of the frontend copies in src-admin/src/types.d.ts (keep in sync).

export interface ThreadMode {
    rxOnWhenIdle: boolean;
    ftd: boolean;
    fullNetworkData: boolean;
}

export interface ThreadConnectivity {
    parentPriority: -1 | 0 | 1;
    linkQuality3: number;
    linkQuality2: number;
    linkQuality1: number;
    leaderCost: number;
    idSequence: number;
    activeRouters: number;
    sedBufferSize: number;
    sedDatagramCount: number;
}

export interface ThreadRoute64Entry {
    routerId: number;
    linkQualityIn: number;
    linkQualityOut: number;
    routeCost: number;
}

export interface ThreadRoute64 {
    idSequence: number;
    entries: ThreadRoute64Entry[];
}

export interface ThreadLeaderData {
    partitionId: number;
    weighting: number;
    dataVersion: number;
    stableDataVersion: number;
    leaderRouterId: number;
}

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

export interface ThreadChildTableEntry {
    timeoutExponent: number;
    timeoutSeconds: number;
    incomingLinkQuality: number;
    childId: number;
    mode: ThreadMode;
}

export interface ThreadMleCounters {
    disabledRole: number;
    detachedRole: number;
    childRole: number;
    routerRole: number;
    leaderRole: number;
    attachAttempts: number;
    partitionIdChanges: number;
    betterPartitionAttachAttempts: number;
    parentChanges: number;
    trackedTime: number;
    disabledTime: number;
    detachedTime: number;
    childTime: number;
    routerTime: number;
    leaderTime: number;
}

export interface ThreadDiagnosticsNode {
    extMacAddress?: string;
    rloc16?: number;
    mode?: ThreadMode;
    timeout?: number;
    connectivity?: ThreadConnectivity;
    route64?: ThreadRoute64;
    leaderData?: ThreadLeaderData;
    networkData?: string;
    ipv6Addresses?: string[];
    macCounters?: ThreadMacCounters;
    childTable?: ThreadChildTableEntry[];
    channelPages?: number[];
    maxChildTimeout?: number;
    eui64?: string;
    version?: number;
    vendorName?: string;
    vendorModel?: string;
    vendorSwVersion?: string;
    threadStackVersion?: string;
    vendorAppUrl?: string;
    mleCounters?: ThreadMleCounters;
    batteryLevel?: number;
    supplyVoltage?: number;
    unknown?: Array<{ type: number; value: string }>;
}

export type ThreadDiagnosticsPartialReason =
    | 'petition_rejected'
    | 'dtls_failed'
    | 'border_router_unreachable'
    | 'no_credentials'
    | 'no_source'
    | 'rest_unreachable'
    | 'rest_protocol'
    | 'timeout'
    | 'in_progress'
    | 'meshcop_no_responses_yet'
    | 'rest_no_responses_yet';

export interface ThreadDiagnosticsBatch {
    extPanIdHex: string;
    networkName: string;
    collectedAt: number;
    source: 'meshcop' | 'otbr-rest' | 'none';
    nodes: ThreadDiagnosticsNode[];
    partialReason?: ThreadDiagnosticsPartialReason;
}
