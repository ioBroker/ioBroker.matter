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
    BorderRouterEntry,
    ThreadDiagnosticsBatch,
    ThreadDiagnosticsNode,
    ThreadDiagnosticsPartialReason,
    ThreadRoute64,
    ThreadRoute64Entry,
    ThreadLeaderData,
    ThreadChildTableEntry,
    DiagnosticMeshNode,
} from '../../types';

import type { BorderRouterEntry, NetworkType } from '../../types';

/**
 * Classification of a Thread mesh link based on LQI.
 * "none" means LQI=0 — neighbor entry exists but no recent valid frames (dead/stale link).
 */
export type SignalLevel = 'strong' | 'medium' | 'weak' | 'none';

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
    networkType?: NetworkType;
    threadRole?: ThreadRoutingRole;
    offline?: boolean;
    isUnknown?: boolean;
    isAccessPoint?: boolean;
    /** Whether the node should be hidden (filter options) */
    hidden?: boolean;
}

export interface NetworkGraphEdge {
    id: string;
    from: string;
    to: string;
    color: { color: string; highlight: string };
    width: number;
    title?: string;
    dashes?: boolean;
    /** Whether the edge should be hidden (filter options) */
    hidden?: boolean;
}

export interface WiFiAccessPoint {
    bssid: string;
    bssidFormatted: string;
    connectedNodes: string[];
}

export interface UnknownThreadDevice {
    kind: 'unknown';
    /** Unique graph ID, formatted "unknown_<XAHEX>". */
    id: string;
    /** Extended address as base64 (as received in the neighbor table). */
    extAddress: string;
    /** Extended address as 16-char uppercase hex — the join key. */
    extAddressHex: string;
    isRouter: boolean;
    bestRssi: number | null;
    seenBy: string[];
    /** Extended PAN ID (16-char uppercase hex) inherited from the observing commissioned node. */
    extendedPanIdHex?: string;
    /** Friendly Thread network name resolved by joining extendedPanIdHex against the BR registry. */
    networkName?: string;
}

/**
 * Thread Border Router enriched via mDNS. Same neighbor-table aggregate fields as
 * UnknownThreadDevice plus all BorderRouterEntry fields (network name, vendor, addresses, ...).
 */
export interface KnownBorderRouter extends BorderRouterEntry {
    kind: 'br';
    /** Graph ID, formatted "br_<XAHEX>". */
    id: string;
    isRouter: boolean;
    bestRssi: number | null;
    seenBy: string[];
}

/**
 * External Thread device discriminated union — either a recognized Border Router
 * or an unidentified neighbor.
 */
export type ThreadExternalDevice = KnownBorderRouter | UnknownThreadDevice;

// Signal strength colors
export interface SignalColor {
    color: string;
    highlight: string;
    label: string;
}
