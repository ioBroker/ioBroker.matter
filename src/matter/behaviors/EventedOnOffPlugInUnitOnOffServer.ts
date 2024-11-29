import { type MaybePromise } from '@matter/main';
import { OnOffPlugInUnitRequirements } from '@matter/main/devices';
import { IoBrokerEvents } from './IoBrokerEvents';

export class EventedOnOffPlugInUnitOnOffServer extends OnOffPlugInUnitRequirements.OnOffServer {
    override on(): MaybePromise<void> {
        this.endpoint.act(agent => agent.get(IoBrokerEvents).events.onOffControlled.emit(true));
        return super.on();
    }

    override off(): MaybePromise<void> {
        this.endpoint.act(agent => agent.get(IoBrokerEvents).events.onOffControlled.emit(false));
        return super.off();
    }
}
