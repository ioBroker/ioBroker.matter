/**
 * Network Graph Utilities
 * Helper functions for processing network data and visualization
 */

import type {
    NetworkNodeData,
    ThreadNeighborEntry,
    ThreadRouteEntry,
    SignalColor,
    UnknownThreadDevice,
    WiFiAccessPoint,
    ThreadRoutingRole,
} from './NetworkTypes';

// Signal strength thresholds (dBm)
const SIGNAL_STRONG_THRESHOLD = -70;
const SIGNAL_MEDIUM_THRESHOLD = -85;

// LQI thresholds (0-255)
const LQI_STRONG_THRESHOLD = 200;
const LQI_MEDIUM_THRESHOLD = 100;

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
 * Get signal color based on LQI value (0-255)
 */
export function getSignalColorFromLqi(lqi: number): SignalColor {
    if (lqi > LQI_STRONG_THRESHOLD) {
        return SIGNAL_COLORS.strong;
    }
    if (lqi > LQI_MEDIUM_THRESHOLD) {
        return SIGNAL_COLORS.medium;
    }
    return SIGNAL_COLORS.weak;
}

/**
 * Get signal color from neighbor entry (prefers RSSI, falls back to LQI)
 */
export function getSignalColorFromNeighbor(neighbor: ThreadNeighborEntry): SignalColor {
    const rssi = neighbor.averageRssi ?? neighbor.lastRssi;
    if (rssi !== null) {
        return getSignalColorFromRssi(rssi);
    }
    return getSignalColorFromLqi(neighbor.lqi);
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
export function findUnknownDevices(
    nodes: NetworkNodeData[],
    extAddrMap: Map<string, string>,
    rloc16Map: Map<number, string>,
): UnknownThreadDevice[] {
    const unknownMap = new Map<string, UnknownThreadDevice>();

    for (const node of nodes) {
        if (node.networkType !== 'thread' || !node.thread?.neighborTable) {
            continue;
        }

        for (const neighbor of node.thread.neighborTable) {
            const extAddrHex = parseExtendedAddressToHex(neighbor.extAddress);

            // Check if this neighbor is in our known devices by extended address
            if (extAddrMap.has(extAddrHex)) {
                continue;
            }

            // RLOC16 fallback: check by short address before classifying as unknown
            if (neighbor.rloc16 !== 0 && rloc16Map.has(neighbor.rloc16)) {
                continue;
            }

            const id = `unknown_${extAddrHex}`;

            if (!unknownMap.has(id)) {
                unknownMap.set(id, {
                    id,
                    extAddress: neighbor.extAddress,
                    extAddressHex: extAddrHex,
                    seenBy: [],
                    isRouter: false,
                    bestRssi: null,
                });
            }

            const unknown = unknownMap.get(id)!;

            // Add this node to seenBy if not already there
            if (!unknown.seenBy.includes(node.nodeId)) {
                unknown.seenBy.push(node.nodeId);
            }

            // Update router status (rxOnWhenIdle indicates router-like behavior)
            if (neighbor.rxOnWhenIdle) {
                unknown.isRouter = true;
            }

            // Track best signal
            const rssi = neighbor.averageRssi ?? neighbor.lastRssi;
            if (rssi !== null && (unknown.bestRssi === null || rssi > unknown.bestRssi)) {
                unknown.bestRssi = rssi;
            }
        }
    }

    return Array.from(unknownMap.values());
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
 * Format a numeric node ID as hex string in the format @1:hexvalue
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
    unknownDevices: UnknownThreadDevice[],
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
