interface DeviceControl {
    states: { id?: string }[];
}

/**
 * Pick which detected device patterns are eligible for a configured object id.
 *
 * When the user selected a concrete state (`selectedId !== deviceId`), that exact state must be the
 * controlled one - otherwise a same-role sibling sharing the primary slot would be used instead
 * (ioBroker/ioBroker.matter#594, #730). Returns `null` when such a state is not part of any detected
 * device, signalling the caller to build a single-state device for exactly that state.
 *
 * When a whole device/channel was selected (`selectedId === deviceId`), the broad auto-detection
 * result is kept (patterns containing the id, or all detected patterns as fallback).
 */
export function selectControlsForState<T extends DeviceControl>(
    controls: T[],
    selectedId: string,
    deviceId: string,
): T[] | null {
    const containing = controls.filter(control => control.states.some(({ id }) => id === selectedId));

    if (selectedId === deviceId) {
        return containing.length ? containing : controls;
    }

    if (!containing.length) {
        return null;
    }

    // Prefer a pattern where the selected state is the main (first id-bearing) state so a same-role
    // sibling cannot take over; otherwise keep every pattern that maps the state (secondary slot of a
    // multi-state device, e.g. the on/off state of a color device).
    const asMainState = containing.filter(control => control.states.find(({ id }) => id)?.id === selectedId);
    return asMainState.length ? asMainState : containing;
}
