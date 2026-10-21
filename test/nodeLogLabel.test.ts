import { strictEqual } from 'node:assert';
import { FabricIndex, NodeId } from '@matter/main';
import { PeerAddress } from '@matter/main/protocol';
import { formatNodeLogLabel, formatPeerLogLabel } from '../src/matter/nodeLogLabel';

describe('formatNodeLogLabel', () => {
    const nodeId = NodeId(15398113178295236884n);

    it('prints the decimal id and the matter.js peer address when the fabric index is known', () => {
        strictEqual(formatNodeLogLabel(nodeId, FabricIndex(1)), '15398113178295236884 (@1:d5b1165a5b8c7914)');
    });

    it('uses the fabric index in hex like matter.js', () => {
        strictEqual(formatNodeLogLabel(NodeId(5n), FabricIndex(11)), '5 (@b:5)');
    });

    it('matches PeerAddress.toString() for the bracket part', () => {
        const fabricIndex = FabricIndex(3);
        strictEqual(
            formatNodeLogLabel(nodeId, fabricIndex),
            `${nodeId} (${PeerAddress({ fabricIndex, nodeId }).toString()})`,
        );
    });

    it('prints a question mark in place of an unknown fabric index', () => {
        strictEqual(formatNodeLogLabel(nodeId), '15398113178295236884 (@?:d5b1165a5b8c7914)');
    });
});

describe('formatPeerLogLabel', () => {
    it('labels a peer address like formatNodeLogLabel', () => {
        const nodeId = NodeId(15398113178295236884n);
        strictEqual(
            formatPeerLogLabel(PeerAddress({ fabricIndex: FabricIndex(1), nodeId })),
            '15398113178295236884 (@1:d5b1165a5b8c7914)',
        );
    });
});
