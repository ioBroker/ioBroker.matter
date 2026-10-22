import { Endpoint, InternalError } from '@matter/main';
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

/** Mapping Logic to map a ioBroker Lock device to a Matter DoorLockDevice. */
export class LockToMatter extends GenericElectricityDataDeviceToMatter {
    readonly #ioBrokerDevice: Lock;
    readonly #matterEndpoint: Endpoint<IoBrokerDoorLockDevice>;
    readonly #DoorLockServer;

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

        this.#DoorLockServer = EventedDoorLockServer.with(...features);
        this.#matterEndpoint = new Endpoint(IoBrokerDoorLockDevice.with(this.#DoorLockServer), {
            id: uuid,
            ioBrokerContext: {
                device: ioBrokerDevice,
                adapter: ioBrokerDevice.adapter,
            },
            doorLock: {
                lockType: DoorLock.LockType.Other,
                actuatorEnabled: true,
                lockState: DoorLock.LockState.Locked, // Will be corrected later
                doorState: this.#ioBrokerDevice.hasDoorState() ? DoorLock.DoorState.DoorClosed : undefined,
                operatingMode: DoorLock.OperatingMode.Normal,
                supportedOperatingModes: {
                    normal: false,
                    vacation: true,
                    privacy: true,
                    passage: true,
                    alwaysSet: 2047,
                },
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
            await this.#matterEndpoint.setStateOf(this.#DoorLockServer, {
                doorState: this.#ioBrokerDevice.getDoorState()
                    ? DoorLock.DoorState.DoorOpen
                    : DoorLock.DoorState.DoorClosed,
            });
        }

        this.matterEvents.on(
            this.#matterEndpoint.eventsOf(EventedDoorLockServer).lockActuationRequested,
            async actuation => {
                switch (actuation) {
                    case 'lock':
                        await this.#ioBrokerDevice.setLockState(false);
                        break;
                    case 'unbolt':
                        await this.#ioBrokerDevice.setLockState(true);
                        break;
                    case 'unlock':
                        await this.#ioBrokerDevice.setLockState(true);
                        // With Unbolting, UnlockDoor also pulls the latch (Matter 1.6.1 § 5.2.4.11)
                        if (this.#ioBrokerDevice.hasOpen()) {
                            await this.#ioBrokerDevice.setOpen();
                        }
                        break;
                    default: {
                        // A new matter.js actuation must fail the command, not report success without moving the lock
                        const unsupported: never = actuation;
                        throw new InternalError(`Unsupported lock actuation "${String(unsupported)}"`);
                    }
                }
            },
        );

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
                    await this.#matterEndpoint.setStateOf(this.#DoorLockServer, {
                        doorState: event.value ? DoorLock.DoorState.DoorOpen : DoorLock.DoorState.DoorClosed,
                    });
                    break;
            }
        });
    }
}
