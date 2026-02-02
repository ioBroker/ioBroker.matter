/**
 * NetworkGraphDialog - Dialog for displaying network topology graphs
 * Shows either Thread mesh or WiFi network visualization (one at a time)
 */

import React from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Box,
    IconButton,
    Tooltip,
    Typography,
    CircularProgress,
    Paper,
    Divider,
} from '@mui/material';
import {
    Close as CloseIcon,
    Refresh as RefreshIcon,
    FitScreen as FitScreenIcon,
    Sync as SyncIcon,
} from '@mui/icons-material';

import type { NetworkGraphData, NetworkNodeData } from './NetworkTypes';
import {
    SIGNAL_COLORS,
    categorizeNodes,
    formatNodeIdHex,
    getThreadRoleName,
    getWiFiSecurityTypeName,
    getWiFiVersionName,
    parseExtendedAddressToHex,
    buildExtAddrMap,
    buildThreadConnections,
    findUnknownDevices,
    getRoutableDestinationsCount,
    getNodeConnections,
} from './NetworkUtils';
import ThreadGraph from './ThreadGraph';
import WiFiGraph from './WiFiGraph';
import UpdateConnectionsDialog, { type SelectedNodeType } from './UpdateConnectionsDialog';
import { I18n } from '@iobroker/adapter-react-v5';

interface NetworkGraphDialogProps {
    open: boolean;
    data: NetworkGraphData | null;
    error: string | null;
    onClose: () => void;
    onRefresh: () => Promise<void>;
    onUpdateConnections?: (nodeIds: string[]) => Promise<void>;
    darkMode: boolean;
    /** Which network type to display */
    networkType: 'thread' | 'wifi';
}

interface NetworkGraphDialogState {
    loading: boolean;
    selectedNodeId: string | null;
    updateDialogOpen: boolean;
}

class NetworkGraphDialog extends React.Component<NetworkGraphDialogProps, NetworkGraphDialogState> {
    private graphRef = React.createRef<ThreadGraph | WiFiGraph>();

    constructor(props: NetworkGraphDialogProps) {
        super(props);
        this.state = {
            loading: false,
            selectedNodeId: null,
            updateDialogOpen: false,
        };
    }

    componentDidMount(): void {
        // Load data when dialog opens
        if (this.props.open && !this.props.data) {
            void this.handleRefresh();
        }
    }

    componentDidUpdate(prevProps: NetworkGraphDialogProps): void {
        // Load data when dialog opens
        if (this.props.open && !prevProps.open && !this.props.data) {
            void this.handleRefresh();
        }
        // Reset selection when network type changes
        if (this.props.networkType !== prevProps.networkType) {
            this.setState({ selectedNodeId: null });
        }
    }

    handleRefresh = async (): Promise<void> => {
        this.setState({ loading: true });
        try {
            await this.props.onRefresh();
        } finally {
            this.setState({ loading: false });
        }
    };

    handleNodeSelect = (nodeId: string | null): void => {
        this.setState({ selectedNodeId: nodeId });
    };

    handleFitScreen = (): void => {
        this.graphRef.current?.fit();
    };

    handleOpenUpdateDialog = (): void => {
        this.setState({ updateDialogOpen: true });
    };

    handleCloseUpdateDialog = (): void => {
        this.setState({ updateDialogOpen: false });
    };

    handleUpdateConnections = async (nodeIds: string[]): Promise<void> => {
        if (this.props.onUpdateConnections) {
            await this.props.onUpdateConnections(nodeIds);
        }
        // Refresh graph data after update
        await this.handleRefresh();
    };

    /**
     * Get the selected node data and type information
     */
    getSelectedNodeInfo(): {
        node: NetworkNodeData | null;
        nodeType: SelectedNodeType;
        isUnknown: boolean;
        unknownExtAddress?: string;
    } {
        const { data } = this.props;
        const { selectedNodeId } = this.state;

        if (!selectedNodeId || !data) {
            return { node: null, nodeType: 'unknown', isUnknown: false };
        }

        // Check if it's an unknown device (starts with 'unknown_')
        if (selectedNodeId.startsWith('unknown_')) {
            return {
                node: null,
                nodeType: 'unknown',
                isUnknown: true,
                unknownExtAddress: selectedNodeId.replace('unknown_', ''),
            };
        }

        // Find the node in data
        const node = data.nodes.find(n => n.nodeId === selectedNodeId);
        if (!node) {
            return { node: null, nodeType: 'unknown', isUnknown: false };
        }

        const nodeType: SelectedNodeType = node.isConnected ? 'online' : 'offline';
        return { node, nodeType, isUnknown: false };
    }

    /**
     * Get online neighbor IDs for the selected node
     */
    getOnlineNeighborIds(): string[] {
        const { data, networkType } = this.props;
        const { selectedNodeId } = this.state;

        if (!selectedNodeId || !data) {
            return [];
        }

        const connectedIds = new Set<string>();

        if (networkType === 'thread') {
            // Thread: use neighbor table connections
            const threadNodes = data.nodes.filter(n => n.networkType === 'thread');
            const extAddrMap = buildExtAddrMap(threadNodes);
            const unknownDevices = findUnknownDevices(threadNodes, extAddrMap);
            const connections = buildThreadConnections(threadNodes, extAddrMap, unknownDevices);

            for (const conn of connections) {
                if (conn.fromNodeId === selectedNodeId) {
                    connectedIds.add(conn.toNodeId);
                } else if (conn.toNodeId === selectedNodeId) {
                    connectedIds.add(conn.fromNodeId);
                }
            }
        } else {
            // WiFi: nodes connected to same AP
            const selectedNode = data.nodes.find(n => n.nodeId === selectedNodeId);
            if (selectedNode?.wifi?.bssid) {
                for (const node of data.nodes) {
                    if (node.wifi?.bssid === selectedNode.wifi.bssid && node.nodeId !== selectedNodeId) {
                        connectedIds.add(node.nodeId);
                    }
                }
            }
        }

        // Filter to only online nodes (not unknown devices)
        return Array.from(connectedIds).filter(id => {
            if (id.startsWith('unknown_')) {
                return false;
            }
            const node = data.nodes.find(n => n.nodeId === id);
            return node && node.isConnected;
        });
    }

    /**
     * Render the connections list for a Thread node
     */
    renderConnectionsList(node: NetworkNodeData): React.ReactNode {
        const { data } = this.props;
        if (!data || node.networkType !== 'thread') {
            return null;
        }

        const threadNodes = data.nodes.filter(n => n.networkType === 'thread');
        const extAddrMap = buildExtAddrMap(threadNodes);
        const connections = getNodeConnections(node.nodeId, threadNodes, extAddrMap);

        if (connections.length === 0) {
            return null;
        }

        return (
            <>
                <Divider sx={{ my: 1 }} />
                <Typography
                    variant="subtitle2"
                    sx={{ fontWeight: 'bold', mb: 1 }}
                >
                    {I18n.t('Connections')} ({connections.length})
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 200, overflowY: 'auto' }}>
                    {connections.map((conn, index) => (
                        <Box
                            key={index}
                            sx={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: 1,
                                p: 1,
                                backgroundColor: 'action.hover',
                                borderRadius: 1,
                                cursor: conn.isUnknown ? 'default' : 'pointer',
                                '&:hover': {
                                    backgroundColor: conn.isUnknown ? 'action.hover' : 'action.selected',
                                },
                            }}
                            onClick={() => {
                                if (!conn.isUnknown) {
                                    this.handleNodeSelect(conn.connectedNodeId);
                                }
                            }}
                        >
                            {/* Signal indicator */}
                            <Box
                                sx={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: '50%',
                                    backgroundColor: conn.signalColor.color,
                                    mt: 0.5,
                                    flexShrink: 0,
                                }}
                            />
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                {/* Node name or Unknown */}
                                <Typography
                                    variant="body2"
                                    sx={{ wordBreak: 'break-word' }}
                                >
                                    {conn.connectedNode ? conn.connectedNode.name : `${I18n.t('Unknown Device')}`}
                                    {conn.connectedNode && (
                                        <Typography
                                            component="span"
                                            variant="caption"
                                            sx={{ ml: 0.5, fontFamily: 'monospace', color: 'text.secondary' }}
                                        >
                                            {formatNodeIdHex(conn.connectedNodeId)}
                                        </Typography>
                                    )}
                                </Typography>
                                {/* Signal info */}
                                <Typography
                                    variant="caption"
                                    color="text.secondary"
                                >
                                    {conn.rssi !== null && `RSSI: ${conn.rssi} dBm`}
                                    {conn.rssi !== null && conn.lqi !== null && ', '}
                                    {conn.lqi !== null && `LQI: ${conn.lqi}`}
                                    {conn.bidirectionalLqi !== undefined && (
                                        <span style={{ color: '#7d5260' }}>, Bidir: {conn.bidirectionalLqi}</span>
                                    )}
                                    {conn.pathCost !== undefined && (
                                        <span style={{ color: '#7d5260' }}>, Cost: {conn.pathCost}</span>
                                    )}
                                    {!conn.isOutgoing && (
                                        <span style={{ fontStyle: 'italic', opacity: 0.8 }}> (reverse)</span>
                                    )}
                                </Typography>
                            </Box>
                        </Box>
                    ))}
                </Box>
            </>
        );
    }

    renderInfoText(): React.ReactNode {
        const { networkType } = this.props;

        return (
            <Box sx={{ px: 1, mb: 1 }}>
                <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontStyle: 'italic' }}
                >
                    {networkType === 'thread' ? I18n.t('Thread network info') : I18n.t('WiFi network info')}
                </Typography>
            </Box>
        );
    }

    renderLegend(): React.ReactNode {
        const { networkType } = this.props;

        return (
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap', mb: 1, px: 1 }}>
                <Typography
                    variant="caption"
                    sx={{ fontWeight: 'bold' }}
                >
                    {I18n.t('Signal Strength')}:
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <Box
                        sx={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: SIGNAL_COLORS.strong.color }}
                    />
                    <Typography variant="caption">{I18n.t('Strong')}</Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <Box
                        sx={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: SIGNAL_COLORS.medium.color }}
                    />
                    <Typography variant="caption">{I18n.t('Medium')}</Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <Box
                        sx={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: SIGNAL_COLORS.weak.color }}
                    />
                    <Typography variant="caption">{I18n.t('Weak')}</Typography>
                </Box>

                {networkType === 'thread' && (
                    <>
                        <Box sx={{ borderLeft: 1, borderColor: 'divider', pl: 2, ml: 1 }} />
                        <Typography
                            variant="caption"
                            sx={{ fontWeight: 'bold' }}
                        >
                            {I18n.t('Thread Roles')}:
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                            <Box sx={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#9C27B0' }} />
                            <Typography variant="caption">{I18n.t('Leader')}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                            <Box sx={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#2196F3' }} />
                            <Typography variant="caption">{I18n.t('Router')}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                            <Box sx={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#4CAF50' }} />
                            <Typography variant="caption">{I18n.t('End Device')}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                            <Box sx={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#FFC107' }} />
                            <Typography variant="caption">{I18n.t('Unknown Device')}</Typography>
                        </Box>
                    </>
                )}

                {networkType === 'wifi' && (
                    <>
                        <Box sx={{ borderLeft: 1, borderColor: 'divider', pl: 2, ml: 1 }} />
                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                            <Box sx={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#FF5722' }} />
                            <Typography variant="caption">{I18n.t('Access Point')}</Typography>
                        </Box>
                    </>
                )}

                {/* Legend for dashed lines */}
                <Box sx={{ borderLeft: 1, borderColor: 'divider', pl: 2, ml: 1 }} />
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <Box sx={{ width: 16, height: 0, borderTop: '2px dashed #9E9E9E' }} />
                    <Typography variant="caption">{I18n.t('Offline/Unknown')}</Typography>
                </Box>
            </Box>
        );
    }

    /**
     * Render the selected node details panel (right side)
     */
    renderSelectedNodeDetails(): React.ReactNode {
        const { selectedNodeId } = this.state;
        const { onUpdateConnections } = this.props;

        if (!selectedNodeId) {
            return (
                <Paper
                    elevation={2}
                    sx={{ width: 280, p: 2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                    <Typography
                        color="textSecondary"
                        variant="body2"
                    >
                        {I18n.t('Click a node to see details')}
                    </Typography>
                </Paper>
            );
        }

        const { node, nodeType, isUnknown, unknownExtAddress } = this.getSelectedNodeInfo();
        const onlineNeighborIds = this.getOnlineNeighborIds();

        return (
            <Paper
                elevation={2}
                sx={{ width: 280, p: 2, display: 'flex', flexDirection: 'column', gap: 1, overflow: 'auto' }}
            >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        {isUnknown ? (
                            <>
                                <Typography
                                    variant="subtitle2"
                                    sx={{ fontWeight: 'bold' }}
                                >
                                    {I18n.t('Unknown Device')}
                                </Typography>
                                <Typography
                                    variant="caption"
                                    sx={{ fontFamily: 'monospace', color: 'text.secondary', wordBreak: 'break-all' }}
                                >
                                    {unknownExtAddress}
                                </Typography>
                            </>
                        ) : node ? (
                            <>
                                <Typography
                                    variant="subtitle2"
                                    sx={{ fontWeight: 'bold', wordBreak: 'break-word' }}
                                >
                                    {node.name}
                                </Typography>
                                <Typography
                                    variant="caption"
                                    sx={{ fontFamily: 'monospace', color: 'text.secondary', display: 'block' }}
                                >
                                    {formatNodeIdHex(node.nodeId)}
                                </Typography>
                                <Typography
                                    variant="body2"
                                    color={node.isConnected ? 'success.main' : 'error.main'}
                                >
                                    {node.isConnected ? I18n.t('Connected') : I18n.t('Offline')}
                                </Typography>
                            </>
                        ) : (
                            <Typography variant="subtitle2">{I18n.t('Node not found')}</Typography>
                        )}
                    </Box>
                    <Box sx={{ display: 'flex', gap: 0.5, ml: 1 }}>
                        {onUpdateConnections && (
                            <Tooltip title={I18n.t('Update Connections')}>
                                <IconButton
                                    onClick={this.handleOpenUpdateDialog}
                                    size="small"
                                >
                                    <SyncIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        )}
                        <Tooltip title={I18n.t('Close')}>
                            <IconButton
                                onClick={() => this.handleNodeSelect(null)}
                                size="small"
                            >
                                <CloseIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    </Box>
                </Box>

                {node && (
                    <>
                        <Divider />
                        {node.networkType === 'thread' && node.thread && (
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                <Typography variant="body2">
                                    <strong>{I18n.t('Role')}:</strong> {getThreadRoleName(node.thread.routingRole)}
                                </Typography>
                                {node.thread.channel !== null && (
                                    <Typography variant="body2">
                                        <strong>{I18n.t('Channel')}:</strong> {node.thread.channel}
                                    </Typography>
                                )}
                                {node.thread.extendedAddress && (
                                    <Typography
                                        variant="body2"
                                        sx={{ wordBreak: 'break-all' }}
                                    >
                                        <strong>{I18n.t('Extended Address')}:</strong>{' '}
                                        <span style={{ fontFamily: 'monospace', fontSize: '0.85em' }}>
                                            {parseExtendedAddressToHex(node.thread.extendedAddress)}
                                        </span>
                                    </Typography>
                                )}
                                {node.thread.neighborTable && node.thread.neighborTable.length > 0 && (
                                    <Typography variant="body2">
                                        <strong>{I18n.t('Direct Neighbors')}:</strong>{' '}
                                        {node.thread.neighborTable.length}
                                    </Typography>
                                )}
                                {(() => {
                                    const routableCount = getRoutableDestinationsCount(node.thread.routeTable);
                                    return routableCount > 0 ? (
                                        <Typography variant="body2">
                                            <strong>{I18n.t('Routable Destinations')}:</strong> {routableCount}
                                        </Typography>
                                    ) : null;
                                })()}
                            </Box>
                        )}
                        {node.networkType === 'wifi' && node.wifi && (
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                {node.wifi.rssi !== null && (
                                    <Typography variant="body2">
                                        <strong>{I18n.t('RSSI')}:</strong> {node.wifi.rssi} dBm
                                    </Typography>
                                )}
                                {node.wifi.channel !== null && (
                                    <Typography variant="body2">
                                        <strong>{I18n.t('Channel')}:</strong> {node.wifi.channel}
                                    </Typography>
                                )}
                                <Typography variant="body2">
                                    <strong>{I18n.t('Security')}:</strong>{' '}
                                    {getWiFiSecurityTypeName(node.wifi.securityType)}
                                </Typography>
                                <Typography variant="body2">
                                    <strong>{I18n.t('WiFi Version')}:</strong>{' '}
                                    {getWiFiVersionName(node.wifi.wifiVersion)}
                                </Typography>
                            </Box>
                        )}
                    </>
                )}

                {/* Connections list for Thread nodes */}
                {node && node.networkType === 'thread' && this.renderConnectionsList(node)}

                {/* UpdateConnectionsDialog */}
                {onUpdateConnections && (
                    <UpdateConnectionsDialog
                        open={this.state.updateDialogOpen}
                        selectedNodeType={nodeType}
                        selectedNodeName={isUnknown ? I18n.t('Unknown Device') : (node?.name ?? '')}
                        selectedNodeId={selectedNodeId}
                        onlineNeighborIds={onlineNeighborIds}
                        onClose={this.handleCloseUpdateDialog}
                        onUpdate={this.handleUpdateConnections}
                    />
                )}
            </Paper>
        );
    }

    renderContent(): React.ReactNode {
        const { data, darkMode, error, networkType } = this.props;
        const { loading, selectedNodeId } = this.state;

        if (loading) {
            return (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
                    <CircularProgress />
                </Box>
            );
        }

        if (error) {
            return (
                <Box
                    sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        flex: 1,
                        gap: 2,
                    }}
                >
                    <Typography
                        color="error"
                        variant="h6"
                    >
                        {I18n.t('Error loading network data')}
                    </Typography>
                    <Typography
                        color="textSecondary"
                        variant="body2"
                    >
                        {error}
                    </Typography>
                </Box>
            );
        }

        if (!data || !data.nodes.length) {
            return (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
                    <Typography color="textSecondary">{I18n.t('No network data available')}</Typography>
                </Box>
            );
        }

        const categorized = categorizeNodes(data.nodes);
        const relevantNodes = networkType === 'thread' ? categorized.thread : categorized.wifi;

        if (relevantNodes.length === 0) {
            return (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
                    <Typography color="textSecondary">
                        {networkType === 'thread' ? I18n.t('No Thread devices found') : I18n.t('No WiFi devices found')}
                    </Typography>
                </Box>
            );
        }

        return (
            <Box sx={{ display: 'flex', flex: 1, gap: 2, minHeight: 0 }}>
                {/* Graph area */}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    {networkType === 'thread' ? (
                        <ThreadGraph
                            ref={this.graphRef as React.RefObject<ThreadGraph>}
                            nodes={data.nodes}
                            darkMode={darkMode}
                            onNodeSelect={this.handleNodeSelect}
                            selectedNodeId={selectedNodeId}
                        />
                    ) : (
                        <WiFiGraph
                            ref={this.graphRef as React.RefObject<WiFiGraph>}
                            nodes={data.nodes}
                            darkMode={darkMode}
                            onNodeSelect={this.handleNodeSelect}
                            selectedNodeId={selectedNodeId}
                        />
                    )}
                </Box>
                {/* Node details panel on the right */}
                {this.renderSelectedNodeDetails()}
            </Box>
        );
    }

    render(): React.ReactNode {
        const { open, onClose, networkType } = this.props;
        const { loading } = this.state;

        const title = networkType === 'thread' ? I18n.t('Thread Topology') : I18n.t('WiFi Topology');

        return (
            <Dialog
                open={open}
                onClose={onClose}
                maxWidth="lg"
                fullWidth
                PaperProps={{
                    sx: { height: '80vh' },
                }}
            >
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
                    <Typography
                        variant="h6"
                        sx={{ flex: 1 }}
                    >
                        {title}
                    </Typography>
                    <Tooltip title={I18n.t('Fit to screen')}>
                        <IconButton
                            onClick={this.handleFitScreen}
                            size="small"
                        >
                            <FitScreenIcon />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title={I18n.t('Refresh')}>
                        <IconButton
                            onClick={this.handleRefresh}
                            disabled={loading}
                            size="small"
                        >
                            <RefreshIcon />
                        </IconButton>
                    </Tooltip>
                    <IconButton
                        onClick={onClose}
                        size="small"
                    >
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>

                <DialogContent sx={{ display: 'flex', flexDirection: 'column', p: 2, pt: 0 }}>
                    {this.renderLegend()}
                    {this.renderInfoText()}
                    {this.renderContent()}
                </DialogContent>

                <DialogActions>
                    <Button onClick={onClose}>{I18n.t('Close')}</Button>
                </DialogActions>
            </Dialog>
        );
    }
}

export default NetworkGraphDialog;
