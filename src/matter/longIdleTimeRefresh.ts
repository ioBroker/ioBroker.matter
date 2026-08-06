/**
 * Refreshes a set of node ids, deferring the LIT (Long Idle Time) ones out of the awaited batch.
 *
 * A LIT peer only answers once it next wakes, which can be hours away, so reading it must not delay
 * the returned promise for the rest of the batch. Its read is still started (never dropped) and
 * `onLongIdleTimeSettled` runs once it eventually lands, whatever the outcome; `read` is expected to
 * handle/log its own failures the same way for both groups, since a rejection reaching here would
 * otherwise surface as an unhandled rejection for the LIT group (nothing else awaits it).
 */
export async function refreshWithLongIdleTimeDeferral(
    nodeIds: readonly string[],
    isLongIdleTime: (nodeId: string) => boolean,
    read: (nodeId: string) => Promise<void>,
    onLongIdleTimeSettled: () => void,
): Promise<void> {
    const regularIds = new Array<string>();
    for (const nodeId of nodeIds) {
        if (isLongIdleTime(nodeId)) {
            read(nodeId)
                .finally(onLongIdleTimeSettled)
                .catch(() => {
                    /* read() is expected to handle its own failures; this only guards against an
                     * unhandled rejection if it doesn't. */
                });
        } else {
            regularIds.push(nodeId);
        }
    }

    await Promise.all(regularIds.map(read));
}

/**
 * Runs `run()` for `key`, unless a call for that same key is already in `pending` — in which case it
 * is skipped (`onSkipped` fires instead) rather than starting a second concurrent run. Needed for a
 * deferred LIT read: it can stay outstanding for the length of the peer's idle interval, so repeated
 * confirms for the same sleeping node must not each start their own read and stack up on the peer.
 */
export async function runDedupedByKey(
    pending: Set<string>,
    key: string,
    run: () => Promise<void>,
    onSkipped?: () => void,
): Promise<void> {
    if (pending.has(key)) {
        onSkipped?.();
        return;
    }
    pending.add(key);
    try {
        await run();
    } finally {
        pending.delete(key);
    }
}
