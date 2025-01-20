import ChannelDetector from '@iobroker/type-detector';
import { OccupancySensing } from '@matter/main/clusters';
import type { TypeFromBitSchema } from '@matter/main/types';
import type { Endpoint, PairedNode } from '@project-chip/matter.js/device';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { DetectedDevice, DeviceOptions } from '../../lib/devices/GenericDevice';
import { Motion } from '../../lib/devices/Motion';
import { GenericDeviceToIoBroker } from './GenericDeviceToIoBroker';

export class OccupancyToIoBroker extends GenericDeviceToIoBroker {
    readonly #ioBrokerDevice: Motion;

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

        this.#ioBrokerDevice = new Motion(
            { ...ChannelDetector.getPatterns().motion, isIoBrokerDevice: false } as DetectedDevice,
            adapter,
            this.enableDeviceTypeStates(),
        );
    }

    protected enableDeviceTypeStates(): DeviceOptions {
        this.enableDeviceTypeStateForAttribute(PropertyType.Motion, {
            endpointId: this.appEndpoint.getNumber(),
            clusterId: OccupancySensing.Cluster.id,
            attributeName: 'occupancy',
            convertValue: (value: TypeFromBitSchema<typeof OccupancySensing.Occupancy>) => value.occupied,
        });
        return super.enableDeviceTypeStates();
    }

    get ioBrokerDevice(): Motion {
        return this.#ioBrokerDevice;
    }
}
