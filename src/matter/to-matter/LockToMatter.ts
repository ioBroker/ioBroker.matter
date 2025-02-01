import { Endpoint } from '@matter/main';
import { DoorLock } from '@matter/main/clusters';
import { DoorLockDevice } from '@matter/main/devices';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { Lock } from '../../lib/devices/Lock';
import { GenericElectricityDataDeviceToMatter } from './GenericElectricityDataDeviceToMatter';
import { IoBrokerEvents } from '../behaviors/IoBrokerEvents';
import { EventedDoorLockServer } from '../behaviors/EventedDoorLockServer';
import { IoIdentifyServer } from '../behaviors/IdentifyServer';
import { IoBrokerContext } from '../behaviors/IoBrokerContext';

const IoBrokerDoorLockDevice = DoorLockDevice.with(
    EventedDoorLockServer,
    IoBrokerEvents,
    IoIdentifyServer,
    IoBrokerContext,
);
type IoBrokerDoorLockDevice = typeof IoBrokerDoorLockDevice;

//const DoorPositionDoorLockServer = EventedDoorLockServer.with(DoorLock.Feature.DoorPositionSensor);
//const UnboltingDoorLockServer = EventedDoorLockServer.with(DoorLock.Feature.Unbolting);

/** Mapping Logic to map a ioBroker Light device to a Matter OnOffLightDevice. */
export class LockToMatter extends GenericElectricityDataDeviceToMatter {
    readonly #ioBrokerDevice: Lock;
    readonly #matterEndpoint: Endpoint<IoBrokerDoorLockDevice>;

    constructor(ioBrokerDevice: Lock, name: string, uuid: string) {
        super(name, uuid);

        this.#ioBrokerDevice = ioBrokerDevice;

        const features = new Array<DoorLock.Feature>();

        if (this.#ioBrokerDevice.hasOpen()) {
            features.push(DoorLock.Feature.Unbolting);
        }
        if (this.#ioBrokerDevice.hasDoorState()) {
            features.push(DoorLock.Feature.DoorPositionSensor);
        }

        this.#matterEndpoint = new Endpoint(IoBrokerDoorLockDevice.with(EventedDoorLockServer.with(...features)), {
            id: uuid,
            ioBrokerContext: {
                device: ioBrokerDevice,
                adapter: ioBrokerDevice.adapter,
            },
            doorLock: {
                lockType: DoorLock.LockType.Other,
                actuatorEnabled: true,
                lockState: DoorLock.LockState.Locked, // Will be corrected later
                // @ts-expect-error Simplify state setting because of dynamic features
                doorState: this.#ioBrokerDevice.hasDoorState() ? DoorLock.DoorState.DoorClosed : undefined,
            },
        });
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
        if (this.#ioBrokerDevice.hasDoorState()) {
            await this.#matterEndpoint.setStateOf(EventedDoorLockServer, {
                // @ts-expect-error Workaround a matter.js instancing/typing error
                doorState: this.#ioBrokerDevice.getDoorState()
                    ? DoorLock.DoorState.DoorOpen
                    : DoorLock.DoorState.DoorClosed,
            });
        }

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
                case PropertyType.DoorState:
                    await this.#matterEndpoint.setStateOf(EventedDoorLockServer, {
                        // @ts-expect-error Workaround a matter.js instancing/typing error
                        doorState: event.value ? DoorLock.DoorState.DoorOpen : DoorLock.DoorState.DoorClosed,
                    });
                    break;
            }
        });
    }
}
