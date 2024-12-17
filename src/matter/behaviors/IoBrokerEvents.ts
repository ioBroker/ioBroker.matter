import { Behavior, Observable } from '@matter/main';
import type { DoorLock } from '@matter/main/clusters';

export class IoBrokerEvents extends Behavior {
    static override readonly id = 'ioBrokerEvents';

    declare events: IoBrokerEvents.Events;
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace IoBrokerEvents {
    export class Events extends Behavior.Events {
        onOffControlled = new Observable<[boolean]>();
        dimmerLevelControlled = new Observable<[level: number, transitionTime?: number | null]>();
        colorTemperatureControlled = new Observable<[colorTemperatureMireds: number, transitionTime?: number | null]>();
        doorLockStateControlled = new Observable<[DoorLock.LockState]>();
    }
}
