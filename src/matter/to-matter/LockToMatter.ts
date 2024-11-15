import { Endpoint } from '@matter/main';
import { DoorLock } from '@matter/main/clusters';
import { DoorLockDevice } from '@matter/main/devices';
import type { GenericDevice } from '../../lib';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type Lock from '../../lib/devices/Lock';
import type { IdentifyOptions } from './GenericDeviceToMatter';
import { GenericElectricityDataDeviceToMatter } from './GenericElectricityDataDeviceToMatter';
import { initializeMaintenanceStateHandlers } from './SharedStateHandlers';

/** Mapping Logic to map a ioBroker Light device to a Matter OnOffLightDevice. */
export class LockToMatter extends GenericElectricityDataDeviceToMatter {
    readonly #ioBrokerDevice: Lock;
    readonly #matterEndpoint: Endpoint<DoorLockDevice>;

    constructor(ioBrokerDevice: GenericDevice, name: string, uuid: string) {
        super(name, uuid);

        this.#matterEndpoint = new Endpoint(DoorLockDevice, { id: uuid });
        this.#ioBrokerDevice = ioBrokerDevice as Lock;
    }

    // Just change the power state every second
    async doIdentify(_identifyOptions: IdentifyOptions): Promise<void> {
        // TODO
    }

    // Restore the given initial state after the identity process is over
    async resetIdentify(_identifyOptions: IdentifyOptions): Promise<void> {
        // TODO
    }

    getMatterEndpoints(): Endpoint[] {
        return [this.#matterEndpoint];
    }

    get ioBrokerDevice(): GenericDevice {
        return this.#ioBrokerDevice;
    }

    registerMatterHandlers(): void {
        // install matter listeners
        // here we can react on changes from the matter side for onOff
        this.#matterEndpoint.events.doorLock.lockState$Changed.on(async state => {
            const currentState = this.#ioBrokerDevice.getLockState()
                ? DoorLock.LockState.Locked
                : DoorLock.LockState.Unlocked;
            switch (state) {
                case null:
                    return;
                case DoorLock.LockState.NotFullyLocked:
                    // NotFullyLocked is not a valid state for a lock, ignore it
                    return;
                case DoorLock.LockState.Unlatched:
                    if (this.ioBrokerDevice.propertyNames.includes(PropertyType.Open)) {
                        await this.#ioBrokerDevice.setOpen();
                    } else {
                        // Adjust state to get it handled by default logic
                        state = DoorLock.LockState.Unlocked;
                        if (state !== currentState) {
                            await this.#ioBrokerDevice.setLockState(state === DoorLock.LockState.Unlocked);
                        }
                    }
                    break;
                default:
                    if (state !== currentState) {
                        await this.#ioBrokerDevice.setLockState(state === DoorLock.LockState.Unlocked);
                    }
                    break;
            }
        });
    }

    async registerIoBrokerHandlersAndInitialize(): Promise<void> {
        // install ioBroker listeners
        // here we react on changes from the ioBroker side for onOff and current lamp level
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

        // init current state from ioBroker side
        await this.#matterEndpoint.set({
            doorLock: {
                lockState: this.#ioBrokerDevice.getLockState()
                    ? DoorLock.LockState.Unlocked
                    : DoorLock.LockState.Locked,
            },
        });

        await initializeMaintenanceStateHandlers(this.#matterEndpoint, this.#ioBrokerDevice);
    }
}
