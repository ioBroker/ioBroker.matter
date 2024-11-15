import ChannelDetector from '@iobroker/type-detector';
import type { Endpoint } from '@project-chip/matter.js/device';
import type { GenericDevice } from '../../lib';
import type ElectricityDataDevice from '../../lib/devices/ElectricityDataDevice';
import type { DetectedDevice } from '../../lib/devices/GenericDevice';
import Socket from '../../lib/devices/Socket';
import { GenericElectricityDataDeviceToIoBroker } from './GenericElectricityDataDeviceToIoBroker';

/** Mapping Logic to map a ioBroker Light device to a Matter OnOffLightDevice. */
export class UtilityOnlyToIoBroker extends GenericElectricityDataDeviceToIoBroker {
    readonly #ioBrokerDevice: ElectricityDataDevice;

    constructor(
        endpoint: Endpoint,
        rootEndpoint: Endpoint,
        adapter: ioBroker.Adapter,
        endpointDeviceBaseId: string,
        deviceTypeName: string,
    ) {
        super(adapter, endpoint, rootEndpoint, endpointDeviceBaseId, deviceTypeName);

        this.#ioBrokerDevice = new Socket(
            // TODO: Change to something generic like ElectricityDataDevice that we need to define first
            { ...ChannelDetector.getPatterns().socket, isIoBrokerDevice: false } as DetectedDevice,
            adapter,
            this.enableDeviceTypeStates(),
        );
    }

    get ioBrokerDevice(): GenericDevice {
        return this.#ioBrokerDevice;
    }
}
