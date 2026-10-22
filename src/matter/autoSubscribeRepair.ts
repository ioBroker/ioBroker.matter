/** What the repair needs to know about one stored peer. */
export interface AutoSubscribeTarget {
    name: string;
    /** `undefined` when the peer has no network state to repair. */
    autoSubscribe: boolean | undefined;
    enable(): Promise<unknown>;
}

/**
 * Turns `autoSubscribe` back on for every stored peer that has it off.
 *
 * matter.js subscribes a peer only while `autoSubscribe` is on. The setting is persisted per peer and is off for
 * peers the previous adapter version created, and for a peer whose Battery Saver resync was interrupted between
 * its two writes. Such a peer connects but never reports. `isDisabled` is not touched: matter.js does not
 * subscribe a disabled peer whatever `autoSubscribe` says, so a peer disabled in ioBroker stays disabled.
 *
 * A failure on one peer is reported and does not stop the others.
 *
 * @param targets the stored peers
 * @param onError receives the peer name and the failure
 * @returns the number of peers that were repaired
 */
export async function enableAutoSubscribe(
    targets: Iterable<AutoSubscribeTarget>,
    onError: (name: string, error: unknown) => void,
): Promise<number> {
    let repaired = 0;
    for (const target of targets) {
        if (target.autoSubscribe !== false) {
            continue;
        }
        try {
            await target.enable();
            repaired++;
        } catch (error) {
            onError(target.name, error);
        }
    }
    return repaired;
}
