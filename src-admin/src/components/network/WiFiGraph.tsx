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
import { createNodeIconDataUrl, createWiFiApIconDataUrl } from './NetworkIcons';
import { I18n } from '@iobroker/adapter-react-v5';

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

        // Add access point nodes — full BSSID in the label so dual-band radios that differ only in
        // leading octets don't collapse into a single AP visually.
        for (const ap of accessPoints) {
            graphNodes.push({
                id: `ap_${ap.bssid}`,
                label: `AP ${ap.bssidFormatted}`,
                shape: 'image',
                image: createWiFiApIconDataUrl(),
                size: 26,
                font: { color: darkMode ? '#e0e0e0' : '#333333' },
                title: `${I18n.t('Access Point')}\n${I18n.t('BSSID')}: ${ap.bssidFormatted}\n${I18n.t('Connected devices')}: ${ap.connectedNodes.length}`,
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
            const isOffline = !node.isConnected;

            graphNodes.push({
                id: node.nodeId,
                label: node.name,
                shape: 'image',
                image: createNodeIconDataUrl(node.deviceType, null, isOffline),
                size: 24,
                font: { color: darkMode ? '#e0e0e0' : '#333333' },
                title: `${node.name}\n${node.isConnected ? I18n.t('Connected') : I18n.t('Offline')}${rssi !== null ? `\nRSSI: ${rssi} dBm` : ''}${channel !== null ? `\n${I18n.t('Channel')}: ${channel}` : ''}\n${I18n.t('Security')}: ${securityType}\n${I18n.t('WiFi Version')}: ${wifiVersion}`,
                networkType: 'wifi',
                offline: isOffline,
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
                title: rssi !== null ? `RSSI: ${rssi} dBm` : I18n.t('Signal: Unknown'),
                dashes: isOffline,
            });
        }

        // Update datasets
        this.nodesDataSet.clear();
        this.nodesDataSet.add(graphNodes);

        this.edgesDataSet.clear();
        this.edgesDataSet.add(graphEdges);
    }
}

export default WiFiGraph;
