/**
 * BaseNetworkGraph - Base component for network graph visualization
 * Provides common vis.js Network functionality for ThreadGraph and WiFiGraph
 */

import React from 'react';
import { Network, type Options } from 'vis-network';
import { DataSet } from 'vis-data';
import type { NetworkGraphNode, NetworkGraphEdge, NetworkNodeData } from './NetworkTypes';

export interface BaseNetworkGraphProps {
    nodes: NetworkNodeData[];
    darkMode: boolean;
    onNodeSelect?: (nodeId: string | null) => void;
    selectedNodeId?: string | null;
}

export interface BaseNetworkGraphState {
    initialized: boolean;
}

abstract class BaseNetworkGraph<
    P extends BaseNetworkGraphProps = BaseNetworkGraphProps,
    S extends BaseNetworkGraphState = BaseNetworkGraphState,
> extends React.Component<P, S> {
    protected containerRef = React.createRef<HTMLDivElement>();
    protected network?: Network;
    protected nodesDataSet?: DataSet<NetworkGraphNode>;
    protected edgesDataSet?: DataSet<NetworkGraphEdge>;
    protected resizeObserver?: ResizeObserver;
    /** Store original edge colors for restoration after highlighting */
    private originalEdgeColors: Map<string, { color: string; highlight: string }> = new Map();
    /** Store original node sizes for restoration after highlighting */
    private originalNodeSizes: Map<string, number> = new Map();

    constructor(props: P) {
        super(props);
        this.state = {
            initialized: false,
        } as S;
    }

    componentDidMount(): void {
        this.initializeNetwork();
        this.setupResizeObserver();
    }

    componentDidUpdate(prevProps: P): void {
        if (prevProps.nodes !== this.props.nodes) {
            this.updateGraph();
        }
        if (prevProps.darkMode !== this.props.darkMode) {
            this.updateTheme();
        }
        if (prevProps.selectedNodeId !== this.props.selectedNodeId) {
            this.handleExternalSelection();
        }
    }

    componentWillUnmount(): void {
        this.resizeObserver?.disconnect();
        // Explicitly remove event listeners before destroying (destroy() also does this, but being explicit)
        if (this.network) {
            this.network.off('click');
            this.network.off('stabilizationIterationsDone');
            this.network.destroy();
        }
    }

    protected setupResizeObserver(): void {
        if (this.containerRef.current) {
            this.resizeObserver = new ResizeObserver(() => {
                if (this.network && this.containerRef.current) {
                    const { clientWidth, clientHeight } = this.containerRef.current;
                    if (clientWidth > 0 && clientHeight > 0) {
                        this.network.setSize(`${clientWidth}px`, `${clientHeight}px`);
                        this.network.redraw();
                    }
                }
            });
            this.resizeObserver.observe(this.containerRef.current);
        }
    }

    protected initializeNetwork(): void {
        if (!this.containerRef.current) {
            return;
        }

        this.nodesDataSet = new DataSet<NetworkGraphNode>();
        this.edgesDataSet = new DataSet<NetworkGraphEdge>();

        const options = this.getNetworkOptions();

        this.network = new Network(
            this.containerRef.current,
            {
                nodes: this.nodesDataSet,
                edges: this.edgesDataSet,
            },
            options,
        );

        this.network.on('click', params => {
            const nodeId = params.nodes?.[0] as string | undefined;
            this.handleNodeSelected(nodeId ?? null);
        });

        this.network.on('stabilizationIterationsDone', () => {
            this.network?.fit({
                animation: {
                    duration: 500,
                    easingFunction: 'easeInOutQuad',
                },
            });
        });

        this.setState({ initialized: true } as S);
        this.updateGraph();
    }

    protected getNetworkOptions(): Options {
        const { darkMode } = this.props;
        const fontColor = darkMode ? '#e0e0e0' : '#333333';

        return {
            nodes: {
                shape: 'dot',
                size: 25,
                font: {
                    size: 14,
                    color: fontColor,
                },
                borderWidth: 2,
            },
            edges: {
                width: 2,
                smooth: {
                    type: 'continuous',
                    roundness: 0.5,
                },
            },
            physics: this.getPhysicsOptions(),
            interaction: {
                hover: true,
                tooltipDelay: 200,
                hideEdgesOnDrag: true,
            },
            layout: {
                improvedLayout: true,
            },
        };
    }

    // eslint-disable-next-line class-methods-use-this
    protected getPhysicsOptions(): Options['physics'] {
        return {
            enabled: true,
            solver: 'forceAtlas2Based',
            forceAtlas2Based: {
                gravitationalConstant: -70,
                centralGravity: 0.005,
                springLength: 130,
                springConstant: 0.08,
                damping: 0.4,
                avoidOverlap: 0.6,
            },
            stabilization: {
                enabled: true,
                iterations: 250,
                updateInterval: 25,
            },
        };
    }

    protected handleNodeSelected(nodeId: string | null): void {
        if (nodeId) {
            this.highlightConnections(nodeId);
        } else {
            this.clearHighlights();
        }
        this.props.onNodeSelect?.(nodeId);
    }

    protected handleExternalSelection(): void {
        const { selectedNodeId } = this.props;
        if (selectedNodeId) {
            this.network?.selectNodes([selectedNodeId]);
            this.highlightConnections(selectedNodeId);
        } else {
            this.network?.unselectAll();
            this.clearHighlights();
        }
    }

    protected highlightConnections(nodeId: string): void {
        if (!this.nodesDataSet || !this.edgesDataSet) {
            return;
        }

        const connectedEdges = this.network?.getConnectedEdges(nodeId) ?? [];
        const connectedNodes = this.network?.getConnectedNodes(nodeId) ?? [];
        const connectedNodeSet = new Set([nodeId, ...connectedNodes.map(String)]);

        const allEdges = this.edgesDataSet.get();
        const allNodes = this.nodesDataSet.get();
        const dimmedColor = this.props.darkMode ? '#555555' : '#cccccc';

        // Store original edge colors FIRST before any modifications (only if not already stored)
        for (const edge of allEdges) {
            const edgeId = String(edge.id);
            if (!this.originalEdgeColors.has(edgeId)) {
                const colorObj = edge.color as { color: string; highlight: string } | undefined;
                this.originalEdgeColors.set(edgeId, {
                    color: colorObj?.color ?? '#999999',
                    highlight: colorObj?.highlight ?? '#999999',
                });
            }
        }

        // Store original node sizes FIRST before any modifications (only if not already stored)
        for (const node of allNodes) {
            const nodeIdStr = String(node.id);
            if (!this.originalNodeSizes.has(nodeIdStr)) {
                this.originalNodeSizes.set(nodeIdStr, node.size ?? 14);
            }
        }

        // Update edges - connected edges keep original color, others get dimmed
        const edgeUpdates = allEdges.map(edge => {
            const isConnected = connectedEdges.includes(edge.id);
            const originalColor = this.originalEdgeColors.get(String(edge.id));
            // Fallback color if original not found
            const fallbackColor = { color: '#999999', highlight: '#999999' };
            return {
                id: edge.id,
                width: isConnected ? 3 : 1,
                color: isConnected ? (originalColor ?? fallbackColor) : { color: dimmedColor, highlight: dimmedColor },
            };
        });
        this.edgesDataSet.update(edgeUpdates);

        // Update nodes - use proportional scaling based on original size
        const nodeUpdates = allNodes.map(node => {
            const isConnected = connectedNodeSet.has(node.id);
            const originalSize = this.originalNodeSizes.get(String(node.id)) ?? node.size ?? 14;
            let newSize: number;
            if (node.id === nodeId) {
                // Selected node: slight increase (+3)
                newSize = originalSize + 3;
            } else if (isConnected) {
                // Connected nodes: small increase (+1)
                newSize = originalSize + 1;
            } else {
                // Non-connected nodes: slight decrease (-2)
                newSize = Math.max(originalSize - 2, 8);
            }
            return {
                id: node.id,
                size: newSize,
                font: {
                    color: isConnected
                        ? this.props.darkMode
                            ? '#e0e0e0'
                            : '#333333'
                        : this.props.darkMode
                          ? '#666666'
                          : '#999999',
                },
            };
        });
        this.nodesDataSet.update(nodeUpdates);
    }

    protected clearHighlights(): void {
        if (!this.nodesDataSet || !this.edgesDataSet) {
            return;
        }

        const allEdges = this.edgesDataSet.get();
        const allNodes = this.nodesDataSet.get();
        const fallbackColor = { color: '#999999', highlight: '#999999' };

        // Reset edges to original colors
        const edgeUpdates = allEdges.map(edge => {
            const originalColor = this.originalEdgeColors.get(String(edge.id)) ?? fallbackColor;
            return {
                id: edge.id,
                width: 2,
                color: originalColor,
            };
        });
        this.edgesDataSet.update(edgeUpdates);

        // Reset nodes to original sizes
        const nodeUpdates = allNodes.map(node => {
            const originalSize = this.originalNodeSizes.get(String(node.id)) ?? node.size ?? 14;
            return {
                id: node.id,
                size: originalSize,
                font: {
                    color: this.props.darkMode ? '#e0e0e0' : '#333333',
                },
            };
        });
        this.nodesDataSet.update(nodeUpdates);
    }

    /**
     * Clear stored edge colors and node sizes when graph is updated (nodes/edges are recreated).
     * Call this at the beginning of updateGraph() in subclasses.
     */
    // eslint-disable-next-line react/no-unused-class-component-methods
    protected clearOriginalEdgeColors(): void {
        this.originalEdgeColors.clear();
        this.originalNodeSizes.clear();
    }

    protected updateTheme(): void {
        if (!this.network) {
            return;
        }
        const options = this.getNetworkOptions();
        this.network.setOptions(options);
        this.updateGraph();
    }

    // eslint-disable-next-line react/no-unused-class-component-methods
    public fit(): void {
        this.network?.fit({
            animation: {
                duration: 500,
                easingFunction: 'easeInOutQuad',
            },
        });
    }

    /**
     * Abstract method - must be implemented by subclasses to populate the graph
     */
    protected abstract updateGraph(): void;

    /**
     * Get node color based on connection state
     */
    // eslint-disable-next-line class-methods-use-this, react/no-unused-class-component-methods
    protected getNodeColor(isConnected: boolean, isOffline?: boolean): string | { background: string; border: string } {
        if (isOffline || !isConnected) {
            return {
                background: '#9E9E9E',
                border: '#616161',
            };
        }
        return {
            background: '#2196F3',
            border: '#1565C0',
        };
    }

    render(): React.ReactNode {
        return (
            <div
                ref={this.containerRef}
                style={{
                    width: '100%',
                    height: '100%',
                    minHeight: 400,
                }}
            />
        );
    }
}

export default BaseNetworkGraph;
