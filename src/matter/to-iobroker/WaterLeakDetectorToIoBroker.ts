import ChannelDetector from '@iobroker/type-detector';
import { BooleanState } from '@matter/main/clusters';
import type { Endpoint, PairedNode } from '@project-chip/matter.js/device';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import { FloodAlarm } from '../../lib/devices/FloodAlarm';
import type { DetectedDevice, DeviceOptions } from '../../lib/devices/GenericDevice';
import { GenericDeviceToIoBroker } from './GenericDeviceToIoBroker';

export class WaterLeakDetectorToIoBroker extends GenericDeviceToIoBroker {
    readonly #ioBrokerDevice: FloodAlarm;

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

        this.#ioBrokerDevice = new FloodAlarm(
            { ...ChannelDetector.getPatterns().floodAlarm, isIoBrokerDevice: false } as DetectedDevice,
            adapter,
            this.enableDeviceTypeStates(),
        );
    }

    protected enableDeviceTypeStates(): DeviceOptions {
        this.enableDeviceTypeStateForAttribute(PropertyType.Value, {
            endpointId: this.appEndpoint.getNumber(),
            clusterId: BooleanState.Cluster.id,
            attributeName: 'stateValue',
        });

        return super.enableDeviceTypeStates();
    }

    get ioBrokerDevice(): FloodAlarm {
        return this.#ioBrokerDevice;
    }
}
