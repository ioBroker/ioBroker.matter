/**
 * Network Graph Utilities
 * Helper functions for processing network data and visualization
 */

import type {
    NetworkNodeData,
    ThreadNeighborEntry,
    ThreadRouteEntry,
    SignalColor,
    SignalLevel,
    ThreadExternalDevice,
    BorderRouterEntry,
    WiFiAccessPoint,
    ThreadRoutingRole,
} from './NetworkTypes';

// WiFi RSSI thresholds (dBm). Used only for the WiFi graph; Thread edges are LQI-driven.
const SIGNAL_STRONG_THRESHOLD = -70;
const SIGNAL_MEDIUM_THRESHOLD = -85;

// Thread LQI thresholds. Spec types LQI as uint8 (0-255), but OpenThread — the dominant
// Thread stack — only ever reports 0-3, so we classify on that scale: 3=strong, 2=medium,
// 1=weak, 0=no link (stale/dead neighbor entry).
const LQI_STRONG_THRESHOLD = 2;
const LQI_MEDIUM_THRESHOLD = 1;

// Signal colors
export const SIGNAL_COLORS = {
    strong: { color: '#4CAF50', highlight: '#2E7D32', label: 'Strong' },
    medium: { color: '#FF9800', highlight: '#EF6C00', label: 'Medium' },
    weak: { color: '#F44336', highlight: '#C62828', label: 'Weak' },
    unknown: { color: '#9E9E9E', highlight: '#616161', label: 'Unknown' },
} as const;

/**
 * Thread connection interface with route table enhancements
 */
export interface ThreadConnection {
    fromNodeId: string;
    toNodeId: string;
    signalColor: SignalColor;
    lqi: number;
    rssi: number | null;
    isUnknown: boolean;
    /** From route table: 1 = direct, higher = multi-hop */
    pathCost?: number;
    /** Average of route.lqiIn and route.lqiOut */
    bidirectionalLqi?: number;
    /** True if connection came from route table only (not in neighbor table) */
    fromRouteTable?: boolean;
}

/**
 * Node connection info for display in details panel
 * Represents a connection from the perspective of a specific node
 */
export interface NodeConnection {
    /** The connected node ID (string for known nodes, or unknown_xxx for unknown devices) */
    connectedNodeId: string;
    /** The connected NetworkNodeData if it's a known device */
    connectedNode?: NetworkNodeData;
    /** Extended address hex string for display */
    extAddressHex: string;
    /** Signal strength info */
    signalColor: SignalColor;
    lqi: number | null;
    rssi: number | null;
    /** Whether this connection is from THIS node's neighbor table (true) or from OTHER node's table (false) */
    isOutgoing: boolean;
    /** Whether this is an unknown/external device */
    isUnknown: boolean;
    /** Path cost from route table (1 = direct, higher = multi-hop) */
    pathCost?: number;
    /** Bidirectional LQI from route table */
    bidirectionalLqi?: number;
}

/**
 * Get signal color based on RSSI value
 */
export function getSignalColorFromRssi(rssi: number | null): SignalColor {
    if (rssi === null) {
        return SIGNAL_COLORS.unknown;
    }
    if (rssi > SIGNAL_STRONG_THRESHOLD) {
        return SIGNAL_COLORS.strong;
    }
    if (rssi > SIGNAL_MEDIUM_THRESHOLD) {
        return SIGNAL_COLORS.medium;
    }
    return SIGNAL_COLORS.weak;
}

/**
 * Map an LQI value to a signal level. OpenThread reports 0-3 in practice (see thresholds);
 * 0 = "none" (no recent valid frames — stale/dead link).
 */
export function getSignalLevelFromLqi(lqi: number): SignalLevel {
    if (lqi <= 0) {
        return 'none';
    }
    if (lqi > LQI_STRONG_THRESHOLD) {
        return 'strong';
    }
    if (lqi > LQI_MEDIUM_THRESHOLD) {
        return 'medium';
    }
    return 'weak';
}

/**
 * Get signal color based on LQI value (0-3 on OpenThread; 0 = no link → grey).
 */
export function getSignalColorFromLqi(lqi: number): SignalColor {
    switch (getSignalLevelFromLqi(lqi)) {
        case 'strong':
            return SIGNAL_COLORS.strong;
        case 'medium':
            return SIGNAL_COLORS.medium;
        case 'weak':
            return SIGNAL_COLORS.weak;
        default:
            return SIGNAL_COLORS.unknown;
    }
}

/**
 * Get signal color for a Thread neighbor. Thread edges are LQI-driven (OpenThread 0-3);
 * RSSI is retained for tooltips/details only, not for edge coloring.
 */
export function getSignalColorFromNeighbor(neighbor: ThreadNeighborEntry): SignalColor {
    return getSignalColorFromLqi(neighbor.lqi);
}

/** Strips trailing dot and `.local` suffix from an mDNS hostname for display. */
export function stripMdnsHostname(hostname: string): string {
    return hostname.replace(/\.$/, '').replace(/\.local$/i, '');
}

/**
 * Decoded form of the MeshCoP `_meshcop` TXT `sb` (state bitmap) field. Layout per OpenThread's
 * border-agent service publication (the de-facto reference for Thread Border Routers):
 *   bit  7     BBR Active
 *   bit  8     BBR Is Primary (only meaningful when BBR Active)
 *   bits 9-10  Thread Role (0=Detached, 1=Child, 2=Router, 3=Leader)
 */
export interface DecodedStateBitmap {
    bbr: boolean;
    /** "primary" / "secondary" — only meaningful when bbr is true. */
    bbrFunction?: 'primary' | 'secondary';
    threadRoleValue: number;
}

/** Decodes a MeshCoP state bitmap hex string (e.g. "000005B1"); undefined if not valid hex. */
export function decodeMeshcopStateBitmap(hex: string | undefined): DecodedStateBitmap | undefined {
    if (hex === undefined || !/^[0-9a-fA-F]{1,8}$/.test(hex)) {
        return undefined;
    }
    const value = parseInt(hex, 16);
    if (!Number.isFinite(value)) {
        return undefined;
    }
    const bbr = ((value >> 7) & 0x1) === 1;
    const bbrIsPrimary = ((value >> 8) & 0x1) === 1;
    return {
        bbr,
        bbrFunction: bbr ? (bbrIsPrimary ? 'primary' : 'secondary') : undefined,
        threadRoleValue: (value >> 9) & 0x3,
    };
}

/**
 * Snapshot of mDNS-discovered Thread Border Routers, keyed by uppercase 16-char xa hex so callers
 * can join against neighbor-table extended addresses normalized to the same casing.
 */
export class BorderRouterStore {
    #entries: ReadonlyMap<string, BorderRouterEntry> = new Map();

    get entries(): ReadonlyMap<string, BorderRouterEntry> {
        return this.#entries;
    }

    setFromList(list: BorderRouterEntry[]): void {
        const next = new Map<string, BorderRouterEntry>();
        for (const entry of list) {
            next.set(entry.extAddressHex.toUpperCase(), entry);
        }
        this.#entries = next;
    }

    reset(): void {
        this.#entries = new Map();
    }
}

/**
 * Parse base64-encoded BSSID to MAC address format (XX:XX:XX:XX:XX:XX)
 */
export function parseBssidToMac(base64: string): string {
    try {
        const binary = atob(base64);
        return Array.from(binary)
            .map(c => c.charCodeAt(0).toString(16).padStart(2, '0'))
            .join(':')
            .toUpperCase();
    } catch {
        return base64; // Return as-is if decoding fails
    }
}

/**
 * Parse base64-encoded extended address to hex string
 */
export function parseExtendedAddressToHex(base64: string): string {
    try {
        const binary = atob(base64);
        // Handle TLV prefix byte if present (9 bytes instead of 8)
        const start = binary.length > 8 ? binary.length - 8 : 0;
        return Array.from(binary)
            .slice(start)
            .map(c => c.charCodeAt(0).toString(16).padStart(2, '0'))
            .join('')
            .toUpperCase();
    } catch {
        return base64;
    }
}

/**
 * Parse base64-encoded extended address to BigInt for comparison
 */
export function parseExtendedAddressToBigInt(base64: string): bigint {
    try {
        const binary = atob(base64);
        let result = 0n;
        // Handle TLV prefix byte if present
        const start = binary.length > 8 ? binary.length - 8 : 0;
        for (let i = start; i < binary.length; i++) {
            result = (result << 8n) | BigInt(binary.charCodeAt(i));
        }
        return result;
    } catch {
        return 0n;
    }
}

/**
 * Build a map of extended addresses (hex) to node IDs for Thread devices
 */
export function buildExtAddrMap(nodes: NetworkNodeData[]): Map<string, string> {
    const map = new Map<string, string>();
    for (const node of nodes) {
        if (node.thread?.extendedAddress) {
            const extAddr = parseExtendedAddressToHex(node.thread.extendedAddress);
            map.set(extAddr, node.nodeId);
        }
    }
    return map;
}

/**
 * Build a map of RLOC16 short addresses to node IDs for Thread devices.
 * Used as fallback when extended address matching fails.
 * RLOC16 is ephemeral (changes on rejoin or role transition) but works well
 * when connection data has been recently refreshed.
 */
export function buildRloc16Map(nodes: NetworkNodeData[]): Map<number, string> {
    const map = new Map<number, string>();
    for (const node of nodes) {
        if (node.thread?.rloc16 != null && node.thread.rloc16 !== 0) {
            map.set(node.thread.rloc16, node.nodeId);
        }
    }
    return map;
}

/**
 * Find unknown Thread devices from neighbor tables.
 * These are devices seen in neighbor tables but not commissioned to this controller.
 * Uses RLOC16 fallback to reduce false "unknown" classifications when extended
 * address matching fails (format edge cases, stale data, missing NetworkInterfaces).
 */
interface ExternalAggregate {
    extAddress: string;
    extAddressHex: string;
    seenBy: string[];
    isRouter: boolean;
    bestRssi: number | null;
    /** xp of the first observing node; all neighbors of a Thread node share its network. */
    extendedPanIdHex?: string;
}

/**
 * Find external Thread devices — addresses seen in neighbor tables that don't match any
 * commissioned device. Classifies each against the optional Border Router registry: matched
 * ones become kind:"br" with full mDNS enrichment, the rest stay kind:"unknown". Uses RLOC16
 * as fallback when extended address matching fails.
 */
export function findUnknownDevices(
    nodes: NetworkNodeData[],
    extAddrMap: Map<string, string>,
    rloc16Map: Map<number, string>,
    borderRouters?: ReadonlyMap<string, BorderRouterEntry>,
): ThreadExternalDevice[] {
    const aggregates = new Map<string, ExternalAggregate>();

    for (const node of nodes) {
        if (node.networkType !== 'thread' || !node.thread?.neighborTable) {
            continue;
        }

        const observerXpHex = node.thread.extendedPanId
            ? parseExtendedAddressToHex(node.thread.extendedPanId)
            : undefined;

        for (const neighbor of node.thread.neighborTable) {
            const extAddrHex = parseExtendedAddressToHex(neighbor.extAddress);

            // Check if this neighbor is in our known devices by extended address
            if (extAddrMap.has(extAddrHex)) {
                continue;
            }

            // RLOC16 fallback: check by short address before classifying as external
            if (neighbor.rloc16 !== 0 && rloc16Map.has(neighbor.rloc16)) {
                continue;
            }

            let agg = aggregates.get(extAddrHex);
            if (agg === undefined) {
                agg = {
                    extAddress: neighbor.extAddress,
                    extAddressHex: extAddrHex,
                    seenBy: [],
                    isRouter: false,
                    bestRssi: null,
                    extendedPanIdHex: observerXpHex,
                };
                aggregates.set(extAddrHex, agg);
            } else if (agg.extendedPanIdHex === undefined && observerXpHex !== undefined) {
                agg.extendedPanIdHex = observerXpHex;
            }

            if (!agg.seenBy.includes(node.nodeId)) {
                agg.seenBy.push(node.nodeId);
            }
            if (neighbor.rxOnWhenIdle) {
                agg.isRouter = true;
            }
            const rssi = neighbor.averageRssi ?? neighbor.lastRssi;
            if (rssi !== null && (agg.bestRssi === null || rssi > agg.bestRssi)) {
                agg.bestRssi = rssi;
            }
        }
    }

    // Pre-compute xp → networkName from the BR registry so unknowns can be labeled by network.
    const networkNameByXp = new Map<string, string>();
    if (borderRouters !== undefined) {
        for (const br of borderRouters.values()) {
            if (br.extendedPanIdHex !== undefined && br.networkName !== undefined) {
                networkNameByXp.set(br.extendedPanIdHex, br.networkName);
            }
        }
    }

    const out = new Array<ThreadExternalDevice>();
    for (const agg of aggregates.values()) {
        const br = borderRouters?.get(agg.extAddressHex);
        if (br !== undefined) {
            out.push({
                kind: 'br',
                ...br,
                id: `br_${agg.extAddressHex}`,
                extAddressHex: agg.extAddressHex,
                seenBy: agg.seenBy,
                isRouter: agg.isRouter,
                bestRssi: agg.bestRssi,
            });
        } else {
            const networkName =
                agg.extendedPanIdHex !== undefined ? networkNameByXp.get(agg.extendedPanIdHex) : undefined;
            out.push({
                kind: 'unknown',
                id: `unknown_${agg.extAddressHex}`,
                extAddress: agg.extAddress,
                extAddressHex: agg.extAddressHex,
                seenBy: agg.seenBy,
                isRouter: agg.isRouter,
                bestRssi: agg.bestRssi,
                extendedPanIdHex: agg.extendedPanIdHex,
                networkName,
            });
        }
    }
    return out;
}

/**
 * Build WiFi access points map from WiFi nodes
 */
export function buildWiFiAccessPoints(nodes: NetworkNodeData[]): WiFiAccessPoint[] {
    const apMap = new Map<string, WiFiAccessPoint>();

    for (const node of nodes) {
        if (node.networkType !== 'wifi' || !node.wifi?.bssid) {
            continue;
        }

        const bssid = node.wifi.bssid;
        const bssidFormatted = parseBssidToMac(bssid);

        if (!apMap.has(bssid)) {
            apMap.set(bssid, {
                bssid,
                bssidFormatted,
                connectedNodes: [],
            });
        }

        apMap.get(bssid)!.connectedNodes.push(node.nodeId);
    }

    return Array.from(apMap.values());
}

/**
 * Get Thread routing role display name
 */
export function getThreadRoleName(role: ThreadRoutingRole | number | null): string {
    if (role === null) {
        return 'Unknown';
    }
    switch (role) {
        case 0:
            return 'Unspecified';
        case 1:
            return 'Unassigned';
        case 2:
            return 'Sleepy End Device';
        case 3:
            return 'End Device';
        case 4:
            return 'REED';
        case 5:
            return 'Router';
        case 6:
            return 'Leader';
        default:
            return 'Unknown';
    }
}

/**
 * Human-readable Thread version from the NetworkCommissioning ThreadVersion TLV.
 * Unmapped values render with the raw TLV so newer-than-table devices stay visible.
 */
export function formatThreadVersion(tlv: number | null): string | null {
    if (tlv === null) {
        return null;
    }
    const names: Record<number, string> = { 1: '1.0', 2: '1.1', 3: '1.2', 4: '1.3', 5: '1.4' };
    const name = names[tlv];
    return name !== undefined ? `Thread ${name}` : `Thread unknown (${tlv})`;
}

/**
 * Get WiFi security type name
 */
export function getWiFiSecurityTypeName(securityType: number | null): string {
    if (securityType === null) {
        return 'Unknown';
    }
    switch (securityType) {
        case 0:
            return 'Unspecified';
        case 1:
            return 'None';
        case 2:
            return 'WEP';
        case 3:
            return 'WPA Personal';
        case 4:
            return 'WPA2 Personal';
        case 5:
            return 'WPA3 Personal';
        default:
            return 'Unknown';
    }
}

/**
 * Get WiFi version name
 */
export function getWiFiVersionName(version: number | null): string {
    if (version === null) {
        return 'Unknown';
    }
    switch (version) {
        case 0:
            return '802.11a';
        case 1:
            return '802.11b';
        case 2:
            return '802.11g';
        case 3:
            return '802.11n';
        case 4:
            return '802.11ac';
        case 5:
            return '802.11ax';
        case 6:
            return '802.11ah';
        default:
            return 'Unknown';
    }
}

/**
 * Categorize nodes by network type
 */
export function categorizeNodes(nodes: NetworkNodeData[]): {
    thread: NetworkNodeData[];
    wifi: NetworkNodeData[];
    ethernet: NetworkNodeData[];
    unknown: NetworkNodeData[];
} {
    const result = {
        thread: [] as NetworkNodeData[],
        wifi: [] as NetworkNodeData[],
        ethernet: [] as NetworkNodeData[],
        unknown: [] as NetworkNodeData[],
    };

    for (const node of nodes) {
        result[node.networkType].push(node);
    }

    return result;
}

/**
 * Format a numeric node ID as hex string in the format \@1:hexvalue
 */
export function formatNodeIdHex(nodeId: number | bigint | string): string {
    let numericId: bigint;
    if (typeof nodeId === 'bigint') {
        numericId = nodeId;
    } else if (typeof nodeId === 'number') {
        numericId = BigInt(nodeId);
    } else {
        try {
            numericId = BigInt(nodeId);
        } catch {
            return '';
        }
    }
    return `@1:${numericId.toString(16)}`;
}

/**
 * Get network type for a node based on its available diagnostics data
 */
export function getNetworkTypeForNode(node: NetworkNodeData): 'thread' | 'wifi' | 'ethernet' | 'unknown' {
    return node.networkType;
}

/**
 * Find a route table entry for a specific destination by extended address (hex string).
 */
export function findRouteByExtAddress(
    routeTable: ThreadRouteEntry[] | undefined,
    targetExtAddrHex: string,
): ThreadRouteEntry | undefined {
    if (!routeTable) {
        return undefined;
    }
    return routeTable.find(route => {
        const routeExtAddrHex = parseExtendedAddressToHex(route.extAddress);
        return routeExtAddrHex === targetExtAddrHex && route.linkEstablished;
    });
}

/**
 * Count routable destinations for a node (from route table).
 * Only meaningful for router nodes.
 */
export function getRoutableDestinationsCount(routeTable: ThreadRouteEntry[] | undefined): number {
    if (!routeTable) {
        return 0;
    }
    return routeTable.filter(route => route.allocated && route.linkEstablished).length;
}

/**
 * Calculate combined bidirectional LQI from route table entry.
 */
export function getRouteBidirectionalLqi(route: ThreadRouteEntry): number | undefined {
    if (route.lqiIn > 0 && route.lqiOut > 0) {
        return Math.round((route.lqiIn + route.lqiOut) / 2);
    }
    if (route.lqiIn > 0) {
        return route.lqiIn;
    }
    if (route.lqiOut > 0) {
        return route.lqiOut;
    }
    return undefined;
}

/**
 * Build Thread mesh connections from neighbor tables with route table enhancement.
 * Uses RLOC16 fallback when extended address matching fails.
 */
export function buildThreadConnections(
    nodes: NetworkNodeData[],
    extAddrMap: Map<string, string>,
    unknownDevices: ThreadExternalDevice[],
    rloc16Map: Map<number, string>,
): ThreadConnection[] {
    const connections: ThreadConnection[] = [];
    const seenConnections = new Set<string>();

    // Build map of unknown device extAddress -> id
    const unknownExtAddrMap = new Map<string, string>();
    for (const unknown of unknownDevices) {
        unknownExtAddrMap.set(unknown.extAddressHex, unknown.id);
    }

    for (const node of nodes) {
        if (node.networkType !== 'thread' || !node.thread?.neighborTable) {
            continue;
        }

        // 1. Process neighbor table entries with route table enhancement
        for (const neighbor of node.thread.neighborTable) {
            const neighborExtAddrHex = parseExtendedAddressToHex(neighbor.extAddress);

            // Try to find in known devices first by extended address
            let toNodeId: string | undefined = extAddrMap.get(neighborExtAddrHex);
            let isUnknown = false;

            // RLOC16 fallback for known devices
            if (toNodeId === undefined && neighbor.rloc16 !== 0) {
                toNodeId = rloc16Map.get(neighbor.rloc16);
            }

            // If not found in known devices, check unknown devices
            if (toNodeId === undefined) {
                toNodeId = unknownExtAddrMap.get(neighborExtAddrHex);
                isUnknown = true;
            }

            if (toNodeId === undefined) {
                continue;
            }

            // Skip self-connections
            if (node.nodeId === toNodeId) {
                continue;
            }

            // Create unique key for this connection (bidirectional)
            const connectionKey = [node.nodeId, toNodeId].sort().join('-');

            if (seenConnections.has(connectionKey)) {
                continue;
            }
            seenConnections.add(connectionKey);

            // Look up route table for supplementary data
            const routeEntry = findRouteByExtAddress(node.thread.routeTable, neighborExtAddrHex);
            const bidirectionalLqi = routeEntry ? getRouteBidirectionalLqi(routeEntry) : undefined;

            // IMPORTANT: Always use neighbor table RSSI/LQI for signal color (most accurate)
            connections.push({
                fromNodeId: node.nodeId,
                toNodeId,
                signalColor: getSignalColorFromNeighbor(neighbor),
                lqi: neighbor.lqi,
                rssi: neighbor.averageRssi ?? neighbor.lastRssi,
                isUnknown,
                pathCost: routeEntry?.pathCost,
                bidirectionalLqi,
            });
        }

        // 2. Check route table for supplementary connections NOT in neighbor table
        if (node.thread.routeTable) {
            for (const route of node.thread.routeTable) {
                if (!route.linkEstablished || !route.allocated) {
                    continue;
                }

                const routeExtAddrHex = parseExtendedAddressToHex(route.extAddress);

                // Try to find in known devices first by extended address
                let toNodeId: string | undefined = extAddrMap.get(routeExtAddrHex);
                let isUnknown = false;

                // RLOC16 fallback for known devices
                if (toNodeId === undefined && route.rloc16 !== 0) {
                    toNodeId = rloc16Map.get(route.rloc16);
                }

                // If not found in known devices, check unknown devices
                if (toNodeId === undefined) {
                    toNodeId = unknownExtAddrMap.get(routeExtAddrHex);
                    isUnknown = true;
                }

                if (toNodeId === undefined || toNodeId === node.nodeId) {
                    continue;
                }

                // Create unique key for this connection (bidirectional)
                const connectionKey = [node.nodeId, toNodeId].sort().join('-');

                // Only add if not already in neighbor table connections
                if (seenConnections.has(connectionKey)) {
                    continue;
                }
                seenConnections.add(connectionKey);

                const bidirectionalLqi = getRouteBidirectionalLqi(route);
                const signalColor =
                    bidirectionalLqi !== undefined ? getSignalColorFromLqi(bidirectionalLqi) : SIGNAL_COLORS.unknown;

                connections.push({
                    fromNodeId: node.nodeId,
                    toNodeId,
                    signalColor,
                    lqi: bidirectionalLqi ?? 0,
                    rssi: null,
                    isUnknown,
                    pathCost: route.pathCost,
                    bidirectionalLqi,
                    fromRouteTable: true,
                });
            }
        }
    }

    return connections;
}

/**
 * Get all connections for a specific Thread node (bidirectional).
 * This includes:
 * 1. Neighbors this node reports in its neighbor table (outgoing)
 * 2. Nodes that report this node as their neighbor (incoming)
 *
 * Returns a deduplicated list - if both directions exist, the outgoing one
 * is included (since that has signal data from THIS node's perspective).
 *
 * @param nodeId - Node ID to get connections for
 * @param nodes - All nodes
 * @param extAddrMap - Map of extended addresses to node IDs
 * @param rloc16Map - Map of RLOC16 short addresses to node IDs (fallback)
 */
export function getNodeConnections(
    nodeId: string,
    nodes: NetworkNodeData[],
    extAddrMap: Map<string, string>,
    rloc16Map: Map<number, string>,
): NodeConnection[] {
    const connections: NodeConnection[] = [];
    const seenConnectedIds = new Set<string>();

    const node = nodes.find(n => n.nodeId === nodeId);
    if (!node || node.networkType !== 'thread') {
        return connections;
    }

    // Get this node's extended address for reverse lookups
    const thisExtAddrHex = node.thread?.extendedAddress ? parseExtendedAddressToHex(node.thread.extendedAddress) : null;

    // 1. Add neighbors this node reports (outgoing connections)
    if (node.thread?.neighborTable) {
        for (const neighbor of node.thread.neighborTable) {
            const neighborExtAddrHex = parseExtendedAddressToHex(neighbor.extAddress);
            const connectedNodeId =
                extAddrMap.get(neighborExtAddrHex) ??
                (neighbor.rloc16 !== 0 ? rloc16Map.get(neighbor.rloc16) : undefined);
            const connectedNode = connectedNodeId ? nodes.find(n => n.nodeId === connectedNodeId) : undefined;
            const isUnknown = connectedNodeId === undefined;
            const displayId: string = isUnknown ? `unknown_${neighborExtAddrHex}` : connectedNodeId;

            seenConnectedIds.add(displayId);

            // Look up route table entry for enhanced data
            const routeEntry = findRouteByExtAddress(node.thread?.routeTable, neighborExtAddrHex);
            const bidirectionalLqi = routeEntry ? getRouteBidirectionalLqi(routeEntry) : undefined;

            connections.push({
                connectedNodeId: displayId,
                connectedNode,
                extAddressHex: neighborExtAddrHex,
                signalColor: getSignalColorFromNeighbor(neighbor),
                lqi: neighbor.lqi,
                rssi: neighbor.averageRssi ?? neighbor.lastRssi,
                isOutgoing: true,
                isUnknown,
                pathCost: routeEntry?.pathCost,
                bidirectionalLqi,
            });
        }
    }

    // 2. Find nodes that report THIS node as their neighbor (incoming connections)
    if (thisExtAddrHex) {
        for (const otherNode of nodes) {
            if (otherNode.nodeId === nodeId) {
                continue; // Skip self
            }
            if (otherNode.networkType !== 'thread' || !otherNode.thread?.neighborTable) {
                continue;
            }

            // Check if already connected via outgoing
            if (seenConnectedIds.has(otherNode.nodeId)) {
                continue;
            }

            // Check if other node reports this node as neighbor
            const reverseEntry = otherNode.thread.neighborTable.find(
                n => parseExtendedAddressToHex(n.extAddress) === thisExtAddrHex,
            );

            if (reverseEntry) {
                const otherExtAddrHex = otherNode.thread?.extendedAddress
                    ? parseExtendedAddressToHex(otherNode.thread.extendedAddress)
                    : 'Unknown';

                // Look up route table entry from the other node's perspective
                const routeEntry = findRouteByExtAddress(otherNode.thread?.routeTable, thisExtAddrHex);
                const bidirectionalLqi = routeEntry ? getRouteBidirectionalLqi(routeEntry) : undefined;

                connections.push({
                    connectedNodeId: otherNode.nodeId,
                    connectedNode: otherNode,
                    extAddressHex: otherExtAddrHex,
                    signalColor: getSignalColorFromNeighbor(reverseEntry),
                    lqi: reverseEntry.lqi,
                    rssi: reverseEntry.averageRssi ?? reverseEntry.lastRssi,
                    isOutgoing: false,
                    isUnknown: false,
                    pathCost: routeEntry?.pathCost,
                    bidirectionalLqi,
                });
            }
        }
    }

    return connections;
}
