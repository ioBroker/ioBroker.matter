import ChannelDetector from '@iobroker/type-detector';
import { IlluminanceMeasurement } from '@matter/main/clusters';
import type { Endpoint, PairedNode } from '@project-chip/matter.js/device';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { DetectedDevice, DeviceOptions } from '../../lib/devices/GenericDevice';
import { GenericDeviceToIoBroker } from './GenericDeviceToIoBroker';
import { Illuminance } from '../../lib/devices/Illuminance';

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
        this.enableDeviceTypeStateForAttribute(PropertyType.Brightness, {
            endpointId: this.appEndpoint.getNumber(),
            clusterId: IlluminanceMeasurement.Cluster.id,
            attributeName: 'measuredValue',
            convertValue: (value: number) => Math.round(Math.pow(10, (value - 1) / 10000)),
        });
        return super.enableDeviceTypeStates();
    }

    get ioBrokerDevice(): Illuminance {
        return this.#ioBrokerDevice;
    }
}
