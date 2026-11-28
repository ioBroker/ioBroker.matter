import { Endpoint } from '@matter/main';
import { WindowCoveringDevice } from '@matter/main/devices';
import { MovementType, MovementDirection } from '@matter/main/behaviors';
import { EventedWindowCoveringServer } from '../behaviors/EventedWindowCoveringServer';
import { WindowCovering } from '@matter/main/clusters';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { BlindButtons } from '../../lib/devices/BlindButtons';
import { Blind } from '../../lib/devices/Blind';
import { BlindDirections } from '../../lib/devices/BlindDirections';
import { GenericDeviceToMatter } from './GenericDeviceToMatter';
import { IoBrokerEvents } from '../behaviors/IoBrokerEvents';
import { IoIdentifyServer } from '../behaviors/IdentifyServer';
import { IoBrokerContext } from '../behaviors/IoBrokerContext';
import {
    type MovementContext,
    type MovementEffects,
    SETTLE_MS,
    type SignalValue,
    WindowCoveringMovement,
} from './WindowCoveringMovement';

const IoBrokerWindowCoveringDevice = WindowCoveringDevice.with(
    EventedWindowCoveringServer,
    IoBrokerEvents,
    IoIdentifyServer,
    IoBrokerContext,
);
type IoBrokerWindowCoveringDevice = typeof IoBrokerWindowCoveringDevice;

const { Stopped, Opening, Closing } = WindowCovering.MovementStatus;

/** A level state of an axis, in ioBroker percent: 100 is open. */
interface AxisLevel {
    /** The level of ACTUAL when the device has that state, else of SET. */
    current(): number | undefined;
    /** The level of SET. */
    target(): number | undefined;
    readonly hasActual: boolean;
    set(percent: number): Promise<void>;
}

/** Lift or tilt: a level state makes it position aware, buttons move it without one. */
interface CoveringAxis {
    readonly type: MovementType;
    readonly level?: AxisLevel;
    readonly open?: () => Promise<void>;
    readonly close?: () => Promise<void>;
    readonly stop?: () => Promise<void>;
}

interface AxisRuntime {
    readonly axis: CoveringAxis;
    readonly movement: WindowCoveringMovement;
    readonly signal?: () => SignalValue;
    watchdog?: ioBroker.Timeout;
    /** Counts the watchdog starts, so a callback of a replaced watchdog that is already queued does nothing. */
    watchdogRun: number;
    /** The last SET value written or reported, so a repeated or own value is no new target. */
    lastLevel?: number;
}

/** Matter counts in 100ths of percent closed, ioBroker in percent open. */
function toMatterPosition(percent: unknown): number | null {
    return typeof percent === 'number' && Number.isFinite(percent) ? Math.round(100 - percent) * 100 : null;
}

function toIoBrokerPercent(percent100ths: number): number {
    return 100 - Math.round(percent100ths / 100);
}

function toPercentage(percent100ths: number | null): number | null {
    return percent100ths === null ? null : Math.floor(percent100ths / 100);
}

function liftOf(device: BlindButtons | Blind): CoveringAxis | undefined {
    const blind = device instanceof Blind && device.hasLiftLevel() ? device : undefined;
    const buttons = device.hasLiftButtons();
    if (blind === undefined && !buttons) {
        return undefined;
    }
    return {
        type: MovementType.Lift,
        level:
            blind === undefined
                ? undefined
                : {
                      current: () => blind.getLevel(),
                      target: () => blind.getTargetLevel(),
                      hasActual: blind.hasLevelActual(),
                      set: percent => blind.setLevel(percent),
                  },
        open: buttons ? () => device.setOpen() : undefined,
        close: buttons ? () => device.setClose() : undefined,
        stop: device.hasLiftStopButton() ? () => device.setStop() : undefined,
    };
}

function tiltOf(device: BlindButtons | Blind): CoveringAxis | undefined {
    const level = device.hasTiltLevel();
    const buttons = device.hasTiltButtons();
    if (!level && !buttons) {
        return undefined;
    }
    return {
        type: MovementType.Tilt,
        level: level
            ? {
                  current: () => device.getTiltLevel(),
                  target: () => device.getTargetTiltLevel(),
                  hasActual: device.hasTiltLevelActual(),
                  set: percent => device.setTiltLevel(percent),
              }
            : undefined,
        open: buttons ? () => device.setTiltOpen() : undefined,
        close: buttons ? () => device.setTiltClose() : undefined,
        stop: device.hasTiltStopButton() ? () => device.setTiltStop() : undefined,
    };
}

/**
 * DIRECTION_ENUM by its label in any case, also UP / OPEN / OPENING, DOWN / CLOSE / CLOSING and STOP / STOPPED, or
 * without listed values by its number.
 */
function directionSignal(value: unknown): SignalValue {
    if (typeof value === 'number') {
        return value === 0 ? 'stopped' : value === 1 ? 'opening' : value === 2 ? 'closing' : undefined;
    }
    if (typeof value !== 'string') {
        return undefined;
    }
    const label = value.toUpperCase();
    if (label === BlindDirections.None.toUpperCase() || label === 'STOP' || label === 'STOPPED') {
        return 'stopped';
    }
    if (label === BlindDirections.UpOrOpen.toUpperCase() || label === 'UP' || label === 'OPEN' || label === 'OPENING') {
        return 'opening';
    }
    if (
        label === BlindDirections.DownOrClose.toUpperCase() ||
        label === 'DOWN' ||
        label === 'CLOSE' ||
        label === 'CLOSING'
    ) {
        return 'closing';
    }
    return undefined;
}

function workingSignal(value: unknown): SignalValue {
    if (value === true || value === 1) {
        return 'working';
    }
    return value === false || value === 0 ? 'stopped' : undefined;
}

/** DIRECTION_ENUM, else WORKING. */
function signalOf(device: BlindButtons | Blind): (() => SignalValue) | undefined {
    if (device.hasDirectionEnum()) {
        return () => directionSignal(device.getDirectionEnum());
    }
    if (device.hasWorking()) {
        return () => workingSignal(device.getWorking());
    }
    return undefined;
}

/**
 * Maps an ioBroker blind to a Matter WindowCovering. Lift and tilt are each an axis: with a level state it is
 * position aware, otherwise it moves by its open and close buttons.
 *
 * | Matter                               | ioBroker, per axis                                                    |
 * | ------------------------------------ | --------------------------------------------------------------------- |
 * | GoTo...Percentage                    | level SET                                                             |
 * | UpOrOpen / DownOrClose               | level SET 100 / 0 for a position-aware axis, else OPEN / CLOSE button |
 * | StopMotion                           | STOP button, else level SET to the ACTUAL level                       |
 * | CurrentPosition...                   | level ACTUAL when the device has it, else SET                         |
 * | TargetPosition..., OperationalStatus | see {@link WindowCoveringMovement}                                    |
 *
 * DIRECTION_ENUM or WORKING report the movement of the lift, or of the tilt of a blind without lift. A client that
 * sets the motor reversed swaps the OPEN and CLOSE buttons of the lift; matter.js reports it for the lift only. All inputs run through one queue, because a movement
 * decides from the Matter positions that the previous input wrote.
 */
export class BlindsToMatter extends GenericDeviceToMatter {
    readonly #ioBrokerDevice: BlindButtons | Blind;
    readonly #matterEndpoint: Endpoint<IoBrokerWindowCoveringDevice>;
    readonly #axes = new Map<MovementType, AxisRuntime>();
    readonly #WindowCoveringServer;
    #queue: Promise<void> = Promise.resolve();
    #destroyed = false;

    constructor(ioBrokerDevice: BlindButtons | Blind, name: string, uuid: string) {
        super(name, uuid);

        this.#ioBrokerDevice = ioBrokerDevice;
        const lift = liftOf(ioBrokerDevice);
        const tilt = tiltOf(ioBrokerDevice);
        const signal = signalOf(ioBrokerDevice);
        const signalAxis = lift ?? tilt;
        for (const axis of [lift, tilt]) {
            if (axis === undefined) {
                continue;
            }
            const axisSignal = axis === signalAxis ? signal : undefined;
            this.#axes.set(axis.type, {
                axis,
                signal: axisSignal,
                watchdogRun: 0,
                movement: new WindowCoveringMovement({
                    level: axis.level !== undefined,
                    actual: axis.level?.hasActual ?? false,
                    signal: axisSignal !== undefined,
                }),
            });
        }

        const features = new Array<WindowCovering.Feature>();
        if (lift !== undefined) {
            features.push(WindowCovering.Feature.Lift);
            if (lift.level !== undefined) {
                features.push(WindowCovering.Feature.PositionAwareLift);
            }
        }
        if (tilt !== undefined) {
            features.push(WindowCovering.Feature.Tilt);
            if (tilt.level !== undefined) {
                features.push(WindowCovering.Feature.PositionAwareTilt);
            }
        }

        this.#WindowCoveringServer = EventedWindowCoveringServer.with(...features);
        this.#matterEndpoint = new Endpoint(IoBrokerWindowCoveringDevice.with(this.#WindowCoveringServer), {
            id: uuid,
            ioBrokerContext: {
                device: ioBrokerDevice,
                adapter: ioBrokerDevice.adapter,
            },
            windowCovering: {
                type:
                    lift && tilt
                        ? WindowCovering.WindowCoveringType.TiltBlindLift
                        : lift
                          ? WindowCovering.WindowCoveringType.Rollershade
                          : WindowCovering.WindowCoveringType.TiltBlindTiltOnly,
                endProductType:
                    lift && !tilt ? WindowCovering.EndProductType.RollerShade : WindowCovering.EndProductType.Unknown,
            },
        });
    }

    get matterEndpoints(): Endpoint[] {
        return [this.#matterEndpoint];
    }

    get ioBrokerDevice(): BlindButtons | Blind {
        return this.#ioBrokerDevice;
    }

    override async destroy(): Promise<void> {
        this.#destroyed = true;
        for (const runtime of this.#axes.values()) {
            this.#clearWatchdog(runtime);
        }
        await super.destroy();
    }

    async registerHandlersAndInitialize(): Promise<void> {
        await super.registerHandlersAndInitialize();

        for (const runtime of this.#axes.values()) {
            runtime.lastLevel = runtime.axis.level?.target();
            const current = toMatterPosition(runtime.axis.level?.current());
            const context = { current, target: current, signal: runtime.signal?.() };
            await this.#apply(runtime, { ...runtime.movement.initialize(context), current });
        }

        this.matterEvents.on(
            this.#matterEndpoint.events.ioBrokerEvents.windowCoveringTriggerMovement,
            async (type: MovementType, reversed: boolean, direction: MovementDirection, target?: number) => {
                const runtime = this.#axes.get(type);
                if (runtime !== undefined) {
                    await this.#run(() => this.#move(runtime, reversed, direction, target));
                }
            },
        );

        this.matterEvents.on(this.#matterEndpoint.events.ioBrokerEvents.windowCoveringStopMovement, async () => {
            await this.#run(async () => {
                const failures = new Array<unknown>();
                for (const runtime of this.#axes.values()) {
                    await this.#stop(runtime).catch(error => failures.push(error));
                }
                if (failures.length > 0) {
                    throw failures[0];
                }
            });
        });

        this.#ioBrokerDevice.onChange(async event => {
            const lift = this.#axes.get(MovementType.Lift);
            const tilt = this.#axes.get(MovementType.Tilt);
            switch (event.property) {
                case PropertyType.Level:
                    await this.#run(() => this.#levelChanged(lift, event.value));
                    break;
                case PropertyType.LevelActual:
                    await this.#run(() => this.#actualChanged(lift, event.value));
                    break;
                case PropertyType.TiltLevel:
                    await this.#run(() => this.#levelChanged(tilt, event.value));
                    break;
                case PropertyType.TiltLevelActual:
                    await this.#run(() => this.#actualChanged(tilt, event.value));
                    break;
                case PropertyType.DirectionEnum:
                case PropertyType.Working:
                    await this.#run(() => this.#signalChanged());
                    break;
            }
        });
    }

    /** Runs `work` after every earlier input; a failed input does not stop the later ones. */
    #run(work: () => Promise<void>): Promise<void> {
        const run = this.#queue.then(work);
        this.#queue = run.catch(() => {});
        return run;
    }

    #context(runtime: AxisRuntime, current?: number | null): MovementContext {
        const state = this.#matterEndpoint.stateOf(this.#WindowCoveringServer);
        const lift = runtime.axis.type === MovementType.Lift;
        const matterCurrent = lift ? state.currentPositionLiftPercent100ths : state.currentPositionTiltPercent100ths;
        return {
            current: current !== undefined ? current : (matterCurrent ?? null),
            target: (lift ? state.targetPositionLiftPercent100ths : state.targetPositionTiltPercent100ths) ?? null,
            signal: runtime.signal?.(),
        };
    }

    async #move(runtime: AxisRuntime, reversed: boolean, direction: MovementDirection, target?: number): Promise<void> {
        const { axis, movement } = runtime;
        this.#clearWatchdog(runtime);
        const status =
            direction === MovementDirection.Open ? Opening : direction === MovementDirection.Close ? Closing : Stopped;
        try {
            await this.#write(runtime, reversed, direction, target);
        } catch (error) {
            await this.#apply(runtime, movement.stop(this.#context(runtime)));
            throw error;
        }
        const levelTarget = axis.level !== undefined ? target : undefined;
        await this.#apply(runtime, movement.command(this.#context(runtime), levelTarget, status));
    }

    async #write(
        runtime: AxisRuntime,
        reversed: boolean,
        direction: MovementDirection,
        target?: number,
    ): Promise<void> {
        const { axis } = runtime;
        if (axis.level !== undefined && target !== undefined) {
            await this.#setLevel(runtime, toIoBrokerPercent(target));
            return;
        }
        // Mode.MotorDirectionReversed: the motor runs the other way than its buttons say
        const open = (direction === MovementDirection.Open) !== reversed;
        const button = open ? axis.open : axis.close;
        if (button !== undefined) {
            await button();
        } else if (axis.level !== undefined) {
            await this.#setLevel(runtime, open ? 100 : 0);
        }
    }

    async #setLevel(runtime: AxisRuntime, percent: number): Promise<void> {
        await runtime.axis.level?.set(percent);
        runtime.lastLevel = percent;
    }

    async #stop(runtime: AxisRuntime): Promise<void> {
        const { axis, movement } = runtime;
        this.#clearWatchdog(runtime);
        try {
            if (axis.stop !== undefined) {
                await axis.stop();
            } else if (axis.level?.hasActual) {
                // Without an ACTUAL state the position is the last target, so there is nothing to stop
                const current = axis.level.current();
                if (current !== undefined) {
                    await this.#setLevel(runtime, current);
                }
            }
        } finally {
            await this.#apply(runtime, movement.stop(this.#context(runtime)));
        }
    }

    async #levelChanged(runtime: AxisRuntime | undefined, value: unknown): Promise<void> {
        const target = toMatterPosition(value);
        if (runtime?.axis.level === undefined || target === null || value === runtime.lastLevel) {
            return;
        }
        runtime.lastLevel = typeof value === 'number' ? value : undefined;
        await this.#apply(runtime, runtime.movement.levelChanged(this.#context(runtime), target));
    }

    async #actualChanged(runtime: AxisRuntime | undefined, value: unknown): Promise<void> {
        if (runtime?.axis.level === undefined) {
            return;
        }
        const previous = this.#context(runtime).current;
        const current = toMatterPosition(value);
        const effects = runtime.movement.positionChanged(this.#context(runtime, current), previous);
        await this.#apply(runtime, { ...effects, current });
    }

    async #signalChanged(): Promise<void> {
        for (const runtime of this.#axes.values()) {
            if (runtime.signal !== undefined) {
                await this.#apply(runtime, runtime.movement.signalChanged(this.#context(runtime)));
            }
        }
    }

    async #watchdogFired(runtime: AxisRuntime, run: number): Promise<void> {
        if (run !== runtime.watchdogRun || runtime.watchdog !== undefined) {
            return;
        }
        await this.#apply(runtime, runtime.movement.watchdog(this.#context(runtime)));
    }

    /** Writes the effects of one input to Matter and runs the watchdog they ask for. */
    async #apply(runtime: AxisRuntime, effects: MovementEffects): Promise<void> {
        if (effects.watchdog !== undefined) {
            this.#clearWatchdog(runtime);
        }
        if (effects.watchdog === 'start' && !this.#destroyed) {
            const run = ++runtime.watchdogRun;
            runtime.watchdog = this.setDeviceTimeout(() => {
                runtime.watchdog = undefined;
                this.#run(() => this.#watchdogFired(runtime, run)).catch(error =>
                    this.#ioBrokerDevice.adapter.log.error(
                        `${this.uuid}: Cannot end the blind movement: ${String(error)}`,
                    ),
                );
            }, SETTLE_MS);
        }
        // Only a position-aware axis has position attributes
        const { current, target } = runtime.axis.level !== undefined ? effects : {};
        const lift = runtime.axis.type === MovementType.Lift;
        const positions = lift
            ? {
                  ...(current !== undefined
                      ? {
                            currentPositionLiftPercent100ths: current,
                            currentPositionLiftPercentage: toPercentage(current),
                        }
                      : {}),
                  ...(target !== undefined ? { targetPositionLiftPercent100ths: target } : {}),
              }
            : {
                  ...(current !== undefined
                      ? {
                            currentPositionTiltPercent100ths: current,
                            currentPositionTiltPercentage: toPercentage(current),
                        }
                      : {}),
                  ...(target !== undefined ? { targetPositionTiltPercent100ths: target } : {}),
              };
        await this.#matterEndpoint.setStateOf(this.#WindowCoveringServer, {
            ...positions,
            operationalStatus: this.#operationalStatus(),
        });
    }

    /** The global bits follow the lift, else the tilt, as matter.js computes them. */
    #operationalStatus(): WindowCovering.OperationalStatus {
        const lift = this.#axes.get(MovementType.Lift)?.movement.status;
        const tilt = this.#axes.get(MovementType.Tilt)?.movement.status;
        return {
            global: lift !== undefined && lift !== Stopped ? lift : (tilt ?? Stopped),
            ...(lift !== undefined ? { lift } : {}),
            ...(tilt !== undefined ? { tilt } : {}),
        };
    }

    #clearWatchdog(runtime: AxisRuntime): void {
        this.clearDeviceTimeout(runtime.watchdog);
        runtime.watchdog = undefined;
        runtime.watchdogRun++;
    }
}
