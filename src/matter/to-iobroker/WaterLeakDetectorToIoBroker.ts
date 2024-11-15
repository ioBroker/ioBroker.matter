import ChannelDetector from '@iobroker/type-detector';
import { BooleanState } from '@matter/main/clusters';
import { Endpoint } from '@project-chip/matter.js/device';
import { GenericDevice } from '../../lib';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import FloodAlarm from '../../lib/devices/FloodAlarm';
import { DetectedDevice, DeviceOptions } from '../../lib/devices/GenericDevice';
import { GenericDeviceToIoBroker } from './GenericDeviceToIoBroker';

/** Mapping Logic to map a ioBroker Contact Sensor device to a Matter OnOffLightDevice. */
export class WaterLeakDetectorToIoBroker extends GenericDeviceToIoBroker {
    readonly #ioBrokerDevice: FloodAlarm;

    constructor(
        endpoint: Endpoint,
        rootEndpoint: Endpoint,
        adapter: ioBroker.Adapter,
        endpointDeviceBaseId: string,
        deviceTypeName: string,
    ) {
        super(adapter, endpoint, rootEndpoint, endpointDeviceBaseId, deviceTypeName);

        this.#ioBrokerDevice = new FloodAlarm(
            { ...ChannelDetector.getPatterns().floodAlarm, isIoBrokerDevice: false } as DetectedDevice,
            adapter,
            this.enableDeviceTypeStates(),
        );
    }

    protected enableDeviceTypeStates(): DeviceOptions {
        this.enableDeviceTypeState(PropertyType.Value, {
            endpointId: this.appEndpoint.getNumber(),
            clusterId: BooleanState.Cluster.id,
            attributeName: 'stateValue',
        });

        return super.enableDeviceTypeStates();
    }

    get ioBrokerDevice(): GenericDevice {
        return this.#ioBrokerDevice;
    }
}
