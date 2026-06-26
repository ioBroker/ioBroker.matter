/**
 * ThreadGraph - Thread mesh network visualization
 * Shows Thread devices, Border Routers and their mesh connections with signal quality
 */

import BaseNetworkGraph, { type BaseNetworkGraphProps, type BaseNetworkGraphState } from './BaseNetworkGraph';
import type { NetworkGraphNode, NetworkGraphEdge, ThreadRoutingRole, BorderRouterEntry } from './NetworkTypes';
import {
    buildExtAddrMap,
    buildRloc16Map,
    findUnknownDevices,
    buildThreadConnections,
    getThreadRoleName,
    getSignalLevelFromLqi,
    decodeMeshcopStateBitmap,
    stripMdnsHostname,
    parseExtendedAddressToHex,
} from './NetworkUtils';
import { createNodeIconDataUrl, createBorderRouterIconDataUrl, createUnknownDeviceIconDataUrl } from './NetworkIcons';

export interface ThreadGraphProps extends BaseNetworkGraphProps {
    /** mDNS-discovered Thread Border Routers, keyed by uppercase xa hex */
    borderRouters?: ReadonlyMap<string, BorderRouterEntry>;
    hideOfflineNodes?: boolean;
    hideWeakSignalEdges?: boolean;
    hideMediumSignalEdges?: boolean;
    hideStrongSignalEdges?: boolean;
}

class ThreadGraph extends BaseNetworkGraph<ThreadGraphProps, BaseNetworkGraphState> {
    componentDidUpdate(prevProps: ThreadGraphProps): void {
        super.componentDidUpdate(prevProps);
        // BaseNetworkGraph only watches `nodes`/`darkMode`/`selectedNodeId`; rebuild also when the
        // BR registry refreshes or any hide option changes (otherwise stale labels/icons/edges).
        if (
            prevProps.borderRouters !== this.props.borderRouters ||
            prevProps.hideOfflineNodes !== this.props.hideOfflineNodes ||
            prevProps.hideWeakSignalEdges !== this.props.hideWeakSignalEdges ||
            prevProps.hideMediumSignalEdges !== this.props.hideMediumSignalEdges ||
            prevProps.hideStrongSignalEdges !== this.props.hideStrongSignalEdges
        ) {
            this.updateGraph();
        }
    }

    protected updateGraph(): void {
        if (!this.nodesDataSet || !this.edgesDataSet) {
            return;
        }

        this.clearOriginalEdgeColors();

        const { nodes: allNodes, darkMode, borderRouters } = this.props;
        const hideOfflineNodes = this.props.hideOfflineNodes ?? false;
        const hideWeakSignalEdges = this.props.hideWeakSignalEdges ?? false;
        const hideMediumSignalEdges = this.props.hideMediumSignalEdges ?? false;
        const hideStrongSignalEdges = this.props.hideStrongSignalEdges ?? false;

        const threadNodes = allNodes.filter(n => n.networkType === 'thread');

        const extAddrMap = buildExtAddrMap(threadNodes);
        const rloc16Map = buildRloc16Map(threadNodes);

        // External devices (seen in neighbor tables but not commissioned), classified against the
        // BR registry so mDNS-known routers render distinctly.
        const externalDevices = findUnknownDevices(threadNodes, extAddrMap, rloc16Map, borderRouters);

        const connections = buildThreadConnections(threadNodes, extAddrMap, externalDevices, rloc16Map);

        const graphNodes: NetworkGraphNode[] = [];
        const hiddenNodeIds = new Set<string>();

        // Known Thread devices
        for (const node of threadNodes) {
            const role = node.thread?.routingRole as ThreadRoutingRole | null;
            const roleName = getThreadRoleName(role);
            const extAddrHex = node.thread?.extendedAddress
                ? parseExtendedAddressToHex(node.thread.extendedAddress)
                : '';
            const isOffline = !node.isConnected;
            const shouldHide = hideOfflineNodes && isOffline;
            if (shouldHide) {
                hiddenNodeIds.add(node.nodeId);
            }

            graphNodes.push({
                id: node.nodeId,
                label: node.name,
                shape: 'image',
                image: createNodeIconDataUrl(node.deviceType, role, isOffline),
                size: 24,
                font: { color: darkMode ? '#e0e0e0' : '#333333' },
                title: `${node.name}\nRole: ${roleName}\nAddress: ${extAddrHex}\n${isOffline ? 'Offline' : 'Connected'}`,
                networkType: 'thread',
                threadRole: role ?? undefined,
                offline: isOffline,
                hidden: shouldHide,
            });
        }

        // Status map for offline-cascade on edges
        const nodeConnectionStatus = new Map<string, boolean>();
        for (const node of threadNodes) {
            nodeConnectionStatus.set(node.nodeId, node.isConnected);
        }
        const neighborCount = new Map<string, number>();
        for (const node of threadNodes) {
            neighborCount.set(node.nodeId, node.thread?.neighborTable?.length ?? 0);
        }

        // External devices: known Border Routers (friendly label/icon) vs unidentified neighbors
        for (const device of externalDevices) {
            const hasOnlineObserver = device.seenBy.some(id => nodeConnectionStatus.get(id) === true);

            // Unknown externals are pure neighbor-table inference. Two stale-cache signatures we
            // always filter: (1) every observer offline (can't re-confirm); (2) a single observer
            // that has other neighbors (single-source ghost from an otherwise-reachable node).
            // BRs have independent mDNS evidence — honor only the user toggle for them.
            let shouldHide: boolean;
            if (device.kind === 'unknown') {
                shouldHide = !hasOnlineObserver;
                if (!shouldHide && device.seenBy.length === 1 && (neighborCount.get(device.seenBy[0]) ?? 0) > 1) {
                    shouldHide = true;
                }
            } else {
                shouldHide = hideOfflineNodes && !hasOnlineObserver;
            }
            if (shouldHide) {
                hiddenNodeIds.add(device.id);
            }

            if (device.kind === 'br') {
                const hostname = device.hostname !== undefined ? stripMdnsHostname(device.hostname) : undefined;
                const top = (hostname ?? device.networkName ?? 'Border Router').slice(0, 24);
                const suffix =
                    hostname !== undefined && device.networkName !== undefined && device.networkName !== top
                        ? `\n${device.networkName}`
                        : '';
                const decoded = decodeMeshcopStateBitmap(device.stateBitmapHex);
                const isLeader = decoded?.threadRoleValue === 3;
                const isPrimaryBbr = decoded?.bbr === true && decoded.bbrFunction === 'primary';
                const tooltip = [
                    device.networkName ? `Network: ${device.networkName}` : undefined,
                    device.vendorName ? `Vendor: ${device.vendorName}` : undefined,
                    device.threadVersion ? `Thread: ${device.threadVersion}` : undefined,
                    device.addresses.length ? `Addresses:\n  ${device.addresses.join('\n  ')}` : undefined,
                    device.sources.length === 0 ? '(stale)' : undefined,
                ]
                    .filter(Boolean)
                    .join('\n');
                graphNodes.push({
                    id: device.id,
                    label: `${top}${suffix}`,
                    shape: 'image',
                    image: createBorderRouterIconDataUrl(false, isLeader, isPrimaryBbr),
                    size: 26,
                    font: { color: darkMode ? '#e0e0e0' : '#333333' },
                    title: tooltip || (hostname ?? 'Border Router'),
                    networkType: 'thread',
                    hidden: shouldHide,
                });
            } else {
                const typeLabel = device.isRouter ? 'External Router' : 'External Device';
                const suffix = device.networkName !== undefined ? `\n${device.networkName}` : '';
                graphNodes.push({
                    id: device.id,
                    label: `${typeLabel} (${device.extAddressHex.slice(-8)})${suffix}`,
                    shape: 'image',
                    image: createUnknownDeviceIconDataUrl(device.isRouter),
                    size: 20,
                    font: { color: darkMode ? '#e0e0e0' : '#333333' },
                    title: `${typeLabel}\nAddress: ${device.extAddressHex}\nSeen by: ${device.seenBy.length} device(s)`,
                    networkType: 'thread',
                    isUnknown: true,
                    hidden: shouldHide,
                });
            }
        }

        // Edges
        const graphEdges: NetworkGraphEdge[] = [];
        connections.forEach((conn, index) => {
            const level = getSignalLevelFromLqi(conn.lqi);
            const fromOffline = nodeConnectionStatus.get(conn.fromNodeId) === false;
            const toOffline = nodeConnectionStatus.get(conn.toNodeId) === false;
            const hasOfflineEndpoint = fromOffline || toOffline;

            // No-link (LQI=0) edges are never drawn; apply signal-level filters + offline cascade.
            let hidden = level === 'none';
            if (!hidden && (hiddenNodeIds.has(conn.fromNodeId) || hiddenNodeIds.has(conn.toNodeId))) {
                hidden = true;
            }
            if (!hidden && hideWeakSignalEdges && level === 'weak') {
                hidden = true;
            }
            if (!hidden && hideMediumSignalEdges && level === 'medium') {
                hidden = true;
            }
            if (!hidden && hideStrongSignalEdges && level === 'strong') {
                hidden = true;
            }

            const tooltipLines: string[] = [];
            if (conn.rssi !== null) {
                tooltipLines.push(`RSSI: ${conn.rssi} dBm`);
            }
            tooltipLines.push(`LQI: ${conn.lqi}`);
            if (conn.bidirectionalLqi !== undefined) {
                tooltipLines.push(`Bidirectional LQI: ${conn.bidirectionalLqi}`);
            }
            if (conn.pathCost !== undefined) {
                tooltipLines.push(`Path Cost: ${conn.pathCost}`);
            }
            if (conn.fromRouteTable) {
                tooltipLines.push('(Route table only)');
            }

            graphEdges.push({
                id: `edge_${index}`,
                from: conn.fromNodeId,
                to: conn.toNodeId,
                color: { color: conn.signalColor.color, highlight: conn.signalColor.highlight },
                width: 2,
                title: tooltipLines.join('\n'),
                dashes: conn.isUnknown || hasOfflineEndpoint || conn.fromRouteTable,
                hidden,
            });
        });

        this.nodesDataSet.clear();
        this.nodesDataSet.add(graphNodes);
        this.edgesDataSet.clear();
        this.edgesDataSet.add(graphEdges);
    }

    /**
     * Selects a Thread node (known device or external) matching the query, in priority order:
     * extended address (EUI-64; accepts `AABB...`, `AA:BB:...`, `0x...`), exact node id, then a
     * case-insensitive device-name substring. Returns the matched id, or null when nothing matches.
     */
    public findNodeBySearch(query: string): string | null {
        const trimmed = query.trim();
        if (!trimmed) {
            return null;
        }
        const { nodes: allNodes, borderRouters } = this.props;
        const hideOfflineNodes = this.props.hideOfflineNodes ?? false;
        const threadNodes = allNodes.filter(n => n.networkType === 'thread' && !(hideOfflineNodes && !n.isConnected));

        const normalized = normalizeExtendedAddressInput(trimmed);
        if (normalized) {
            for (const node of threadNodes) {
                const hex = node.thread?.extendedAddress ? parseExtendedAddressToHex(node.thread.extendedAddress) : '';
                if (hex === normalized) {
                    return node.nodeId;
                }
            }
            const extAddrMap = buildExtAddrMap(threadNodes);
            const rloc16Map = buildRloc16Map(threadNodes);
            const externalDevices = findUnknownDevices(threadNodes, extAddrMap, rloc16Map, borderRouters);
            for (const device of externalDevices) {
                if (device.extAddressHex === normalized) {
                    return device.id;
                }
            }
        }

        for (const node of threadNodes) {
            if (node.nodeId === trimmed) {
                return node.nodeId;
            }
        }

        const needle = trimmed.toLowerCase();
        for (const node of threadNodes) {
            if (node.name.toLowerCase().includes(needle)) {
                return node.nodeId;
            }
        }
        return null;
    }
}

function normalizeExtendedAddressInput(address: string): string | null {
    const trimmed = address.trim();
    if (!trimmed) {
        return null;
    }
    const noPrefix = trimmed.startsWith('0x') || trimmed.startsWith('0X') ? trimmed.slice(2) : trimmed;
    const hexOnly = noPrefix.replace(/[^a-fA-F0-9]/g, '');
    if (hexOnly.length !== 16) {
        return null;
    }
    return hexOnly.toUpperCase();
}

export default ThreadGraph;
