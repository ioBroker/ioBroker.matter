import ChannelDetector from '@iobroker/type-detector';
import { OnOff } from '@matter/main/clusters';
import { Endpoint } from '@project-chip/matter.js/device';
import { GenericDevice } from '../../lib';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import { DetectedDevice, DeviceOptions } from '../../lib/devices/GenericDevice';
import Socket from '../../lib/devices/Socket';
import { GenericElectricityDataDeviceToIoBroker } from './GenericElectricityDataDeviceToIoBroker';

/** Mapping Logic to map a ioBroker Socket device to a Matter OnOffPlugInUnitDevice. */
export class SocketToIoBroker extends GenericElectricityDataDeviceToIoBroker {
    readonly #ioBrokerDevice: Socket;

    constructor(endpoint: Endpoint, rootEndpoint: Endpoint, adapter: ioBroker.Adapter, endpointDeviceBaseId: string) {
        super(endpoint, rootEndpoint, endpointDeviceBaseId);

        this.#ioBrokerDevice = new Socket(
            { ...ChannelDetector.getPatterns().socket, isIoBrokerDevice: false } as DetectedDevice,
            adapter,
            this.enableDeviceTypeStates(),
        );
    }

    protected enableDeviceTypeStates(): DeviceOptions {
        this.enableDeviceTypeState(PropertyType.Power, {
            endpointId: this.appEndpoint.getNumber(),
            clusterId: OnOff.Cluster.id,
            attributeName: 'onOff',
            changeHandler: async value => {
                if (value) {
                    await this.appEndpoint.getClusterClient(OnOff.Complete)?.on();
                } else {
                    await this.appEndpoint.getClusterClient(OnOff.Complete)?.off();
                }
            },
        });
        this.enableDeviceTypeState(PropertyType.PowerActual, {
            endpointId: this.appEndpoint.getNumber(),
            clusterId: OnOff.Cluster.id,
            attributeName: 'onOff',
        });
        return super.enableDeviceTypeStates();
    }

    get ioBrokerDevice(): GenericDevice {
        return this.#ioBrokerDevice;
    }
}
