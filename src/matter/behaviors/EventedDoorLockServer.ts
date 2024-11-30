import { DoorLockRequirements } from '@matter/main/devices';
import { DoorLock } from '@matter/main/clusters';
import { IoBrokerEvents } from './IoBrokerEvents';

export class EventedDoorLockServer extends DoorLockRequirements.DoorLockServer {
    override lockDoor(): void {
        this.endpoint.act(agent =>
            agent.get(IoBrokerEvents).events.doorLockStateControlled.emit(DoorLock.LockState.Locked),
        );
        super.lockDoor();
    }

    override unlockDoor(): void {
        this.endpoint.act(agent =>
            agent.get(IoBrokerEvents).events.doorLockStateControlled.emit(DoorLock.LockState.Unlocked),
        );
        super.unlockDoor();
    }
}
