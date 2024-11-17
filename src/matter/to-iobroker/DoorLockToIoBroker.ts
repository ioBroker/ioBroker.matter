import ChannelDetector from '@iobroker/type-detector';
import { DoorLock } from '@matter/main/clusters';
import type { Endpoint, PairedNode } from '@project-chip/matter.js/device';
import type { GenericDevice } from '../../lib';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { DetectedDevice, DeviceOptions } from '../../lib/devices/GenericDevice';
import Lock from '../../lib/devices/Lock';
import { GenericElectricityDataDeviceToIoBroker } from './GenericElectricityDataDeviceToIoBroker';

/** Mapping Logic to map a ioBroker Light device to a Matter OnOffLightDevice. */
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
    ) {
        super(adapter, node, endpoint, rootEndpoint, endpointDeviceBaseId, deviceTypeName, defaultConnectionStateId);

        this.#unboltingSupported =
            this.appEndpoint.getClusterClient(DoorLock.Complete)?.supportedFeatures.unbolting ?? false;
        // TODO: support more featuresets?
        this.#ioBrokerDevice = new Lock(
            { ...ChannelDetector.getPatterns().lock, isIoBrokerDevice: false } as DetectedDevice,
            adapter,
            this.enableDeviceTypeStates(),
        );
    }

    protected enableDeviceTypeStates(): DeviceOptions {
        this.enableDeviceTypeState(PropertyType.LockState, {
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
        this.enableDeviceTypeState(PropertyType.LockStateActual, {
            endpointId: this.appEndpoint.getNumber(),
            clusterId: DoorLock.Cluster.id,
            attributeName: 'lockState',
            convertValue: value => value === DoorLock.LockState.Unlocked,
        });
        if (this.#unboltingSupported) {
            this.enableDeviceTypeState(PropertyType.Open, {
                changeHandler: async () => {
                    await this.appEndpoint.getClusterClient(DoorLock.Complete)?.unlockDoor({});
                },
            });
        }
        return super.enableDeviceTypeStates();
    }

    get ioBrokerDevice(): GenericDevice {
        return this.#ioBrokerDevice;
    }
}
