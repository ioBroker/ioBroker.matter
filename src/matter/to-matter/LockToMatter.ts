import { Endpoint } from '@matter/main';
import { DoorLock } from '@matter/main/clusters';
import { DoorLockDevice } from '@matter/main/devices';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { Lock } from '../../lib/devices/Lock';
import type { IdentifyOptions } from './GenericDeviceToMatter';
import { GenericElectricityDataDeviceToMatter } from './GenericElectricityDataDeviceToMatter';
import { IoBrokerEvents } from '../behaviors/IoBrokerEvents';
import { EventedDoorLockServer } from '../behaviors/EventedDoorLockServer';

const IoBrokerDoorLockDevice = DoorLockDevice.with(EventedDoorLockServer, IoBrokerEvents);
type IoBrokerDoorLockDevice = typeof IoBrokerDoorLockDevice;

// TODO Add Latching support when "Open" is there!

/** Mapping Logic to map a ioBroker Light device to a Matter OnOffLightDevice. */
export class LockToMatter extends GenericElectricityDataDeviceToMatter {
    readonly #ioBrokerDevice: Lock;
    readonly #matterEndpoint: Endpoint<IoBrokerDoorLockDevice>;

    constructor(ioBrokerDevice: Lock, name: string, uuid: string) {
        super(name, uuid);

        this.#matterEndpoint = new Endpoint(IoBrokerDoorLockDevice, {
            id: uuid,
            doorLock: {
                lockType: DoorLock.LockType.Other,
                actuatorEnabled: true,
                lockState: DoorLock.LockState.Locked, // Will be corrected later
            },
        });
        this.#ioBrokerDevice = ioBrokerDevice;
    }

    // Just change the power state every second
    async doIdentify(_identifyOptions: IdentifyOptions): Promise<void> {
        // TODO
    }

    // Restore the given initial state after the identity process is over
    async resetIdentify(_identifyOptions: IdentifyOptions): Promise<void> {
        // TODO
    }

    get matterEndpoints(): Endpoint[] {
        return [this.#matterEndpoint];
    }

    get ioBrokerDevice(): Lock {
        return this.#ioBrokerDevice;
    }

    async registerHandlersAndInitialize(): Promise<void> {
        await super.registerHandlersAndInitialize();

        // init current state from ioBroker side
        await this.#matterEndpoint.set({
            doorLock: {
                lockState: this.#ioBrokerDevice.getLockState()
                    ? DoorLock.LockState.Unlocked
                    : DoorLock.LockState.Locked,
            },
        });

        this.matterEvents.on(this.#matterEndpoint.events.ioBrokerEvents.doorLockStateControlled, async state => {
            switch (state) {
                case null:
                    return;
                case DoorLock.LockState.NotFullyLocked:
                    // NotFullyLocked is not a valid state for a lock, ignore it
                    return;
                case DoorLock.LockState.Unlatched:
                    if (this.ioBrokerDevice.hasOpen()) {
                        await this.#ioBrokerDevice.setOpen();
                    } else {
                        await this.#ioBrokerDevice.setLockState(true); // Unlocked
                    }
                    break;
                default:
                    await this.#ioBrokerDevice.setLockState(state === DoorLock.LockState.Unlocked);
                    break;
            }
        });

        this.#ioBrokerDevice.onChange(async event => {
            switch (event.property) {
                case PropertyType.LockState:
                case PropertyType.LockStateActual:
                    await this.#matterEndpoint.set({
                        doorLock: {
                            lockState: event.value ? DoorLock.LockState.Unlocked : DoorLock.LockState.Locked,
                        },
                    });
                    break;
            }
        });
    }
}
