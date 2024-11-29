import { MaybePromise } from '@matter/main';
import type { TypeFromPartialBitSchema } from '@matter/main/types';
import { DimmableLightRequirements } from '@matter/main/devices';
import type { LevelControl } from '@matter/main/clusters';
import { IoBrokerEvents } from './IoBrokerEvents';

export class EventedLightingLevelControlServer extends DimmableLightRequirements.LevelControlServer {
    override setLevel(
        level: number,
        withOnOff: boolean,
        options: TypeFromPartialBitSchema<typeof LevelControl.Options> = {},
    ): MaybePromise<void> {
        const result = super.setLevel(level, withOnOff, options);
        return MaybePromise.then(result, () =>
            this.endpoint.act(agent => agent.get(IoBrokerEvents).events.dimmerLevelControlled.emit(level)),
        );
    }
}
