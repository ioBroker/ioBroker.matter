import ChannelDetector from '@iobroker/type-detector';
import { OccupancySensing } from '@matter/main/clusters';
import { TypeFromBitSchema } from '@matter/main/types';
import { Endpoint } from '@project-chip/matter.js/device';
import { GenericDevice } from '../../lib';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import { DetectedDevice, DeviceOptions } from '../../lib/devices/GenericDevice';
import Motion from '../../lib/devices/Motion';
import { GenericDeviceToIoBroker } from './GenericDeviceToIoBroker';

/** Mapping Logic to map a ioBroker Light device to a Matter OnOffLightDevice. */
export class OccupancyToIoBroker extends GenericDeviceToIoBroker {
    readonly #ioBrokerDevice: Motion;

    constructor(
        endpoint: Endpoint,
        rootEndpoint: Endpoint,
        adapter: ioBroker.Adapter,
        endpointDeviceBaseId: string,
        deviceTypeName: string,
    ) {
        super(adapter, endpoint, rootEndpoint, endpointDeviceBaseId, deviceTypeName);

        this.#ioBrokerDevice = new Motion(
            { ...ChannelDetector.getPatterns().motion, isIoBrokerDevice: false } as DetectedDevice,
            adapter,
            this.enableDeviceTypeStates(),
        );
    }

    protected enableDeviceTypeStates(): DeviceOptions {
        this.enableDeviceTypeState(PropertyType.Motion, {
            endpointId: this.appEndpoint.getNumber(),
            clusterId: OccupancySensing.Cluster.id,
            attributeName: 'occupancy',
            convertValue: (value: TypeFromBitSchema<typeof OccupancySensing.Occupancy>) => value.occupied,
        });
        return super.enableDeviceTypeStates();
    }

    get ioBrokerDevice(): GenericDevice {
        return this.#ioBrokerDevice;
    }
}
