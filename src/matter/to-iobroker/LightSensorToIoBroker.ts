import ChannelDetector from '@iobroker/type-detector';
import { IlluminanceMeasurement } from '@matter/main/clusters';
import type { TypeFromBitSchema } from '@matter/main/types';
import type { Endpoint, PairedNode } from '@project-chip/matter.js/device';
import type { GenericDevice } from '../../lib';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { DetectedDevice, DeviceOptions } from '../../lib/devices/GenericDevice';
import { GenericDeviceToIoBroker } from './GenericDeviceToIoBroker';
import Illuminance from '../../lib/devices/Illuminance';

/** Mapping Logic to map a ioBroker Light device to a Matter OnOffLightDevice. */
export class LightSensorToIoBroker extends GenericDeviceToIoBroker {
    readonly #ioBrokerDevice: Illuminance;

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

        this.#ioBrokerDevice = new Illuminance(
            { ...ChannelDetector.getPatterns().illuminance, isIoBrokerDevice: false } as DetectedDevice,
            adapter,
            this.enableDeviceTypeStates(),
        );
    }

    protected enableDeviceTypeStates(): DeviceOptions {
        this.enableDeviceTypeState(PropertyType.Motion, {
            endpointId: this.appEndpoint.getNumber(),
            clusterId: IlluminanceMeasurement.Cluster.id,
            attributeName: 'measuredValue',
            convertValue: (value: number) => Math.round(Math.pow(10, (value - 1) / 10000)),
        });
        return super.enableDeviceTypeStates();
    }

    get ioBrokerDevice(): GenericDevice {
        return this.#ioBrokerDevice;
    }
}
