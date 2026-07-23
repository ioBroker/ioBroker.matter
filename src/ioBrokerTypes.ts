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
     * Frozen when `sources` becomes empty (the entry is "stale"); updated on every
     * re-discovery. Stale entries are retained for at least 24h after `lastSeen`; the
     * actual prune is lazy and happens on the next `get`, `list`, or mDNS discovery
     * event after the window elapses, so an entry may linger longer than 24h if there
     * is no activity. Consumers can derive stale state via `sources.length === 0` and
     * stale age via `Date.now() - lastSeen`.
     */
    lastSeen: number;
}
