import { MaybePromise } from '@matter/main';
import { ColorTemperatureLightRequirements } from '@matter/main/devices';
import { IoBrokerEvents } from './IoBrokerEvents';
import type { ColorControl } from '@matter/main/clusters';

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
                agent.get(IoBrokerEvents).events.colorTemperatureControlled.emit(this.state.colorTemperatureMireds),
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
}
