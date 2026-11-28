import { expect } from 'chai';
import { WindowCovering } from '@matter/main/clusters';
import {
    type MovementConfig,
    type MovementContext,
    type MovementEffects,
    type SignalValue,
    WindowCoveringMovement,
} from '../src/matter/to-matter/WindowCoveringMovement';

const { Stopped, Opening, Closing } = WindowCovering.MovementStatus;

/**
 * One axis as `BlindsToMatter` drives it: the Matter positions the effects wrote, the watchdog and the device signal.
 * Positions are in 100ths of percent closed.
 */
class Axis {
    current: number | null;
    target: number | null;
    signal: SignalValue = undefined;
    watchdog = false;
    readonly movement: WindowCoveringMovement;

    constructor(config: MovementConfig, position: number | null) {
        this.movement = new WindowCoveringMovement(config);
        this.current = position;
        this.target = position;
        this.#apply(this.movement.initialize(this.context()));
    }

    get status(): WindowCovering.MovementStatus {
        return this.movement.status;
    }

    context(): MovementContext {
        return { current: this.current, target: this.target, signal: this.signal };
    }

    /** A client command: matter.js sets the target first. */
    command(target: number | undefined, direction = Stopped): this {
        if (target !== undefined) {
            this.target = target;
        }
        return this.#apply(this.movement.command(this.context(), target, direction));
    }

    stop(): this {
        return this.#apply(this.movement.stop(this.context()));
    }

    position(current: number | null): this {
        const previous = this.current;
        this.current = current;
        return this.#apply(this.movement.positionChanged(this.context(), previous));
    }

    level(value: number): this {
        return this.#apply(this.movement.levelChanged(this.context(), value));
    }

    signalTo(signal: SignalValue): this {
        this.signal = signal;
        return this.#apply(this.movement.signalChanged(this.context()));
    }

    fireWatchdog(): this {
        expect(this.watchdog, 'no watchdog is running').to.equal(true);
        this.watchdog = false;
        return this.#apply(this.movement.watchdog(this.context()));
    }

    #apply(effects: MovementEffects): this {
        expect(effects.status).to.equal(this.movement.status);
        if (effects.current !== undefined) {
            this.current = effects.current;
        }
        if (effects.target !== undefined) {
            this.target = effects.target;
        }
        if (effects.watchdog !== undefined) {
            this.watchdog = effects.watchdog === 'start';
        }
        return this;
    }
}

const ACTUAL: MovementConfig = { level: true, actual: true, signal: false };
const SET_ONLY: MovementConfig = { level: true, actual: false, signal: false };
const BUTTONS: MovementConfig = { level: false, actual: false, signal: false };
const ACTUAL_SIGNAL: MovementConfig = { level: true, actual: true, signal: true };
const BUTTONS_SIGNAL: MovementConfig = { level: false, actual: false, signal: true };

describe('WindowCoveringMovement', () => {
    describe('startup', () => {
        it('starts idle with the target at the current position', () => {
            const axis = new Axis(ACTUAL, 7000);
            expect(axis).to.include({ status: Stopped, current: 7000, target: 7000, watchdog: false });
        });

        it('starts moving when the signal reports a movement', () => {
            const movement = new WindowCoveringMovement(ACTUAL_SIGNAL);
            const effects = movement.initialize({ current: 7000, target: 2000, signal: 'closing' });
            expect(effects).to.include({ status: Closing, target: 7000 });
        });
    });

    describe('commands', () => {
        it('ends a command to the current position', () => {
            expect(new Axis(ACTUAL, 0).command(0, Opening)).to.include({ status: Stopped, watchdog: false });
            expect(new Axis(SET_ONLY, 0).command(0, Opening)).to.include({ status: Stopped });
            expect(new Axis(ACTUAL_SIGNAL, 0).command(0, Opening)).to.include({ status: Stopped, watchdog: false });
        });

        it('takes the target as the position of an axis without ACTUAL', () => {
            const axis = new Axis(SET_ONLY, 7000).command(2500);
            expect(axis).to.include({ status: Stopped, current: 2500, target: 2500, watchdog: false });
        });

        it('ends a command to the current position of an axis without ACTUAL but with a signal', () => {
            const axis = new Axis({ level: true, actual: false, signal: true }, 7000).command(7000, Closing);
            expect(axis).to.include({ status: Stopped, watchdog: false });
        });

        it('keeps an axis without ACTUAL but with a signal commanded until the signal ends it', () => {
            const axis = new Axis({ level: true, actual: false, signal: true }, 7000).command(2500);
            expect(axis).to.include({ status: Opening, current: 2500, watchdog: true });
            axis.signalTo('opening').signalTo('stopped');
            expect(axis).to.include({ status: Stopped, target: 2500 });
        });

        it('cannot follow a button axis without signal', () => {
            expect(new Axis(BUTTONS, null).command(undefined, Opening)).to.include({ status: Stopped });
        });

        it('ends a command at once while the position is unknown and no signal exists', () => {
            expect(new Axis(ACTUAL, null).command(0, Opening)).to.include({ status: Stopped, watchdog: false });
        });

        it('takes a command within 1 % of the position as one to the position', () => {
            expect(new Axis(ACTUAL, 7000).command(7040)).to.include({ status: Stopped, watchdog: false });
        });

        it('returns the target of a position command, so a later input cannot keep an older one', () => {
            const movement = new WindowCoveringMovement(ACTUAL);
            movement.initialize({ current: 7000, target: 7000, signal: undefined });
            const effects = movement.command({ current: 7000, target: 7000, signal: undefined }, 2500, Stopped);
            expect(effects).to.include({ status: Opening, target: 2500 });
        });

        it('is moving at once on a command while the signal already reports that direction', () => {
            const axis = new Axis(BUTTONS_SIGNAL, null).command(undefined, Closing).signalTo('closing');
            axis.command(undefined, Closing);
            expect(axis).to.include({ status: Closing, watchdog: false });
        });

        it('keeps a reversal commanded through the stop the device reports before it reverses', () => {
            const axis = new Axis(ACTUAL_SIGNAL, 7000).command(0).signalTo('opening').position(4000);
            axis.command(10000);
            expect(axis).to.include({ status: Closing, target: 10000, watchdog: true });
            axis.signalTo('stopped');
            expect(axis).to.include({ status: Closing, target: 10000 });
            axis.signalTo('closing').position(4500);
            expect(axis).to.include({ status: Closing, target: 10000 });
        });

        it('keeps a reversal of a button axis with WORKING through the stop before it', () => {
            const axis = new Axis(BUTTONS_SIGNAL, null).command(undefined, Opening).signalTo('working');
            axis.command(undefined, Closing).signalTo('stopped');
            expect(axis.status).to.equal(Closing);
            axis.signalTo('working');
            expect(axis.status).to.equal(Closing);
        });

        it('continues a second command in the running direction with WORKING, ended by its stop', () => {
            const axis = new Axis(BUTTONS_SIGNAL, null).command(undefined, Opening).signalTo('working');
            axis.command(undefined, Opening);
            expect(axis).to.include({ status: Opening, watchdog: false });
            axis.signalTo('stopped');
            expect(axis.status).to.equal(Stopped);
        });

        it('keeps a reversal commanded while the old movement still reports its position', () => {
            const axis = new Axis(ACTUAL_SIGNAL, 7000).command(0).signalTo('opening').position(4000);
            axis.command(10000).position(3900);
            expect(axis).to.include({ status: Closing, target: 10000, watchdog: true });
            axis.signalTo('stopped').signalTo('closing').position(4500);
            expect(axis).to.include({ status: Closing, target: 10000 });
        });

        it('keeps a reversal commanded through a repeated old signal value', () => {
            const axis = new Axis(ACTUAL_SIGNAL, 7000).command(0).signalTo('opening').position(4000);
            axis.command(10000).signalTo('opening');
            expect(axis).to.include({ status: Closing, target: 10000 });
            axis.signalTo('stopped').signalTo('closing');
            expect(axis).to.include({ status: Closing, target: 10000 });
        });

        it('keeps a reversal with WORKING commanded through a repeated working', () => {
            const axis = new Axis(BUTTONS_SIGNAL, null).command(undefined, Opening).signalTo('working');
            axis.command(undefined, Closing).signalTo('working').signalTo('stopped');
            expect(axis.status).to.equal(Closing);
            axis.signalTo('working').signalTo('stopped');
            expect(axis.status).to.equal(Stopped);
        });

        it('keeps a WORKING reversal commanded through a repeated command', () => {
            const axis = new Axis(BUTTONS_SIGNAL, null).command(undefined, Opening).signalTo('working');
            axis.command(undefined, Closing).command(undefined, Closing).signalTo('stopped');
            expect(axis).to.include({ status: Closing, watchdog: true });
        });

        it('keeps a reversal commanded while a lagging signal has not reported the movement yet', () => {
            const axis = new Axis(ACTUAL_SIGNAL, 7000).command(0).position(6000);
            axis.command(10000).position(5900);
            expect(axis).to.include({ status: Closing, target: 10000 });
            axis.signalTo('working').signalTo('stopped').signalTo('working');
            expect(axis).to.include({ status: Closing, target: 10000 });
        });

        it('takes a WORKING that stays true until the watchdog as the start of a reversal', () => {
            const axis = new Axis(BUTTONS_SIGNAL, null).command(undefined, Opening).signalTo('working');
            axis.command(undefined, Closing).fireWatchdog();
            expect(axis).to.include({ status: Closing, watchdog: true });
        });

        it('takes no report of the other direction as the start of a command', () => {
            const axis = new Axis(ACTUAL_SIGNAL, 7000).command(10000).signalTo('opening');
            expect(axis).to.include({ status: Closing, watchdog: true });
        });

        it('ends a command on the watchdog while a stale signal reports the other direction', () => {
            const axis = new Axis(BUTTONS_SIGNAL, null);
            axis.signal = 'opening';
            axis.command(undefined, Closing).fireWatchdog();
            expect(axis).to.include({ status: Stopped, watchdog: false });
        });

        it('takes the direction of a command without known direction from the first position change', () => {
            const axis = new Axis(ACTUAL_SIGNAL, null).command(2500, Stopped).signalTo('working');
            axis.current = 7000;
            axis.position(6000);
            expect(axis.status).to.equal(Opening);
        });

        it('waits for the signal on a position command while the position is unknown', () => {
            const axis = new Axis(ACTUAL_SIGNAL, null).command(2500, Stopped);
            expect(axis).to.include({ watchdog: true });
            axis.signalTo('opening');
            expect(axis).to.include({ status: Opening, target: 2500 });
        });

        it('takes the direction of a position command from the target', () => {
            expect(new Axis(ACTUAL, 7000).command(2500)).to.include({ status: Opening, watchdog: true });
            expect(new Axis(ACTUAL, 2500).command(7000)).to.include({ status: Closing, watchdog: true });
        });

        it('ends on a failed write or StopMotion with the target at the position', () => {
            const axis = new Axis(ACTUAL, 7000).command(0).position(5000).stop();
            expect(axis).to.include({ status: Stopped, target: 5000, watchdog: false });
        });
    });

    describe('position changes', () => {
        it('ends a requested movement within 1 % of the target', () => {
            const axis = new Axis(ACTUAL, 7000).command(2550).position(5000);
            expect(axis).to.include({ status: Opening, watchdog: true });
            axis.position(2600);
            expect(axis).to.include({ status: Stopped, target: 2600, watchdog: false });
        });

        it('ignores a repeated equal position', () => {
            const axis = new Axis(ACTUAL, 7000).command(0).position(400);
            axis.watchdog = false;
            axis.position(400);
            expect(axis.watchdog, 'the equal position restarted the watchdog').to.equal(false);
        });

        it('ends a movement on the watchdog when the position stops short of the target', () => {
            const axis = new Axis(ACTUAL, 7000).command(0).position(400).fireWatchdog();
            expect(axis).to.include({ status: Stopped, target: 400 });
        });

        it('follows a hand move while idle without reporting a movement', () => {
            const axis = new Axis(ACTUAL, 7000).position(4000);
            expect(axis).to.include({ status: Stopped, target: 4000, watchdog: false });
        });

        it('keeps the commanded direction on an overshoot', () => {
            const axis = new Axis(ACTUAL, 7000).command(0).position(3000).position(3500);
            expect(axis.status).to.equal(Opening);
        });

        it('restarts the watchdog of a signal axis while the signal does not report the movement yet', () => {
            const axis = new Axis(ACTUAL_SIGNAL, 7000).command(0);
            axis.signal = 'stopped';
            axis.watchdog = false;
            axis.position(6000);
            expect(axis).to.include({ status: Opening, watchdog: true });
        });
    });

    describe('SET changes', () => {
        it('ignores SET at the Matter target, e.g. the ack of the command', () => {
            const axis = new Axis(ACTUAL, 7000).command(2500);
            axis.watchdog = false;
            axis.level(2500);
            expect(axis).to.include({ status: Opening, target: 2500, watchdog: false });
        });

        it('takes SET of an axis without ACTUAL as the position', () => {
            const axis = new Axis(SET_ONLY, 7000).level(4000);
            expect(axis).to.include({ status: Stopped, current: 4000, target: 4000 });
        });

        it('takes another SET as a command to it', () => {
            const axis = new Axis(ACTUAL, 7000).level(2000);
            expect(axis).to.include({ status: Opening, target: 2000, watchdog: true });
        });
    });

    describe('signal', () => {
        it('follows DIRECTION_ENUM of a button axis', () => {
            const axis = new Axis(BUTTONS_SIGNAL, null).command(undefined, Closing);
            expect(axis).to.include({ status: Closing, watchdog: true });
            axis.signalTo('closing');
            expect(axis).to.include({ status: Closing, watchdog: false });
            axis.signalTo('stopped');
            expect(axis.status).to.equal(Stopped);
        });

        it('ignores a stopped signal before the device started', () => {
            const axis = new Axis(ACTUAL_SIGNAL, 7000).command(0).signalTo('stopped');
            expect(axis).to.include({ status: Opening, target: 0, watchdog: true });
        });

        it('ends a commanded movement the device never starts on the watchdog', () => {
            const axis = new Axis(ACTUAL_SIGNAL, 7000).command(0).fireWatchdog();
            expect(axis).to.include({ status: Stopped, target: 7000 });
        });

        it('keeps a movement going past the watchdog while the signal reports it', () => {
            const axis = new Axis(ACTUAL_SIGNAL, 7000).command(0).signalTo('working').position(3000);
            axis.watchdog = true;
            axis.fireWatchdog();
            expect(axis).to.include({ status: Opening, watchdog: true });
            axis.signalTo('stopped');
            expect(axis).to.include({ status: Stopped, target: 3000 });
        });

        it('ends a requested movement within 1 % when the signal does not report it', () => {
            const axis = new Axis(ACTUAL_SIGNAL, 7000).command(2550).position(2600);
            expect(axis).to.include({ status: Stopped, target: 2600 });
        });

        it('does not end a requested movement within 1 % while the signal still reports it', () => {
            const axis = new Axis(ACTUAL_SIGNAL, 7000).command(2550).signalTo('working').position(2600);
            expect(axis.status).to.equal(Opening);
        });

        it('shows a movement the device makes on its own with WORKING, the target following the position', () => {
            const axis = new Axis(ACTUAL_SIGNAL, 7000).signalTo('working');
            expect(axis.status).to.equal(Stopped);
            axis.position(5000);
            expect(axis).to.include({ status: Opening, target: 5000 });
            axis.position(4000);
            expect(axis).to.include({ status: Opening, target: 4000 });
            axis.signalTo('stopped');
            expect(axis).to.include({ status: Stopped, target: 4000 });
        });

        it('shows a movement the device makes on its own with DIRECTION_ENUM', () => {
            const axis = new Axis(ACTUAL_SIGNAL, 7000).signalTo('closing').position(8000);
            expect(axis).to.include({ status: Closing, target: 8000 });
        });

        it('ignores an unknown signal', () => {
            const axis = new Axis(ACTUAL_SIGNAL, 7000).command(0).signalTo(undefined);
            expect(axis).to.include({ status: Opening, watchdog: true });
        });
    });

    it('ignores the watchdog while idle', () => {
        const axis = new Axis(ACTUAL, 7000);
        axis.watchdog = true;
        expect(axis.fireWatchdog()).to.include({ status: Stopped, target: 7000 });
    });
});
