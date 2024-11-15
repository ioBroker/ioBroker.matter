import ChannelDetector from '@iobroker/type-detector';
import { BooleanState } from '@matter/main/clusters';
import type { Endpoint } from '@project-chip/matter.js/device';
import type { GenericDevice } from '../../lib';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { DetectedDevice, DeviceOptions } from '../../lib/devices/GenericDevice';
import Window from '../../lib/devices/Window';
import { GenericDeviceToIoBroker } from './GenericDeviceToIoBroker';

/** Mapping Logic to map a ioBroker Contact Sensor device to a Matter OnOffLightDevice. */
export class ContactSensorToIoBroker extends GenericDeviceToIoBroker {
    readonly #ioBrokerDevice: Window; // TODO That's a hack for now, could also be Door or Generic?

    constructor(
        endpoint: Endpoint,
        rootEndpoint: Endpoint,
        adapter: ioBroker.Adapter,
        endpointDeviceBaseId: string,
        deviceTypeName: string,
    ) {
        super(adapter, endpoint, rootEndpoint, endpointDeviceBaseId, deviceTypeName);

        this.#ioBrokerDevice = new Window(
            { ...ChannelDetector.getPatterns().window, isIoBrokerDevice: false } as DetectedDevice,
            adapter,
            this.enableDeviceTypeStates(),
        );
    }

    protected enableDeviceTypeStates(): DeviceOptions {
        this.enableDeviceTypeState(PropertyType.Value, {
            endpointId: this.appEndpoint.getNumber(),
            clusterId: BooleanState.Cluster.id,
            attributeName: 'stateValue',
            convertValue: value => !value,
        });

        return super.enableDeviceTypeStates();
    }

    get ioBrokerDevice(): GenericDevice {
        return this.#ioBrokerDevice;
    }
}
