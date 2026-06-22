import ChannelDetector from '@iobroker/type-detector';
import { DoorLock } from '@matter/main/clusters';
import { DoorLockClient } from '@matter/main/behaviors';
import type { Endpoint } from '@matter/main';
import type { PairedNode } from '@project-chip/matter.js/device';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { DetectedDevice, DeviceOptions } from '../../lib/devices/GenericDevice';
import { Lock } from '../../lib/devices/Lock';
import { GenericElectricityDataDeviceToIoBroker } from './GenericElectricityDataDeviceToIoBroker';
import type { MatterAdapter } from '../../main';
import { DoorLockCustomStates, type DoorLockCustomStatesType } from './custom-states';

export class DoorLockToIoBroker extends GenericElectricityDataDeviceToIoBroker<DoorLockCustomStatesType> {
    readonly #ioBrokerDevice: Lock;
    readonly #unboltingSupported: boolean;

    constructor(
        node: PairedNode,
        endpoint: Endpoint,
        rootEndpoint: Endpoint,
        adapter: MatterAdapter,
        endpointDeviceBaseId: string,
        deviceTypeName: string,
        defaultConnectionStateId: string,
        defaultName: string,
    ) {
        super(
            adapter,
            node,
            endpoint,
            rootEndpoint,
            endpointDeviceBaseId,
            deviceTypeName,
            defaultConnectionStateId,
            defaultName,
            DoorLockCustomStates,
        );

        this.#unboltingSupported = !!this.appEndpoint.behaviors.typeFor(DoorLockClient)?.features.unbolting;
        this.#ioBrokerDevice = new Lock(
            { ...ChannelDetector.getPatterns().lock, isIoBrokerDevice: false } as DetectedDevice,
            adapter,
            this.enableDeviceTypeStates(),
            DoorLockCustomStates,
        );
    }

    protected enableDeviceTypeStates(): DeviceOptions {
        // Enable custom states for the DoorLock cluster
        this.#enableCustomStates();

        this.enableDeviceTypeStateForAttribute(PropertyType.LockState, {
            endpointId: this.appEndpoint.number,
            clusterId: DoorLock.id,
            attributeName: 'lockState',
            changeHandler: async value => {
                if (value) {
                    // Unlock
                    if (this.#unboltingSupported) {
                        await this.appEndpoint.commandsOf(DoorLockClient)?.unboltDoor({});
                    } else {
                        await this.appEndpoint.commandsOf(DoorLockClient)?.unlockDoor({});
                    }
                } else {
                    // Lock
                    await this.appEndpoint.commandsOf(DoorLockClient)?.lockDoor({});
                }
            },
            convertValue: value => value === DoorLock.LockState.Unlocked,
        });
        this.enableDeviceTypeStateForAttribute(PropertyType.LockStateActual, {
            endpointId: this.appEndpoint.number,
            clusterId: DoorLock.id,
            attributeName: 'lockState',
            convertValue: (state: DoorLock.LockState | null) => state === DoorLock.LockState.Unlocked,
        });
        this.enableDeviceTypeStateForAttribute(PropertyType.Open, {
            changeHandler: async () => {
                await this.appEndpoint.commandsOf(DoorLockClient)?.unlockDoor({});
            },
        });
        this.enableDeviceTypeStateForAttribute(PropertyType.DoorState, {
            endpointId: this.appEndpoint.number,
            clusterId: DoorLock.id,
            attributeName: 'doorState',
            convertValue: (state: DoorLock.DoorState | null) =>
                state === DoorLock.DoorState.DoorOpen || state === DoorLock.DoorState.DoorForcedOpen,
        });
        return super.enableDeviceTypeStates();
    }

    /**
     * Enable custom states for DoorLock cluster attributes.
     */
    #enableCustomStates(): void {
        const endpointId = this.appEndpoint.number;

        // Auto Relock Time - writable attribute
        this.enableCustomStateForAttribute('autoRelockTime', {
            endpointId,
            clusterId: DoorLock.id,
            attributeName: 'autoRelockTime',
            changeHandler: async (autoRelockTime: number) => {
                await this.appEndpoint.setStateOf(DoorLockClient, {
                    autoRelockTime,
                });
            },
        });
    }

    get ioBrokerDevice(): Lock {
        return this.#ioBrokerDevice;
    }
}
