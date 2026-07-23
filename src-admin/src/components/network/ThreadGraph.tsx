/**
 * ThreadGraph - Thread mesh network visualization
 * Shows Thread devices, Border Routers and their mesh connections with signal quality
 */

import { I18n } from '@iobroker/adapter-react-v5';
import BaseNetworkGraph, { type BaseNetworkGraphProps, type BaseNetworkGraphState } from './BaseNetworkGraph';
import type {
    NetworkGraphNode,
    NetworkGraphEdge,
    ThreadRoutingRole,
    BorderRouterEntry,
    ThreadDiagnosticsBatch,
} from './NetworkTypes';
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
    buildMatterRloc16ByXp,
    buildDiagnosticRloc16Map,
    makeDiagnosticRloc16Resolver,
    findDiagnosticMeshNodes,
    mergeDiagnosticEdges,
    findDiagnosticNodeByExtMac,
} from './NetworkUtils';
import { createNodeIconDataUrl, createBorderRouterIconDataUrl, createUnknownDeviceIconDataUrl } from './NetworkIcons';

export interface ThreadGraphProps extends BaseNetworkGraphProps {
    /** mDNS-discovered Thread Border Routers, keyed by uppercase xa hex */
    borderRouters?: ReadonlyMap<string, BorderRouterEntry>;
    /** Thread BR netdiag batches, keyed by uppercase extPanId hex */
    threadDiagnostics?: ReadonlyMap<string, ThreadDiagnosticsBatch>;
    hideOfflineNodes?: boolean;
    hideWeakSignalEdges?: boolean;
    hideMediumSignalEdges?: boolean;
    hideStrongSignalEdges?: boolean;
}

const EMPTY_DIAGNOSTICS: ReadonlyMap<string, ThreadDiagnosticsBatch> = new Map();

class ThreadGraph extends BaseNetworkGraph<ThreadGraphProps, BaseNetworkGraphState> {
    componentDidUpdate(prevProps: ThreadGraphProps): void {
        super.componentDidUpdate(prevProps);
        // BaseNetworkGraph only watches `nodes`/`darkMode`/`selectedNodeId`; rebuild also when the
        // BR registry refreshes or any hide option changes (otherwise stale labels/icons/edges).
        if (
            prevProps.borderRouters !== this.props.borderRouters ||
            prevProps.threadDiagnostics !== this.props.threadDiagnostics ||
            prevProps.hideOfflineNodes !== this.props.hideOfflineNodes ||
            prevProps.hideWeakSignalEdges !== this.props.hideWeakSignalEdges ||
            prevProps.hideMediumSignalEdges !== this.props.hideMediumSignalEdges ||
            prevProps.hideStrongSignalEdges !== this.props.hideStrongSignalEdges
        ) {
            this.updateGraph();
        }
    }

    /** Empty BR-diagnostics map fallback so the merge pipeline always has a map to read. */
    private get threadDiagnostics(): ReadonlyMap<string, ThreadDiagnosticsBatch> {
        return this.props.threadDiagnostics ?? EMPTY_DIAGNOSTICS;
    }

    /** The BR's diagnostic batch, only when present and non-partial. */
    private brBatch(brExtHex: string): ThreadDiagnosticsBatch | undefined {
        const br = this.props.borderRouters?.get(brExtHex.toUpperCase());
        const xp = br?.extendedPanIdHex;
        if (xp === undefined) {
            return undefined;
        }
        const batch = this.threadDiagnostics.get(xp.toUpperCase());
        if (batch === undefined || batch.partialReason !== undefined || batch.nodes.length === 0) {
            return undefined;
        }
        return batch;
    }

    /**
     * The BR's own view of a peer via Route64 / ChildTable, if any. Undefined when the BR has no
     * usable batch, the peer is absent, or the peer is present but only reachable multi-hop.
     */
    private brViewOfPeer(
        brExtHex: string,
        peerExtHex: string,
    ): { linkQualityIn?: number; linkQualityOut?: number; routeCost?: number; isChild?: boolean } | undefined {
        const batch = this.brBatch(brExtHex);
        if (batch === undefined) {
            return undefined;
        }
        const brUp = brExtHex.toUpperCase();
        const target = peerExtHex.toUpperCase();
        const brNode = batch.nodes.find(n => n.extMacAddress?.toUpperCase() === brUp);
        const peerNode = batch.nodes.find(n => n.extMacAddress?.toUpperCase() === target);
        if (brNode?.rloc16 === undefined || peerNode?.rloc16 === undefined) {
            return undefined;
        }
        const peerRouterId = (peerNode.rloc16 >> 10) & 0x3f;
        const peerChildId = peerNode.rloc16 & 0x3ff;

        // A Route64 entry keys on router id, so it only identifies the peer when the peer *is* a
        // router (child id 0). For an end device it would be the BR's route to the peer's parent.
        if (peerChildId === 0) {
            const routeEntry = brNode.route64?.entries.find(e => e.routerId === peerRouterId);
            if (routeEntry !== undefined) {
                return {
                    linkQualityIn: routeEntry.linkQualityIn,
                    linkQualityOut: routeEntry.linkQualityOut,
                    routeCost: routeEntry.routeCost,
                };
            }
        }

        // ChildTable: the BR reports the peer as its own child.
        const brRouterId = (brNode.rloc16 >> 10) & 0x3f;
        const childEntry = brNode.childTable?.find(
            c => (((brRouterId << 10) | c.childId) & 0xffff) === peerNode.rloc16,
        );
        if (childEntry !== undefined) {
            return { isChild: true, linkQualityIn: childEntry.incomingLinkQuality };
        }
        return undefined;
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

        // Merge Thread BR netdiag edges (route64 / childTable) into the connection list, and
        // materialize diagnostic-only mesh routers that match no commissioned/BR/unknown node.
        // Diagnostic references are rloc16-based, resolved per Thread network (extPanId).
        const threadDiagnostics = this.threadDiagnostics;
        const matterRloc16ByXp = buildMatterRloc16ByXp(threadNodes);
        const diagRloc16Map = buildDiagnosticRloc16Map(
            threadDiagnostics,
            matterRloc16ByXp,
            extAddrMap,
            borderRouters ?? new Map(),
            externalDevices,
        );
        const resolveRloc16 = makeDiagnosticRloc16Resolver(matterRloc16ByXp, diagRloc16Map);
        const diagnosticMeshNodes = findDiagnosticMeshNodes(
            threadDiagnostics,
            matterRloc16ByXp,
            extAddrMap,
            borderRouters ?? new Map(),
            externalDevices,
        );
        // buildThreadConnections dedupes bidirectionally; reconstruct its pair keys so merged
        // diagnostic edges only fill gaps (existing Matter/neighbor edges win per pair).
        const seenConnections = new Set<string>();
        for (const conn of connections) {
            seenConnections.add([conn.fromNodeId, conn.toNodeId].sort().join('-'));
        }
        mergeDiagnosticEdges(connections, seenConnections, threadDiagnostics, resolveRloc16);

        // nodeId → extended-address hex (for BR-view edge annotation).
        const nodeIdToExtHex = new Map<string, string>();
        for (const node of threadNodes) {
            if (node.thread?.extendedAddress) {
                nodeIdToExtHex.set(node.nodeId, parseExtendedAddressToHex(node.thread.extendedAddress));
            }
        }

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
                title: `${node.name}\n${I18n.t('Role')}: ${roleName}\n${I18n.t('Extended Address')}: ${extAddrHex}\n${isOffline ? I18n.t('Offline') : I18n.t('Connected')}`,
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
                const top = (hostname ?? device.networkName ?? I18n.t('Border Router')).slice(0, 24);
                const decoded = decodeMeshcopStateBitmap(device.stateBitmapHex);
                const isLeader = decoded?.threadRoleValue === 3;
                const isPrimaryBbr = decoded?.bbr === true && decoded.bbrFunction === 'primary';
                // Child count from the BR's own netdiag entry (childTable length), when available.
                const diagNode = findDiagnosticNodeByExtMac(threadDiagnostics, device.extAddressHex);
                const childCount = diagNode?.childTable?.length;
                const suffixParts: string[] = [];
                if (hostname !== undefined && device.networkName !== undefined && device.networkName !== top) {
                    suffixParts.push(device.networkName);
                }
                if (childCount !== undefined && childCount > 0) {
                    suffixParts.push(`${childCount} ${childCount === 1 ? I18n.t('child') : I18n.t('children')}`);
                }
                const suffix = suffixParts.length > 0 ? `\n${suffixParts.join(' · ')}` : '';
                const roleParts: string[] = [];
                if (isLeader) {
                    roleParts.push(I18n.t('currently the Thread Leader'));
                }
                if (isPrimaryBbr) {
                    roleParts.push(I18n.t('Primary Backbone Border Router (BBR)'));
                }
                const tooltip = [
                    I18n.t('Thread Border Router bridging the Thread mesh to the IP network'),
                    roleParts.length ? roleParts.join('; ') : undefined,
                    device.networkName ? `${I18n.t('Network')}: ${device.networkName}` : undefined,
                    device.vendorName ? `${I18n.t('Vendor')}: ${device.vendorName}` : undefined,
                    device.threadVersion ? `${I18n.t('Thread Version')}: ${device.threadVersion}` : undefined,
                    childCount !== undefined && childCount > 0 ? `${I18n.t('Children')}: ${childCount}` : undefined,
                    device.addresses.length ? `${I18n.t('Addresses')}:\n  ${device.addresses.join('\n  ')}` : undefined,
                    device.sources.length === 0 ? `(${I18n.t('stale')})` : undefined,
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
                    title: tooltip || (hostname ?? I18n.t('Border Router')),
                    networkType: 'thread',
                    hidden: shouldHide,
                });
            } else {
                const typeLabel = device.isRouter ? I18n.t('External Router') : I18n.t('External Device');
                const suffix = device.networkName !== undefined ? `\n${device.networkName}` : '';
                graphNodes.push({
                    id: device.id,
                    label: `${typeLabel} (${device.extAddressHex.slice(-8)})${suffix}`,
                    shape: 'image',
                    image: createUnknownDeviceIconDataUrl(device.isRouter),
                    size: 20,
                    font: { color: darkMode ? '#e0e0e0' : '#333333' },
                    title: `${typeLabel}\n${I18n.t('Extended Address')}: ${device.extAddressHex}\n${I18n.t('Seen by')}: ${device.seenBy.length}`,
                    networkType: 'thread',
                    isUnknown: true,
                    hidden: shouldHide,
                });
            }
        }

        // Diagnostic-only mesh nodes show only when reachable — via a live (non-"none") edge — from
        // a commissioned Matter device. Reachability from a Matter anchor hides foreign islands
        // (e.g. a NEST leader linking only to a BR no Matter device is on) while keeping diagnostic
        // routers that attach to our own networks (directly or through another diagnostic hop).
        if (diagnosticMeshNodes.length > 0) {
            const adjacency = new Map<string, Set<string>>();
            const addAdjacency = (a: string, b: string): void => {
                let peers = adjacency.get(a);
                if (peers === undefined) {
                    peers = new Set<string>();
                    adjacency.set(a, peers);
                }
                peers.add(b);
            };
            for (const conn of connections) {
                if (getSignalLevelFromLqi(conn.lqi) === 'none') {
                    continue;
                }
                addAdjacency(conn.fromNodeId, conn.toNodeId);
                addAdjacency(conn.toNodeId, conn.fromNodeId);
            }
            const reachableIds = new Set<string>();
            const frontier: string[] = [];
            for (const node of threadNodes) {
                if (!hiddenNodeIds.has(node.nodeId)) {
                    reachableIds.add(node.nodeId);
                    frontier.push(node.nodeId);
                }
            }
            for (let i = 0; i < frontier.length; i++) {
                const peers = adjacency.get(frontier[i]);
                if (peers === undefined) {
                    continue;
                }
                for (const peer of peers) {
                    if (!reachableIds.has(peer)) {
                        reachableIds.add(peer);
                        frontier.push(peer);
                    }
                }
            }
            for (const meshNode of diagnosticMeshNodes) {
                const hidden = !reachableIds.has(meshNode.id);
                if (hidden) {
                    hiddenNodeIds.add(meshNode.id);
                }
                const idTail =
                    meshNode.extAddressHex !== undefined
                        ? meshNode.extAddressHex.slice(-8)
                        : `rloc:${meshNode.rloc16.toString(16)}`;
                const childSuffix =
                    meshNode.childCount > 0
                        ? ` · ${meshNode.childCount} ${meshNode.childCount === 1 ? I18n.t('child') : I18n.t('children')}`
                        : '';
                graphNodes.push({
                    id: meshNode.id,
                    label: `${meshNode.vendorName ?? I18n.t('Router')} (${idTail})${childSuffix}\n${meshNode.networkName}`,
                    shape: 'image',
                    image: createUnknownDeviceIconDataUrl(meshNode.isRouter),
                    size: 20,
                    font: { color: darkMode ? '#e0e0e0' : '#333333' },
                    title: I18n.t(
                        'Inferred from Border Router diagnostics (Route64 / child table) and not commissioned to this fabric, so no device details are available.',
                    ),
                    networkType: 'thread',
                    isUnknown: true,
                    hidden,
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

            // If one endpoint is a Border Router, look up the BR's own Route64/ChildTable view of
            // the peer. A confirmed view (or any non-partial batch for the BR) is bidirectional
            // evidence, so the edge renders solid rather than dashed like a pure inference.
            let brExtHex: string | undefined;
            let peerId: string | undefined;
            if (conn.toNodeId.startsWith('br_')) {
                brExtHex = conn.toNodeId.slice(3);
                peerId = conn.fromNodeId;
            } else if (conn.fromNodeId.startsWith('br_')) {
                brExtHex = conn.fromNodeId.slice(3);
                peerId = conn.toNodeId;
            }
            const peerExtHex = peerId !== undefined ? nodeIdToExtHex.get(peerId) : undefined;
            const brView =
                brExtHex !== undefined && peerExtHex !== undefined
                    ? this.brViewOfPeer(brExtHex, peerExtHex)
                    : undefined;
            const brVerified = brExtHex !== undefined && (brView !== undefined || this.brBatch(brExtHex) !== undefined);

            const tooltipLines: string[] = [];
            if (conn.rssi !== null) {
                tooltipLines.push(`RSSI: ${conn.rssi} dBm`);
            }
            tooltipLines.push(`LQI: ${conn.lqi}`);
            if (conn.bidirectionalLqi !== undefined) {
                tooltipLines.push(`${I18n.t('Bidirectional LQI')}: ${conn.bidirectionalLqi}`);
            }
            if (conn.pathCost !== undefined) {
                tooltipLines.push(`${I18n.t('Path Cost')}: ${conn.pathCost}`);
            }
            if (conn.fromRouteTable) {
                tooltipLines.push(`(${I18n.t('Route table only')})`);
            }
            if (brView !== undefined) {
                if (brView.isChild === true) {
                    tooltipLines.push(`(${I18n.t('BR sees as child')})`);
                } else if (brView.linkQualityIn !== undefined || brView.linkQualityOut !== undefined) {
                    const cost = brView.routeCost !== undefined ? ` cost=${brView.routeCost}` : '';
                    tooltipLines.push(
                        `(${I18n.t('BR view')}: in=${brView.linkQualityIn ?? '?'} out=${brView.linkQualityOut ?? '?'}${cost})`,
                    );
                }
            }

            graphEdges.push({
                id: `edge_${index}`,
                from: conn.fromNodeId,
                to: conn.toNodeId,
                color: { color: conn.signalColor.color, highlight: conn.signalColor.highlight },
                width: 2,
                title: tooltipLines.join('\n'),
                dashes: (conn.isUnknown && !brVerified) || hasOfflineEndpoint || conn.fromRouteTable,
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
