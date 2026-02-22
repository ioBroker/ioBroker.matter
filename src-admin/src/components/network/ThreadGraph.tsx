/**
 * ThreadGraph - Thread mesh network visualization
 * Shows Thread devices and their mesh connections with signal quality
 */

import BaseNetworkGraph, { type BaseNetworkGraphProps, type BaseNetworkGraphState } from './BaseNetworkGraph';
import type { NetworkGraphNode, NetworkGraphEdge, ThreadRoutingRole } from './NetworkTypes';
import {
    buildExtAddrMap,
    buildRloc16Map,
    findUnknownDevices,
    buildThreadConnections,
    getThreadRoleName,
    parseExtendedAddressToHex,
} from './NetworkUtils';

class ThreadGraph extends BaseNetworkGraph<BaseNetworkGraphProps, BaseNetworkGraphState> {
    protected updateGraph(): void {
        if (!this.nodesDataSet || !this.edgesDataSet) {
            return;
        }

        // Clear stored edge colors since we're rebuilding the graph
        this.clearOriginalEdgeColors();

        const { nodes: allNodes, darkMode } = this.props;

        // Filter Thread nodes
        const threadNodes = allNodes.filter(n => n.networkType === 'thread');

        // Build address maps for matching
        const extAddrMap = buildExtAddrMap(threadNodes);
        const rloc16Map = buildRloc16Map(threadNodes);

        // Find unknown devices in neighbor tables (computed locally, not stored in state)
        const unknownDevices = findUnknownDevices(threadNodes, extAddrMap, rloc16Map);

        // Build connections
        const connections = buildThreadConnections(threadNodes, extAddrMap, unknownDevices, rloc16Map);

        // Create graph nodes
        const graphNodes: NetworkGraphNode[] = [];

        // Add known Thread devices
        for (const node of threadNodes) {
            const role = node.thread?.routingRole as ThreadRoutingRole | null;
            const roleName = getThreadRoleName(role);
            const extAddrHex = node.thread?.extendedAddress
                ? parseExtendedAddressToHex(node.thread.extendedAddress)
                : '';

            graphNodes.push({
                id: node.nodeId,
                label: node.name,
                shape: 'dot',
                size: this.getNodeSize(role),
                color: this.getThreadNodeColor(node.isConnected, role),
                font: { color: darkMode ? '#e0e0e0' : '#333333' },
                title: `${node.name}\nRole: ${roleName}\nAddress: ${extAddrHex}\n${node.isConnected ? 'Connected' : 'Offline'}`,
                networkType: 'thread',
                threadRole: role ?? undefined,
                offline: !node.isConnected,
            });
        }

        // Add external devices (genuinely not on our fabric)
        for (const unknown of unknownDevices) {
            const externalLabel = unknown.isRouter ? 'External Router' : 'External Device';
            graphNodes.push({
                id: unknown.id,
                label: `${externalLabel}\n${unknown.extAddressHex.slice(-8)}`,
                shape: 'dot',
                size: 12,
                color: {
                    background: '#FFC107',
                    border: '#FFA000',
                },
                font: { color: darkMode ? '#e0e0e0' : '#333333' },
                title: `${externalLabel}\nAddress: ${unknown.extAddressHex}\nSeen by: ${unknown.seenBy.length} device(s)`,
                networkType: 'thread',
                isUnknown: true,
            });
        }

        // Build a map of nodeId -> isConnected for checking offline status
        const nodeConnectionStatus = new Map<string, boolean>();
        for (const node of threadNodes) {
            nodeConnectionStatus.set(node.nodeId, node.isConnected);
        }

        // Create graph edges
        const graphEdges: NetworkGraphEdge[] = connections.map((conn, index) => {
            // Check if either endpoint is offline - dashed lines indicate stale data
            const fromOffline = nodeConnectionStatus.get(conn.fromNodeId) === false;
            const toOffline = nodeConnectionStatus.get(conn.toNodeId) === false;
            const hasOfflineEndpoint = fromOffline || toOffline;

            // Build tooltip with enhanced route table data
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

            return {
                id: `edge_${index}`,
                from: conn.fromNodeId,
                to: conn.toNodeId,
                color: {
                    color: conn.signalColor.color,
                    highlight: conn.signalColor.highlight,
                },
                width: 2,
                title: tooltipLines.join('\n'),
                dashes: conn.isUnknown || hasOfflineEndpoint || conn.fromRouteTable,
            };
        });

        // Update datasets
        this.nodesDataSet.clear();
        this.nodesDataSet.add(graphNodes);

        this.edgesDataSet.clear();
        this.edgesDataSet.add(graphEdges);
    }

    // eslint-disable-next-line class-methods-use-this
    private getNodeSize(role: ThreadRoutingRole | null): number {
        switch (role) {
            case 6: // Leader
                return 22;
            case 5: // Router
                return 18;
            case 4: // REED
                return 16;
            default:
                return 14;
        }
    }

    // eslint-disable-next-line class-methods-use-this
    private getThreadNodeColor(
        isConnected: boolean,
        role: ThreadRoutingRole | null,
    ): { background: string; border: string } {
        if (!isConnected) {
            return {
                background: '#9E9E9E',
                border: '#616161',
            };
        }

        switch (role) {
            case 6: // Leader
                return {
                    background: '#9C27B0',
                    border: '#6A1B9A',
                };
            case 5: // Router
                return {
                    background: '#2196F3',
                    border: '#1565C0',
                };
            case 4: // REED
                return {
                    background: '#03A9F4',
                    border: '#0288D1',
                };
            case 3: // End Device
            case 2: // Sleepy End Device
                return {
                    background: '#4CAF50',
                    border: '#2E7D32',
                };
            default:
                return {
                    background: '#607D8B',
                    border: '#455A64',
                };
        }
    }
}

export default ThreadGraph;
