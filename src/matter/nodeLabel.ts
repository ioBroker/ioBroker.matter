import type { FabricIndex, NodeId } from '@matter/main';
import { PeerAddress } from '@matter/main/protocol';

/**
 * Label of a controller node for log lines: the decimal node id, which is the id shown in the admin, followed by
 * the peer address as matter.js prints it in its own log lines, so both can be matched in one log.
 *
 * | fabric index | label                                        |
 * |--------------|----------------------------------------------|
 * | known        | `15398113178295236884 (@1:d5b1165a5b8c7914)` |
 * | unknown      | `15398113178295236884 (@?:d5b1165a5b8c7914)` |
 *
 * The bracket part of the known case comes from `PeerAddress.toString()`, so it follows matter.js. The unknown case
 * keeps the same shape with `?` in place of the fabric index.
 *
 * @param nodeId the node id of the peer
 * @param fabricIndex the fabric index the peer is commissioned into, when known
 */
export function formatNodeLabel(nodeId: NodeId, fabricIndex?: FabricIndex): string {
    const peerAddress = fabricIndex === undefined ? undefined : PeerAddress({ fabricIndex, nodeId });
    // PeerAddress gets its toString from a prototype that its interface does not declare
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    const address = peerAddress === undefined ? `@?:${nodeId.toString(16)}` : peerAddress.toString();
    return `${nodeId} (${address})`;
}

/** {@link formatNodeLabel} for a peer address. */
export function formatPeerLabel(peer: PeerAddress): string {
    return formatNodeLabel(peer.nodeId, peer.fabricIndex);
}
