import { NodeConnectionState } from '@matter/main';

/**
 * Whether a paired node counts as connected for ioBroker, which is what its `info.connection` state and the
 * online indicator of every device mapped from it show.
 *
 * matter.js reports Reconnecting on every session loss while it still expects the peer back, and reports
 * WaitingForDeviceDiscovery once the peer is known unreachable, so Reconnecting counts as connected. Until the
 * peer's subscription applied its first report in this process, its state is the cache of an earlier run, so
 * Reconnecting does not count before that.
 *
 * | state                     | first report applied | connected |
 * |---------------------------|----------------------|-----------|
 * | Connected                 | any                  | yes       |
 * | Reconnecting              | yes                  | yes       |
 * | Reconnecting              | no                   | no        |
 * | Disconnected              | any                  | no        |
 * | WaitingForDeviceDiscovery | any                  | no        |
 *
 * matter.js reports Connected only while the subscription is live, which is after its first report was applied.
 *
 * @param state the node's current connection state
 * @param firstReportApplied whether the node was Connected since this process started watching it or since it
 *   was last Disconnected
 */
export function isConnectedForIoBroker(state: NodeConnectionState, firstReportApplied: boolean): boolean {
    switch (state) {
        case NodeConnectionState.Connected:
            return true;
        case NodeConnectionState.Reconnecting:
            return firstReportApplied;
        default:
            return false;
    }
}
