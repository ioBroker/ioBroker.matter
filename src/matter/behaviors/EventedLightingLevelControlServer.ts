import { MaybePromise } from '@matter/main';
import type { TypeFromPartialBitSchema } from '@matter/main/types';
import { DimmableLightRequirements } from '@matter/main/devices';
import type { LevelControl } from '@matter/main/clusters';
import { IoBrokerEvents } from './IoBrokerEvents';

export class EventedLightingLevelControlServer extends DimmableLightRequirements.LevelControlServer {
    protected declare internal: EventedLightingLevelControlServer.Internal;

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

    override setLevel(
        level: number,
        withOnOff: boolean,
        options: TypeFromPartialBitSchema<typeof LevelControl.Options> = {},
    ): MaybePromise<void> {
        const transitionTime = this.internal.currentTransitionTime;
        this.internal.currentTransitionTime = undefined;
        const result = super.setLevel(level, withOnOff, options);
        return MaybePromise.then(result, () =>
            this.endpoint.act(agent =>
                agent.get(IoBrokerEvents).events.dimmerLevelControlled.emit(level, transitionTime),
            ),
        );
    }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace EventedLightingLevelControlServer {
    export class Internal extends DimmableLightRequirements.LevelControlServer.Internal {
        currentTransitionTime?: number | null;
    }
}
