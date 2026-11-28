import { WindowCoveringRequirements } from '@matter/main/devices';
import { type MovementType, type MovementDirection, WindowCoveringBaseServer } from '@matter/main/behaviors';
import type { MaybePromise } from '@matter/main';
import { IoBrokerEvents } from './IoBrokerEvents';

/**
 * WindowCovering server that hands movements to ioBroker instead of moving a simulated device.
 *
 * The matter.js handling of OperationalStatus, of the CurrentPosition...Percentage attributes and of the target on
 * StopMotion is disabled: `BlindsToMatter` writes all of them from the ioBroker states, see `WindowCoveringMovement`.
 * The commands still set the target positions. The events are emitted after the command transaction is finalized, so
 * their handlers read the target the command set.
 */
export class EventedWindowCoveringServer extends WindowCoveringRequirements.WindowCoveringServer {
    override handleMovement(
        type: MovementType,
        reversed: boolean,
        direction: MovementDirection,
        targetPercent100ths?: number,
    ): MaybePromise<void> {
        this.context.transaction.onFinalize(() =>
            this.endpoint.act(agent =>
                agent
                    .get(IoBrokerEvents)
                    .events.windowCoveringTriggerMovement.emit(type, reversed, direction, targetPercent100ths),
            ),
        );
    }

    override handleStopMovement(): MaybePromise {
        this.context.transaction.onFinalize(() =>
            this.endpoint.act(agent => agent.get(IoBrokerEvents).events.windowCoveringStopMovement.emit()),
        );
    }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace EventedWindowCoveringServer {
    export class Internal extends WindowCoveringBaseServer.Internal {
        override disableOperationalModeHandling = true;
    }
}
