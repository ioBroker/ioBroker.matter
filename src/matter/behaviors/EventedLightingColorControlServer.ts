import { MaybePromise, type Behavior, type Transitions } from '@matter/main';
import { ColorTemperatureLightRequirements, ExtendedColorLightRequirements } from '@matter/main/devices';
import { IoBrokerEvents } from './IoBrokerEvents';
import { ColorControl } from '@matter/main/clusters';
import { EventedTransitions } from './EventedTransitions';

export class EventedColorTemperatureColorControlServer extends ColorTemperatureLightRequirements.ColorControlServer {
    declare protected internal: EventedColorTemperatureColorControlServer.Internal;

    override createTransitions<B extends Behavior>(config: Transitions.Configuration<B>): EventedTransitions<B> {
        const transitions = new EventedTransitions(this.endpoint, config);
        this.reactTo(transitions.colorTemperatureMireds$Changed, this.#setColorTemperatureMireds, { lock: true });
        return transitions;
    }

    #setColorTemperatureMireds(colorTemperatureMireds: number): void {
        const transitionTime = this.internal.currentTransitionTime;
        this.internal.currentTransitionTime = undefined;
        if (transitionTime == undefined || transitionTime === 0) {
            this.state.colorTemperatureMireds = colorTemperatureMireds;
        }
        this.endpoint.act(agent =>
            agent.get(IoBrokerEvents).events.colorTemperatureControlled.emit(colorTemperatureMireds, transitionTime),
        );
    }

    override moveToColorTemperatureLogic(targetMireds: number, transitionTime: number): MaybePromise {
        this.internal.currentTransitionTime = transitionTime;
        return super.moveToColorTemperatureLogic(targetMireds, transitionTime);
    }

    override moveColorTemperatureLogic(
        moveMode: ColorControl.MoveMode,
        rate: number,
        colorTemperatureMinimumMireds: number,
        colorTemperatureMaximumMireds: number,
    ): MaybePromise {
        this.internal.currentTransitionTime = undefined;
        return super.moveColorTemperatureLogic(
            moveMode,
            rate,
            colorTemperatureMinimumMireds,
            colorTemperatureMaximumMireds,
        );
    }

    override stepColorTemperatureLogic(
        stepMode: ColorControl.StepMode,
        stepSize: number,
        transitionTime: number,
        colorTemperatureMinimumMireds: number,
        colorTemperatureMaximumMireds: number,
    ): MaybePromise {
        this.internal.currentTransitionTime = transitionTime;
        return super.stepColorTemperatureLogic(
            stepMode,
            stepSize,
            transitionTime,
            colorTemperatureMinimumMireds,
            colorTemperatureMaximumMireds,
        );
    }

    override stopMoveStepLogic(): MaybePromise {
        this.internal.currentTransitionTime = undefined;
        const result = super.stopMoveStepLogic();
        return MaybePromise.then(result, () =>
            this.endpoint.act(agent => agent.get(IoBrokerEvents).events.colorMovementStopped.emit()),
        );
    }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace EventedColorTemperatureColorControlServer {
    export class Internal extends ColorTemperatureLightRequirements.ColorControlServer.Internal {
        currentTransitionTime?: number | null;
    }
}

export class EventedExtendedColorXyColorControlServer extends ExtendedColorLightRequirements.ColorControlServer {
    declare protected internal: EventedExtendedColorXyColorControlServer.Internal;

    override createTransitions<B extends Behavior>(config: Transitions.Configuration<B>): EventedTransitions<B> {
        const transitions = new EventedTransitions(this.endpoint, config);
        this.reactTo(transitions.colorTemperatureMireds$Changed, this.#setColorTemperatureMireds, { lock: true });
        this.reactTo(transitions.currentXy$Changed, this.#setXy, { lock: true });
        return transitions;
    }

    #setColorTemperatureMireds(colorTemperatureMireds: number): void {
        const transitionTime = this.internal.currentTransitionTime;
        this.internal.currentTransitionTime = undefined;
        if (transitionTime == undefined || transitionTime === 0) {
            this.state.colorTemperatureMireds = colorTemperatureMireds;
        }
        this.endpoint.act(agent =>
            agent.get(IoBrokerEvents).events.colorTemperatureControlled.emit(colorTemperatureMireds, transitionTime),
        );
    }

    #setXy(x: number | null, y: number | null): void {
        if (x === null || y == null) {
            return;
        }
        const transitionTime = this.internal.currentTransitionTime;
        this.internal.currentTransitionTime = undefined;
        if (transitionTime == undefined || transitionTime === 0) {
            this.state.currentX = x;
            this.state.currentY = y;
        }
        this.endpoint.act(agent => agent.get(IoBrokerEvents).events.colorXyControlled.emit(x, y, transitionTime));
    }

    override moveToColorTemperatureLogic(targetMireds: number, transitionTime: number): MaybePromise {
        this.internal.currentTransitionTime = transitionTime;
        return super.moveToColorTemperatureLogic(targetMireds, transitionTime);
    }

    override moveColorTemperatureLogic(
        moveMode: ColorControl.MoveMode,
        rate: number,
        colorTemperatureMinimumMireds: number,
        colorTemperatureMaximumMireds: number,
    ): MaybePromise {
        this.internal.currentTransitionTime = undefined;
        return super.moveColorTemperatureLogic(
            moveMode,
            rate,
            colorTemperatureMinimumMireds,
            colorTemperatureMaximumMireds,
        );
    }

    override stepColorTemperatureLogic(
        stepMode: ColorControl.StepMode,
        stepSize: number,
        transitionTime: number,
        colorTemperatureMinimumMireds: number,
        colorTemperatureMaximumMireds: number,
    ): MaybePromise {
        this.internal.currentTransitionTime = transitionTime;
        return super.stepColorTemperatureLogic(
            stepMode,
            stepSize,
            transitionTime,
            colorTemperatureMinimumMireds,
            colorTemperatureMaximumMireds,
        );
    }

    override stopMoveStepLogic(): MaybePromise {
        this.internal.currentTransitionTime = undefined;
        const result = super.stopMoveStepLogic();
        return MaybePromise.then(result, () =>
            this.endpoint.act(agent => agent.get(IoBrokerEvents).events.colorMovementStopped.emit()),
        );
    }

    override moveToColorLogic(targetX: number, targetY: number, transitionTime: number): MaybePromise {
        this.internal.currentTransitionTime = transitionTime;
        return super.moveToColorLogic(targetX, targetY, transitionTime);
    }

    override moveColorLogic(rateX: number, rateY: number): MaybePromise {
        this.internal.currentTransitionTime = undefined;
        return super.moveColorLogic(rateX, rateY);
    }

    override stepColorLogic(stepX: number, stepY: number, transitionTime: number): MaybePromise {
        this.internal.currentTransitionTime = transitionTime;
        return super.stepColorLogic(stepX, stepY, transitionTime);
    }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace EventedExtendedColorXyColorControlServer {
    export class Internal extends ExtendedColorLightRequirements.ColorControlServer.Internal {
        currentTransitionTime?: number | null;
    }
}

const BaseHueSaturationColorControlServer = EventedExtendedColorXyColorControlServer.with(
    ColorControl.Feature.ColorTemperature,
    ColorControl.Feature.Xy,
    ColorControl.Feature.HueSaturation,
);

export class EventedExtendedColorHueSaturationColorControlServer extends BaseHueSaturationColorControlServer {
    declare protected internal: EventedExtendedColorHueSaturationColorControlServer.Internal;

    override createTransitions<B extends Behavior>(config: Transitions.Configuration<B>): EventedTransitions<B> {
        const transitions = super.createTransitions(config) as EventedTransitions<B>;
        this.reactTo(transitions.currentHue$Changed, this.#setHue, { lock: true });
        this.reactTo(transitions.currentSaturation$Changed, this.#setSaturation, { lock: true });
        return transitions;
    }

    #setHue(hue: number): void {
        const transitionTime = this.internal.currentTransitionTime;
        this.internal.currentTransitionTime = undefined;
        if (transitionTime == undefined || transitionTime === 0) {
            this.state.currentHue = hue;
        }
        if (this.internal.blockEvents.has('hue')) {
            this.internal.blockEvents.delete('hue');
            return;
        }
        this.endpoint.act(agent =>
            agent.get(IoBrokerEvents).events.colorHueControlled.emit(hue, transitionTime, false),
        );
    }

    #setSaturation(saturation: number): void {
        const transitionTime = this.internal.currentTransitionTime;
        this.internal.currentTransitionTime = undefined;
        if (transitionTime == undefined || transitionTime === 0) {
            this.state.currentSaturation = saturation;
        }
        if (this.internal.blockEvents.has('saturation')) {
            this.internal.blockEvents.delete('saturation');
            return;
        }
        this.endpoint.act(agent =>
            agent.get(IoBrokerEvents).events.colorSaturationControlled.emit(saturation, transitionTime),
        );
    }

    override moveToHueLogic(
        targetHue: number,
        direction: ColorControl.Direction,
        transitionTime: number,
        isEnhancedHue: boolean,
    ): MaybePromise {
        this.internal.currentTransitionTime = transitionTime;
        return super.moveToHueLogic(targetHue, direction, transitionTime, isEnhancedHue);
    }

    override moveHueLogic(moveMode: ColorControl.MoveMode, rate: number, isEnhancedHue: boolean): MaybePromise {
        this.internal.currentTransitionTime = undefined;
        return super.moveHueLogic(moveMode, rate, isEnhancedHue);
    }

    override stepHueLogic(
        stepMode: ColorControl.StepMode,
        stepSize: number,
        transitionTime: number,
        isEnhancedHue: boolean,
    ): MaybePromise {
        this.internal.currentTransitionTime = transitionTime;
        return super.stepHueLogic(stepMode, stepSize, transitionTime, isEnhancedHue);
    }

    override stopHueAndSaturationMovement(): MaybePromise {
        this.internal.currentTransitionTime = undefined;
        const result = super.stopHueAndSaturationMovement();
        return MaybePromise.then(result, () =>
            this.endpoint.act(agent => agent.get(IoBrokerEvents).events.colorHueAndSaturationMovementStopped.emit()),
        );
    }

    override moveToSaturationLogic(targetSaturation: number, transitionTime: number): MaybePromise {
        this.internal.currentTransitionTime = transitionTime;
        return super.moveToSaturationLogic(targetSaturation, transitionTime);
    }

    override moveSaturationLogic(moveMode: ColorControl.MoveMode, rate: number): MaybePromise {
        this.internal.currentTransitionTime = undefined;
        return super.moveSaturationLogic(moveMode, rate);
    }

    override stepSaturationLogic(
        stepMode: ColorControl.StepMode,
        stepSize: number,
        transitionTime: number,
    ): MaybePromise {
        this.internal.currentTransitionTime = transitionTime;
        return super.stepSaturationLogic(stepMode, stepSize, transitionTime);
    }

    override moveToHueAndSaturationLogic(
        targetHue: number,
        targetSaturation: number,
        transitionTime: number,
    ): MaybePromise {
        this.internal.blockEvents.set('hue', true);
        this.internal.blockEvents.set('saturation', true);
        const result = super.moveToHueAndSaturationLogic(targetHue, targetSaturation, transitionTime);
        return MaybePromise.then(result, () =>
            this.endpoint.act(agent =>
                agent
                    .get(IoBrokerEvents)
                    .events.colorHueSaturationControlled.emit(this.hue, this.saturation, transitionTime),
            ),
        );
    }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace EventedExtendedColorHueSaturationColorControlServer {
    export class Internal extends BaseHueSaturationColorControlServer.Internal {
        /** Block Events for the "Hue and Saturation" case to not receive multiple events */
        blockEvents: Map<string, boolean> = new Map();

        /** Current transition instance for the color control */
        eventedTransitions?: EventedTransitions<Behavior>;
    }
}
