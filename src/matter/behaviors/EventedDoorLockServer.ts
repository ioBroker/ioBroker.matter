import { AsyncObservable, type MaybePromise } from '@matter/main';
import type { DoorLockBaseServer } from '@matter/main/behaviors';
import { DoorLockRequirements } from '@matter/main/devices';

/**
 * Drives the ioBroker lock from matter.js `handleLockOperation()`. matter.js calls it before `lockState` changes, for
 * authorized remote operations and for auto-relock (source Auto, no authorization). The event is awaited, so a
 * listener that throws fails the command with FAILURE and leaves `lockState` unchanged.
 */
export class EventedDoorLockServer extends DoorLockRequirements.DoorLockServer {
    declare events: EventedDoorLockServer.Events;

    override handleLockOperation(operation: DoorLockBaseServer.LockOperation): MaybePromise {
        return this.events.lockActuationRequested.emit(operation.actuation);
    }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace EventedDoorLockServer {
    export class Events extends DoorLockRequirements.DoorLockServer.Events {
        lockActuationRequested = AsyncObservable<[actuation: DoorLockBaseServer.Actuation]>();
    }
}
