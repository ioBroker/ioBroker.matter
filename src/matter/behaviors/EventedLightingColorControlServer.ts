import { MaybePromise } from '@matter/main';
import { ColorTemperatureLightRequirements, ExtendedColorLightRequirements } from '@matter/main/devices';
import { IoBrokerEvents } from './IoBrokerEvents';
import { ColorControl } from '@matter/main/clusters';

export class EventedColorTemperatureColorControlServer extends ColorTemperatureLightRequirements.ColorControlServer {
    override moveToColorTemperatureLogic(targetMireds: number, transitionTime: number): MaybePromise {
        const result = super.moveToColorTemperatureLogic(targetMireds, transitionTime);
        return MaybePromise.then(result, () =>
            this.endpoint.act(agent =>
                agent
                    .get(IoBrokerEvents)
                    .events.colorTemperatureControlled.emit(this.state.colorTemperatureMireds, transitionTime),
            ),
        );
    }

    override moveColorTemperatureLogic(
        moveMode: ColorControl.MoveMode,
        rate: number,
        colorTemperatureMinimumMireds: number,
        colorTemperatureMaximumMireds: number,
    ): MaybePromise {
        const result = super.moveColorTemperatureLogic(
            moveMode,
            rate,
            colorTemperatureMinimumMireds,
            colorTemperatureMaximumMireds,
        );
        return MaybePromise.then(result, () =>
            this.endpoint.act(agent =>
                agent
                    .get(IoBrokerEvents)
                    .events.colorTemperatureControlled.emit(this.state.colorTemperatureMireds, undefined),
            ),
        );
    }

    override stepColorTemperatureLogic(
        stepMode: ColorControl.StepMode,
        stepSize: number,
        transitionTime: number,
        colorTemperatureMinimumMireds: number,
        colorTemperatureMaximumMireds: number,
    ): MaybePromise {
        const result = super.stepColorTemperatureLogic(
            stepMode,
            stepSize,
            transitionTime,
            colorTemperatureMinimumMireds,
            colorTemperatureMaximumMireds,
        );
        return MaybePromise.then(result, () =>
            this.endpoint.act(agent =>
                agent
                    .get(IoBrokerEvents)
                    .events.colorTemperatureControlled.emit(this.state.colorTemperatureMireds, transitionTime),
            ),
        );
    }

    override stopMoveStepLogic(): MaybePromise {
        const result = super.stopMoveStepLogic();
        return MaybePromise.then(result, () =>
            this.endpoint.act(agent => agent.get(IoBrokerEvents).events.colorMovementStopped.emit()),
        );
    }
}

export class EventedExtendedColorXyColorControlServer extends ExtendedColorLightRequirements.ColorControlServer {
    override moveToColorTemperatureLogic(targetMireds: number, transitionTime: number): MaybePromise {
        const result = super.moveToColorTemperatureLogic(targetMireds, transitionTime);
        return MaybePromise.then(result, () =>
            this.endpoint.act(agent =>
                agent
                    .get(IoBrokerEvents)
                    .events.colorTemperatureControlled.emit(this.state.colorTemperatureMireds, transitionTime),
            ),
        );
    }

    override moveColorTemperatureLogic(
        moveMode: ColorControl.MoveMode,
        rate: number,
        colorTemperatureMinimumMireds: number,
        colorTemperatureMaximumMireds: number,
    ): MaybePromise {
        const result = super.moveColorTemperatureLogic(
            moveMode,
            rate,
            colorTemperatureMinimumMireds,
            colorTemperatureMaximumMireds,
        );
        return MaybePromise.then(result, () =>
            this.endpoint.act(agent =>
                agent
                    .get(IoBrokerEvents)
                    .events.colorTemperatureControlled.emit(this.state.colorTemperatureMireds, undefined),
            ),
        );
    }

    override stepColorTemperatureLogic(
        stepMode: ColorControl.StepMode,
        stepSize: number,
        transitionTime: number,
        colorTemperatureMinimumMireds: number,
        colorTemperatureMaximumMireds: number,
    ): MaybePromise {
        const result = super.stepColorTemperatureLogic(
            stepMode,
            stepSize,
            transitionTime,
            colorTemperatureMinimumMireds,
            colorTemperatureMaximumMireds,
        );
        return MaybePromise.then(result, () =>
            this.endpoint.act(agent =>
                agent
                    .get(IoBrokerEvents)
                    .events.colorTemperatureControlled.emit(this.state.colorTemperatureMireds, transitionTime),
            ),
        );
    }

    override stopMoveStepLogic(): MaybePromise {
        const result = super.stopMoveStepLogic();
        return MaybePromise.then(result, () =>
            this.endpoint.act(agent => agent.get(IoBrokerEvents).events.colorMovementStopped.emit()),
        );
    }

    override moveToColorLogic(targetX: number, targetY: number, transitionTime: number): MaybePromise {
        const result = super.moveToColorLogic(targetX, targetY, transitionTime);
        return MaybePromise.then(result, () =>
            this.endpoint.act(agent =>
                agent.get(IoBrokerEvents).events.colorXyControlled.emit(this.x, this.y, transitionTime),
            ),
        );
    }

    override moveColorLogic(rateX: number, rateY: number): MaybePromise {
        const result = super.moveColorLogic(rateX, rateY);
        return MaybePromise.then(result, () =>
            this.endpoint.act(agent =>
                agent.get(IoBrokerEvents).events.colorXyControlled.emit(this.x, this.y, undefined),
            ),
        );
    }

    override stepColorLogic(stepX: number, stepY: number, transitionTime: number): MaybePromise {
        const result = super.stepColorLogic(stepX, stepY, transitionTime);
        return MaybePromise.then(result, () =>
            this.endpoint.act(agent =>
                agent.get(IoBrokerEvents).events.colorXyControlled.emit(this.x, this.y, transitionTime),
            ),
        );
    }
}

const BaseHueSaturationColorControlServer = EventedExtendedColorXyColorControlServer.with(
    ColorControl.Feature.ColorTemperature,
    ColorControl.Feature.Xy,
    ColorControl.Feature.HueSaturation,
);

export class EventedExtendedColorHueSaturationColorControlServer extends BaseHueSaturationColorControlServer {
    declare protected internal: EventedExtendedColorHueSaturationColorControlServer.Internal;

    override moveToHueLogic(
        targetHue: number,
        direction: ColorControl.Direction,
        transitionTime: number,
        isEnhancedHue: boolean,
    ): MaybePromise {
        const result = super.moveToHueLogic(targetHue, direction, transitionTime, isEnhancedHue);
        if (this.internal.blockEvents) {
            return result;
        }
        return MaybePromise.then(result, () =>
            this.endpoint.act(agent =>
                agent.get(IoBrokerEvents).events.colorHueControlled.emit(this.hue, transitionTime, isEnhancedHue),
            ),
        );
    }

    override moveHueLogic(moveMode: ColorControl.MoveMode, rate: number, isEnhancedHue: boolean): MaybePromise {
        const result = super.moveHueLogic(moveMode, rate, isEnhancedHue);
        if (this.internal.blockEvents) {
            return result;
        }
        return MaybePromise.then(result, () =>
            this.endpoint.act(agent =>
                agent.get(IoBrokerEvents).events.colorHueControlled.emit(this.hue, undefined, isEnhancedHue),
            ),
        );
    }

    override stepHueLogic(
        stepMode: ColorControl.StepMode,
        stepSize: number,
        transitionTime: number,
        isEnhancedHue: boolean,
    ): MaybePromise {
        const result = super.stepHueLogic(stepMode, stepSize, transitionTime, isEnhancedHue);
        if (this.internal.blockEvents) {
            return result;
        }
        return MaybePromise.then(result, () =>
            this.endpoint.act(agent =>
                agent.get(IoBrokerEvents).events.colorHueControlled.emit(this.hue, transitionTime, isEnhancedHue),
            ),
        );
    }

    override stopHueAndSaturationMovement(): MaybePromise {
        const result = super.stopHueAndSaturationMovement();
        return MaybePromise.then(result, () =>
            this.endpoint.act(agent => agent.get(IoBrokerEvents).events.colorHueAndSaturationMovementStopped.emit()),
        );
    }

    override moveToSaturationLogic(targetSaturation: number, transitionTime: number): MaybePromise {
        const result = super.moveToSaturationLogic(targetSaturation, transitionTime);
        if (this.internal.blockEvents) {
            return result;
        }
        return MaybePromise.then(result, () =>
            this.endpoint.act(agent =>
                agent.get(IoBrokerEvents).events.colorSaturationControlled.emit(this.saturation, transitionTime),
            ),
        );
    }

    override moveSaturationLogic(moveMode: ColorControl.MoveMode, rate: number): MaybePromise {
        const result = super.moveSaturationLogic(moveMode, rate);
        if (this.internal.blockEvents) {
            return result;
        }
        return MaybePromise.then(result, () =>
            this.endpoint.act(agent =>
                agent.get(IoBrokerEvents).events.colorSaturationControlled.emit(this.saturation, undefined),
            ),
        );
    }

    override stepSaturationLogic(
        stepMode: ColorControl.StepMode,
        stepSize: number,
        transitionTime: number,
    ): MaybePromise {
        const result = super.stepSaturationLogic(stepMode, stepSize, transitionTime);
        if (this.internal.blockEvents) {
            return result;
        }
        return MaybePromise.then(result, () =>
            this.endpoint.act(agent =>
                agent.get(IoBrokerEvents).events.colorSaturationControlled.emit(this.saturation, transitionTime),
            ),
        );
    }

    override moveToHueAndSaturationLogic(
        targetHue: number,
        targetSaturation: number,
        transitionTime: number,
    ): MaybePromise {
        this.internal.blockEvents = true;
        const result = super.moveToHueAndSaturationLogic(targetHue, targetSaturation, transitionTime);
        this.internal.blockEvents = false;
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
        blockEvents: boolean = false;
    }
}
