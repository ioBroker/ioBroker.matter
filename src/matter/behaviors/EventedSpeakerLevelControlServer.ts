import { type Behavior, type MaybePromise, type Transitions } from '@matter/main';
import type { TypeFromPartialBitSchema } from '@matter/main/types';
import { SpeakerRequirements } from '@matter/main/devices';
import type { LevelControl } from '@matter/main/clusters';
import { IoBrokerEvents } from './IoBrokerEvents';
import { EventedTransitions } from './EventedTransitions';

export class EventedSpeakerLevelControlServer extends SpeakerRequirements.LevelControlServer {
    declare protected internal: EventedSpeakerLevelControlServer.Internal;

    override createTransitions<B extends Behavior>(config: Transitions.Configuration<B>): EventedTransitions<B> {
        const transitions = new EventedTransitions(this.endpoint, config);
        this.reactTo(transitions.currentLevel$Changed, this.#setLevel, { lock: true });
        return transitions;
    }

    override moveToLevelLogic(
        level: number,
        transitionTime: number | null,
        withOnOff: boolean,
        options: TypeFromPartialBitSchema<typeof LevelControl.Options>,
    ): MaybePromise<void> {
        this.internal.currentTransitionTime = transitionTime;
        return super.moveToLevelLogic(level, transitionTime, withOnOff, options);
    }

    override moveLogic(
        moveMode: LevelControl.MoveMode,
        rate: number | null,
        withOnOff: boolean,
        options: TypeFromPartialBitSchema<typeof LevelControl.Options>,
    ): MaybePromise<void> {
        this.internal.currentTransitionTime = undefined;
        return super.moveLogic(moveMode, rate, withOnOff, options);
    }

    override stepLogic(
        stepMode: LevelControl.StepMode,
        stepSize: number,
        transitionTime: number | null,
        withOnOff: boolean,
        options: TypeFromPartialBitSchema<typeof LevelControl.Options>,
    ): MaybePromise<void> {
        this.internal.currentTransitionTime = transitionTime;
        return super.stepLogic(stepMode, stepSize, transitionTime, withOnOff, options);
    }

    override stopLogic(options: TypeFromPartialBitSchema<typeof LevelControl.Options>): MaybePromise<void> {
        this.internal.currentTransitionTime = undefined;
        return super.stopLogic(options);
    }

    #setLevel(level: number): void {
        const transitionTime = this.internal.currentTransitionTime;
        this.internal.currentTransitionTime = undefined;
        if (transitionTime == undefined || transitionTime === 0) {
            this.state.currentLevel = level;
        }
        this.endpoint.act(agent => agent.get(IoBrokerEvents).events.dimmerLevelControlled.emit(level, transitionTime));
    }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace EventedSpeakerLevelControlServer {
    export class Internal extends SpeakerRequirements.LevelControlServer.Internal {
        currentTransitionTime?: number | null;
    }
}
