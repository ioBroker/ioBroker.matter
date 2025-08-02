import { WindowCoveringRequirements } from '@matter/main/devices';
import type { MovementType, MovementDirection } from '@matter/main/behaviors';
import type { MaybePromise } from '@matter/main';
import { IoBrokerEvents } from './IoBrokerEvents';

export class EventedWindowCoveringServer extends WindowCoveringRequirements.WindowCoveringServer {
    override handleMovement(
        type: MovementType,
        reversed: boolean,
        direction: MovementDirection,
        targetPercent100ths?: number,
    ): MaybePromise<void> {
        this.endpoint.act(agent =>
            agent
                .get(IoBrokerEvents)
                .events.windowCoveringTriggerMovement.emit(type, reversed, direction, targetPercent100ths),
        );
        return super.handleMovement(type, reversed, direction, targetPercent100ths);
    }

    override handleStopMovement(): MaybePromise {
        this.endpoint.act(agent => agent.get(IoBrokerEvents).events.windowCoveringStopMovement.emit());
        return super.handleStopMovement();
    }
}
