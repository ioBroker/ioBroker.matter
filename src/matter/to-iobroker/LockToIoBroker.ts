import ChannelDetector from '@iobroker/type-detector';
import { DoorLock } from '@matter/main/clusters';
import { Endpoint } from '@project-chip/matter.js/device';
import { GenericDevice } from '../../lib';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import { DetectedDevice, DeviceOptions } from '../../lib/devices/GenericDevice';
import Lock from '../../lib/devices/Lock';
import { GenericElectricityDataDeviceToIoBroker } from './GenericElectricityDataDeviceToIoBroker';

/** Mapping Logic to map a ioBroker Light device to a Matter OnOffLightDevice. */
export class LockToIoBroker extends GenericElectricityDataDeviceToIoBroker {
    readonly #ioBrokerDevice: Lock;
    readonly #unboltingSupported: boolean;

    constructor(endpoint: Endpoint, rootEndpoint: Endpoint, adapter: ioBroker.Adapter, endpointDeviceBaseId: string) {
        super(endpoint, rootEndpoint, endpointDeviceBaseId);

        this.#unboltingSupported =
            this.appEndpoint.getClusterClient(DoorLock.Complete)?.supportedFeatures.unbolting ?? false;
        // TODO: support more featuresets
        this.#ioBrokerDevice = new Lock(
            { ...ChannelDetector.getPatterns().lock, isIoBrokerDevice: false } as DetectedDevice,
            adapter,
            this.enableDeviceTypeStates(),
        );
    }

    protected enableDeviceTypeStates(): DeviceOptions {
        this.enableDeviceTypeState(PropertyType.Power, {
            endpointId: this.appEndpoint.getNumber(),
            clusterId: DoorLock.Cluster.id,
            attributeName: 'lockState',
            changeHandler: async value => {
                if (value) {
                    if (this.#unboltingSupported) {
                        await this.appEndpoint.getClusterClient(DoorLock.Complete)?.unboltDoor({});
                    } else {
                        await this.appEndpoint.getClusterClient(DoorLock.Complete)?.unlockDoor({});
                    }
                } else {
                    await this.appEndpoint.getClusterClient(DoorLock.Complete)?.lockDoor({});
                }
            },
        });
        this.enableDeviceTypeState(PropertyType.PowerActual, {
            endpointId: this.appEndpoint.getNumber(),
            clusterId: DoorLock.Cluster.id,
            attributeName: 'doorState',
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