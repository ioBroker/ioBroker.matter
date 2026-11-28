import { WindowCovering } from '@matter/main/clusters';

/** A movement without a movement signal has ended when the position is this close to the target, in 100ths of %. */
export const REACHED_TOLERANCE = 100;

/** How long a movement may go on without a position change before it counts as ended. */
export const SETTLE_MS = 30_000;

type Status = WindowCovering.MovementStatus;
const { Stopped, Opening, Closing } = WindowCovering.MovementStatus;

/** What the device reports about its own movement. */
export type SignalValue = 'opening' | 'closing' | 'stopped' | 'working' | undefined;

export interface MovementConfig {
    /** The axis has a level state; without one only open and close buttons move it. */
    readonly level: boolean;
    /** The axis has an ACTUAL state. Without one the level state is the position. */
    readonly actual: boolean;
    /** The device reports the movement of this axis through DIRECTION_ENUM or WORKING. */
    readonly signal: boolean;
}

/** The Matter positions of the axis when an input arrives, in 100ths of percent closed, and the device signal. */
export interface MovementContext {
    readonly current: number | null;
    readonly target: number | null;
    readonly signal: SignalValue;
}

/** What the caller writes to Matter after an input; an absent position stays as it is. */
export interface MovementEffects {
    readonly status: Status;
    readonly current?: number | null;
    readonly target?: number | null;
    readonly watchdog?: 'start' | 'clear';
}

type Phase = 'idle' | 'commanded' | 'moving';

/**
 * The movement state of one window covering axis. It owns OperationalStatus: the server disables the matter.js
 * handling, because that handling reports Stopped only while current and target are exactly equal, and a device
 * rarely reports exactly the requested position. Every input returns the {@link MovementEffects} to write; the
 * caller runs the watchdog of {@link SETTLE_MS}.
 *
 * Phases: idle (not moving), commanded (a command was sent, the device has not reported a start yet), moving. A
 * movement is requested when a command started it; otherwise the device moves on its own (e.g. by a wall switch).
 * "End" means: idle, status Stopped, target := current (as on StopMotion), watchdog cleared.
 *
 * | Input                              | idle                       | commanded            | moving                     |
 * | ---------------------------------- | -------------------------- | -------------------- | -------------------------- |
 * | command within 1 % of the position | end                        | end                  | end                        |
 * | command, level without ACTUAL      | current := target, end (1) | same                 | same                       |
 * | command, no position and no signal | end (2)                    | end                  | end                        |
 * | command, otherwise (7)             | commanded, watchdog        | commanded, watchdog  | commanded, watchdog        |
 * | write failed, StopMotion           | end                        | end                  | end                        |
 * | position changed (3)               | target := current (4)      | start (9), watchdog  | end if reached (5)         |
 * | SET changed to the Matter target   | -                          | -                    | -                          |
 * | SET changed, level without ACTUAL  | current := SET, end (1)    | same                 | same                       |
 * | SET changed, otherwise             | command to SET             | same                 | same                       |
 * | signal opening / closing           | moving, not requested      | start (9)            | moving                     |
 * | signal working                     | moving, not requested (6)  | start (9)            | watchdog cleared           |
 * | signal stopped                     | -                          | - (before the start) | end                        |
 * | watchdog                           | -                          | start (10), else end | end, unless signal moving  |
 *
 * (1) With a signal the axis is commanded like any other. (2) Without position and signal the end of
 * a movement cannot be seen. (3) Only a changed value; else moving, and the watchdog restarts unless the signal reports
 * a movement. A requested movement keeps the direction of its command unless the signal reports one; a movement that
 * was not requested takes it from the change and keeps target := current. (4) With a signal that reports a movement
 * the axis is moving instead. (5) Within {@link REACHED_TOLERANCE} of the target, for a requested movement the signal
 * does not report as going on. (6) Reported as Stopped until the next position change gives the direction. (7) Moving at
 * once when a movement in the commanded direction already runs, see {@link #commanded}; a command while the position is
 * unknown waits for the signal. (9) Moving when the input is the start of the command, see {@link #isStart}; a start by
 * a position change is then handled as in the moving phase. The watchdog restarts on a position change that is no
 * start. (10) As (9), and also when WORKING is still true: without a reported stop the device most likely reversed.
 */
export class WindowCoveringMovement {
    readonly #config: MovementConfig;
    #phase: Phase = 'idle';
    #direction: Status = Stopped;
    #requested = false;
    /** The signal reported a movement when the command arrived: that movement may still go on before the start. */
    #movingAtCommand = false;
    /** The signal reported a stop since the command. */
    #sawStop = false;

    constructor(config: MovementConfig) {
        this.#config = config;
    }

    get status(): Status {
        return this.#phase === 'idle' ? Stopped : this.#direction;
    }

    /** The state at startup: the target is the current position, a running movement comes from the signal. */
    initialize(context: MovementContext): MovementEffects {
        this.#endAt(null);
        const effects = this.#signal({ ...context, target: context.current });
        return { ...effects, target: context.current };
    }

    /**
     * A client command was written to ioBroker.
     *
     * @param context the Matter positions after the command set its target
     * @param target the target the command set, in 100ths of percent closed; undefined for a button command
     * @param direction the direction of a button command
     */
    command(context: MovementContext, target: number | undefined, direction: Status): MovementEffects {
        const { level, actual, signal } = this.#config;
        const there = target !== undefined && reached(context.current, target);
        const toward = target === undefined ? direction : directionOf(context.current, target, direction);
        if (level && !actual && target !== undefined) {
            if (!signal || there) {
                return { ...this.#endAt(target), current: target };
            }
            return { ...this.#commanded(toward, context.signal), current: target, target };
        }
        const unknownPosition = level && context.current === null;
        if (there || (!level && !signal) || (unknownPosition && !signal)) {
            return this.#end(context);
        }
        return { ...this.#commanded(toward, context.signal), ...(target !== undefined ? { target } : {}) };
    }

    /** The ioBroker write of a client command failed, or StopMotion arrived: the device keeps its position. */
    stop(context: MovementContext): MovementEffects {
        return this.#end(context);
    }

    /** ACTUAL changed; `context.current` is the new position. */
    positionChanged(context: MovementContext, previous: number | null): MovementEffects {
        const { current, target } = context;
        if (current === previous) {
            return { status: this.status };
        }
        if (this.#phase === 'idle' && !isMoving(context.signal)) {
            return { status: Stopped, target: current };
        }
        if (this.#phase === 'idle') {
            this.#requested = false;
        } else if (this.#phase === 'commanded') {
            const change = directionOf(previous, current, Stopped);
            if (!this.#isStart(context.signal, change)) {
                return { status: this.status, watchdog: 'start' };
            }
            this.#begin(signalDirection(context.signal) ?? change);
        }
        this.#phase = 'moving';
        const fromSignal = signalDirection(context.signal);
        if (fromSignal !== undefined) {
            this.#direction = fromSignal;
        } else if (!this.#requested || this.#direction === Stopped) {
            this.#direction = directionOf(previous, current, this.#direction);
        }
        const follow = this.#requested ? {} : { target: current };
        if (isMoving(context.signal)) {
            return { status: this.status, ...follow, watchdog: 'clear' };
        }
        if (this.#requested && reached(current, target)) {
            return this.#end(context);
        }
        return { status: this.status, ...follow, watchdog: 'start' };
    }

    /** SET changed in ioBroker; `value` is the new SET, in 100ths of percent closed. */
    levelChanged(context: MovementContext, value: number): MovementEffects {
        if (value === context.target) {
            return { status: this.status };
        }
        return { ...this.command(context, value, Stopped), target: value };
    }

    /** DIRECTION_ENUM or WORKING changed; `context.signal` is the new value. */
    signalChanged(context: MovementContext): MovementEffects {
        return this.#signal(context);
    }

    /** The watchdog fired. */
    watchdog(context: MovementContext): MovementEffects {
        if (this.#phase === 'idle') {
            return { status: Stopped };
        }
        // A WORKING that stays true without a reported stop: most likely the device reversed without a pause
        if (this.#phase === 'commanded' && (context.signal === 'working' || this.#isStart(context.signal, undefined))) {
            this.#begin(signalDirection(context.signal));
            return { status: this.status, watchdog: 'start' };
        }
        if (this.#phase === 'moving' && isMoving(context.signal)) {
            return { status: this.status, watchdog: 'start' };
        }
        return this.#end(context);
    }

    #signal(context: MovementContext): MovementEffects {
        const { signal } = context;
        if (!this.#config.signal || signal === undefined) {
            return { status: this.status };
        }
        if (signal === 'stopped') {
            if (this.#phase === 'commanded') {
                this.#sawStop = true;
            }
            return this.#phase === 'moving' ? this.#end(context) : { status: this.status };
        }
        if (this.#phase === 'commanded') {
            if (!this.#isStart(signal, undefined)) {
                return { status: this.status };
            }
            this.#begin(signalDirection(signal));
            return { status: this.status, watchdog: 'clear' };
        }
        if (this.#phase === 'idle') {
            this.#requested = false;
            this.#direction = Stopped;
        }
        this.#phase = 'moving';
        this.#direction = signalDirection(signal) ?? this.#direction;
        return { status: this.status, watchdog: 'clear' };
    }

    /**
     * A movement already running in the commanded direction, by the signal or, for WORKING, by the direction the axis
     * moves in, makes the axis moving: no new start is to be expected. Any other running movement may first stop and
     * report that before the device starts the command, so the axis stays commanded. A repeated command while commanded
     * keeps waiting for the start of the first one.
     */
    #commanded(direction: Status, signal: SignalValue): MovementEffects {
        const moving = this.#phase === 'moving';
        const before = moving ? this.#direction : undefined;
        if (this.#phase === 'commanded') {
            // The movement from before the earlier command may still run
            this.#movingAtCommand ||= isMoving(signal);
        } else {
            this.#movingAtCommand = moving || isMoving(signal);
            this.#sawStop = false;
        }
        this.#requested = true;
        this.#direction = direction;
        const running = signalDirection(signal) ?? (isMoving(signal) ? before : undefined);
        if (this.#config.signal && direction !== Stopped && running === direction) {
            this.#phase = 'moving';
            return { status: direction, watchdog: 'clear' };
        }
        this.#phase = 'commanded';
        return { status: direction, watchdog: 'start' };
    }

    /**
     * Whether the device started the command, from the signal and the direction of a position change. A report of the
     * commanded direction is the start. A signal reporting the other direction is the movement from before the command.
     * Any other report (WORKING, a position change in the other direction, or any report for a command without known
     * direction) is the start only when no movement ran at the command, by the signal or by the phase, or after the
     * device reported a stop.
     */
    #isStart(signal: SignalValue, change: Status | undefined): boolean {
        const command = this.#direction;
        const reported = signalDirection(signal) ?? change;
        if (command !== Stopped && reported !== undefined && reported !== Stopped) {
            if (reported === command) {
                return true;
            }
            if (signalDirection(signal) !== undefined) {
                return false;
            }
        }
        const moves = isMoving(signal) || (change !== undefined && change !== Stopped);
        return moves && (!this.#movingAtCommand || this.#sawStop);
    }

    /** The command started; a command without known direction takes the reported one. */
    #begin(reported: Status | undefined): void {
        this.#phase = 'moving';
        if (this.#direction === Stopped) {
            this.#direction = reported ?? Stopped;
        }
    }

    #end(context: MovementContext): MovementEffects {
        return this.#endAt(context.current);
    }

    #endAt(position: number | null): MovementEffects {
        this.#phase = 'idle';
        this.#direction = Stopped;
        this.#requested = false;
        this.#movingAtCommand = false;
        this.#sawStop = false;
        return { status: Stopped, ...(position !== null ? { target: position } : {}), watchdog: 'clear' };
    }
}

/** Opening toward a smaller value (more open), Closing toward a larger one, Stopped when equal; `fallback` if unknown. */
function directionOf(from: number | null, to: number | null, fallback: Status): Status {
    if (from === null || to === null) {
        return fallback;
    }
    return to === from ? Stopped : to < from ? Opening : Closing;
}

function reached(current: number | null, target: number | null): boolean {
    return current !== null && target !== null && Math.abs(current - target) <= REACHED_TOLERANCE;
}

function isMoving(signal: SignalValue): boolean {
    return signal === 'opening' || signal === 'closing' || signal === 'working';
}

function signalDirection(signal: SignalValue): Status | undefined {
    return signal === 'opening' ? Opening : signal === 'closing' ? Closing : undefined;
}
