/**
 * Network Graph Type Definitions
 * Re-exports shared types from types.d.ts and adds visualization-specific types
 */

// Re-export shared types from the common types file
export type {
    NetworkType,
    NetworkGraphData,
    NetworkNodeData,
    WiFiDiagnosticsData,
    ThreadDiagnosticsData,
    ThreadNeighborEntry,
    ThreadRouteEntry,
} from '../../types';

/**
 * Thread Routing Role enum for display purposes
 * Maps to the numeric values returned by the backend
 */
export enum ThreadRoutingRole {
    Unspecified = 0,
    Unassigned = 1,
    SleepyEndDevice = 2,
    EndDevice = 3,
    Reed = 4,
    Router = 5,
    Leader = 6,
}

// Graph visualization types for vis.js
export interface NetworkGraphNode {
    id: string;
    label: string;
    image?: string;
    shape: 'image' | 'dot' | 'circle';
    size?: number;
    color?: string | { background: string; border: string };
    font?: { color: string };
    title?: string;
    // Custom data
    networkType?: import('../../types').NetworkType;
    threadRole?: ThreadRoutingRole;
    offline?: boolean;
    isUnknown?: boolean;
    isAccessPoint?: boolean;
}

export interface NetworkGraphEdge {
    id: string;
    from: string;
    to: string;
    color: { color: string; highlight: string };
    width: number;
    title?: string;
    dashes?: boolean;
}

export interface WiFiAccessPoint {
    bssid: string;
    bssidFormatted: string;
    connectedNodes: string[];
}

export interface UnknownThreadDevice {
    id: string;
    extAddress: string;
    extAddressHex: string;
    isRouter: boolean;
    bestRssi: number | null;
    seenBy: string[];
}

// Signal strength colors
export interface SignalColor {
    color: string;
    highlight: string;
    label: string;
}
