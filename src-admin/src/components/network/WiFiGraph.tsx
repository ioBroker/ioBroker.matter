/**
 * WiFiGraph - WiFi network visualization
 * Shows WiFi devices grouped by access point in a star topology
 */

import type { Options } from 'vis-network';
import BaseNetworkGraph, { type BaseNetworkGraphProps, type BaseNetworkGraphState } from './BaseNetworkGraph';
import type { NetworkGraphNode, NetworkGraphEdge } from './NetworkTypes';
import {
    buildWiFiAccessPoints,
    getSignalColorFromRssi,
    getWiFiSecurityTypeName,
    getWiFiVersionName,
} from './NetworkUtils';

class WiFiGraph extends BaseNetworkGraph<BaseNetworkGraphProps, BaseNetworkGraphState> {
    // eslint-disable-next-line class-methods-use-this
    protected getPhysicsOptions(): Options['physics'] {
        // Override physics for star topology
        return {
            enabled: true,
            solver: 'forceAtlas2Based',
            forceAtlas2Based: {
                gravitationalConstant: -120,
                centralGravity: 0.003,
                springLength: 100,
                springConstant: 0.1,
                damping: 0.4,
                avoidOverlap: 0.8,
            },
            stabilization: {
                enabled: true,
                iterations: 300,
                updateInterval: 25,
            },
        };
    }

    protected updateGraph(): void {
        if (!this.nodesDataSet || !this.edgesDataSet) {
            return;
        }

        // Clear stored edge colors since we're rebuilding the graph
        this.clearOriginalEdgeColors();

        const { nodes: allNodes, darkMode } = this.props;

        // Filter WiFi nodes
        const wifiNodes = allNodes.filter(n => n.networkType === 'wifi');

        // Build access points (computed locally, not stored in state)
        const accessPoints = buildWiFiAccessPoints(wifiNodes);

        // Create graph nodes
        const graphNodes: NetworkGraphNode[] = [];

        // Add access point nodes
        for (const ap of accessPoints) {
            graphNodes.push({
                id: `ap_${ap.bssid}`,
                label: `AP\n${ap.bssidFormatted}`,
                shape: 'dot',
                size: 20,
                color: {
                    background: '#FF5722',
                    border: '#D84315',
                },
                font: { color: darkMode ? '#e0e0e0' : '#333333' },
                title: `Access Point\nBSSID: ${ap.bssidFormatted}\nConnected devices: ${ap.connectedNodes.length}`,
                networkType: 'wifi',
                isAccessPoint: true,
            });
        }

        // Add WiFi device nodes
        for (const node of wifiNodes) {
            const securityType = getWiFiSecurityTypeName(node.wifi?.securityType ?? null);
            const wifiVersion = getWiFiVersionName(node.wifi?.wifiVersion ?? null);
            const rssi = node.wifi?.rssi ?? null;
            const channel = node.wifi?.channel ?? null;

            graphNodes.push({
                id: node.nodeId,
                label: node.name,
                shape: 'dot',
                size: 14,
                color: this.getWiFiNodeColor(node.isConnected, rssi),
                font: { color: darkMode ? '#e0e0e0' : '#333333' },
                title: `${node.name}\n${node.isConnected ? 'Connected' : 'Offline'}${rssi !== null ? `\nRSSI: ${rssi} dBm` : ''}${channel !== null ? `\nChannel: ${channel}` : ''}\nSecurity: ${securityType}\nWiFi: ${wifiVersion}`,
                networkType: 'wifi',
                offline: !node.isConnected,
            });
        }

        // Create edges from devices to access points
        const graphEdges: NetworkGraphEdge[] = [];
        let edgeIndex = 0;

        for (const node of wifiNodes) {
            if (!node.wifi?.bssid) {
                continue;
            }

            const rssi = node.wifi.rssi;
            const signalColor = getSignalColorFromRssi(rssi);
            // Dashed lines for offline nodes - indicates stale connection data
            const isOffline = !node.isConnected;

            graphEdges.push({
                id: `edge_${edgeIndex++}`,
                from: node.nodeId,
                to: `ap_${node.wifi.bssid}`,
                color: {
                    color: signalColor.color,
                    highlight: signalColor.highlight,
                },
                width: 2,
                title: rssi !== null ? `RSSI: ${rssi} dBm` : 'Signal: Unknown',
                dashes: isOffline,
            });
        }

        // Update datasets
        this.nodesDataSet.clear();
        this.nodesDataSet.add(graphNodes);

        this.edgesDataSet.clear();
        this.edgesDataSet.add(graphEdges);
    }

    // eslint-disable-next-line class-methods-use-this
    private getWiFiNodeColor(isConnected: boolean, rssi: number | null): { background: string; border: string } {
        if (!isConnected) {
            return {
                background: '#9E9E9E',
                border: '#616161',
            };
        }

        // Color based on signal strength
        const signalColor = getSignalColorFromRssi(rssi);
        if (signalColor.color === '#4CAF50') {
            // Strong
            return {
                background: '#4CAF50',
                border: '#2E7D32',
            };
        }
        if (signalColor.color === '#FF9800') {
            // Medium
            return {
                background: '#FF9800',
                border: '#EF6C00',
            };
        }
        if (signalColor.color === '#F44336') {
            // Weak
            return {
                background: '#F44336',
                border: '#C62828',
            };
        }
        // Unknown - use orange/amber to match Thread unknown devices
        return {
            background: '#FFC107',
            border: '#FFA000',
        };
    }
}

export default WiFiGraph;
