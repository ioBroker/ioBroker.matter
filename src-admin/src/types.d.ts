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
        | 'networkGraphUpdate';
    states?: { [uuid: string]: NodeStateResponse };
    device?: CommissionableDevice;
    processing?: { id: string; inProgress: boolean }[] | null;
    /** Network graph data update */
    networkGraphData?: NetworkGraphData;

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
