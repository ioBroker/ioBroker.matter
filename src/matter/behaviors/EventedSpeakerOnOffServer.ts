import { type MaybePromise } from '@matter/main';
import { SpeakerRequirements } from '@matter/main/devices';
import { IoBrokerEvents } from './IoBrokerEvents';

export class EventedSpeakerOnOffServer extends SpeakerRequirements.OnOffServer {
    override on(): MaybePromise<void> {
        this.endpoint.act(agent => agent.get(IoBrokerEvents).events.onOffControlled.emit(true));
        return super.on();
    }

    override off(): MaybePromise<void> {
        this.endpoint.act(agent => agent.get(IoBrokerEvents).events.onOffControlled.emit(false));
        return super.off();
    }
}
