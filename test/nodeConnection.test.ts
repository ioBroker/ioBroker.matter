import { expect } from 'chai';
import { NodeConnectionState } from '@matter/main';
import { isConnectedForIoBroker } from '../src/matter/nodeConnection';

describe('isConnectedForIoBroker', () => {
    it('counts a connected node as connected, with or without a first report', () => {
        expect(isConnectedForIoBroker(NodeConnectionState.Connected, false)).to.equal(true);
        expect(isConnectedForIoBroker(NodeConnectionState.Connected, true)).to.equal(true);
    });

    it('keeps a reconnecting node connected once its first report was applied', () => {
        expect(isConnectedForIoBroker(NodeConnectionState.Reconnecting, true)).to.equal(true);
    });

    it('does not count a reconnecting node that has not reported yet', () => {
        expect(isConnectedForIoBroker(NodeConnectionState.Reconnecting, false)).to.equal(false);
    });

    it('counts a disconnected node as not connected', () => {
        expect(isConnectedForIoBroker(NodeConnectionState.Disconnected, true)).to.equal(false);
        expect(isConnectedForIoBroker(NodeConnectionState.Disconnected, false)).to.equal(false);
    });

    it('counts a node waiting for discovery as not connected', () => {
        expect(isConnectedForIoBroker(NodeConnectionState.WaitingForDeviceDiscovery, true)).to.equal(false);
        expect(isConnectedForIoBroker(NodeConnectionState.WaitingForDeviceDiscovery, false)).to.equal(false);
    });
});
