import ChannelDetector from '@iobroker/type-detector';
import { DoorLock } from '@matter/main/clusters';
import type { Endpoint, PairedNode } from '@project-chip/matter.js/device';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { DetectedDevice, DeviceOptions } from '../../lib/devices/GenericDevice';
import { Lock } from '../../lib/devices/Lock';
import { GenericElectricityDataDeviceToIoBroker } from './GenericElectricityDataDeviceToIoBroker';

export class DoorLockToIoBroker extends GenericElectricityDataDeviceToIoBroker {
    readonly #ioBrokerDevice: Lock;
    readonly #unboltingSupported: boolean;

    constructor(
        node: PairedNode,
        endpoint: Endpoint,
        rootEndpoint: Endpoint,
        adapter: ioBroker.Adapter,
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
        );

        this.#unboltingSupported =
            this.appEndpoint.getClusterClient(DoorLock.Complete)?.supportedFeatures.unbolting ?? false;
        this.#ioBrokerDevice = new Lock(
            { ...ChannelDetector.getPatterns().lock, isIoBrokerDevice: false } as DetectedDevice,
            adapter,
            this.enableDeviceTypeStates(),
        );
    }

    protected enableDeviceTypeStates(): DeviceOptions {
        this.enableDeviceTypeStateForAttribute(PropertyType.LockState, {
            endpointId: this.appEndpoint.getNumber(),
            clusterId: DoorLock.Cluster.id,
            attributeName: 'lockState',
            changeHandler: async value => {
                if (value) {
                    // Unlock
                    if (this.#unboltingSupported) {
                        await this.appEndpoint.getClusterClient(DoorLock.Complete)?.unboltDoor({});
                    } else {
                        await this.appEndpoint.getClusterClient(DoorLock.Complete)?.unlockDoor({});
                    }
                } else {
                    // Lock
                    await this.appEndpoint.getClusterClient(DoorLock.Complete)?.lockDoor({});
                }
            },
            convertValue: value => value === DoorLock.LockState.Unlocked,
        });
        this.enableDeviceTypeStateForAttribute(PropertyType.LockStateActual, {
            endpointId: this.appEndpoint.getNumber(),
            clusterId: DoorLock.Cluster.id,
            attributeName: 'lockState',
            convertValue: (state: DoorLock.LockState | null) => state === DoorLock.LockState.Unlocked,
        });
        this.enableDeviceTypeStateForAttribute(PropertyType.Open, {
            changeHandler: async () => {
                await this.appEndpoint.getClusterClient(DoorLock.Complete)?.unlockDoor({});
            },
        });
        this.enableDeviceTypeStateForAttribute(PropertyType.DoorState, {
            endpointId: this.appEndpoint.getNumber(),
            clusterId: DoorLock.Cluster.id,
            attributeName: 'doorState',
            convertValue: (state: DoorLock.DoorState | null) =>
                state === DoorLock.DoorState.DoorOpen || state === DoorLock.DoorState.DoorForcedOpen,
        });
        return super.enableDeviceTypeStates();
    }

    get ioBrokerDevice(): Lock {
        return this.#ioBrokerDevice;
    }
}
