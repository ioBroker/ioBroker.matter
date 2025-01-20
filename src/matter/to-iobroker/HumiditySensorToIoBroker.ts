import ChannelDetector from '@iobroker/type-detector';
import { RelativeHumidityMeasurement } from '@matter/main/clusters';
import type { Endpoint, PairedNode } from '@project-chip/matter.js/device';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { DetectedDevice, DeviceOptions } from '../../lib/devices/GenericDevice';
import { Humidity } from '../../lib/devices/Humidity';
import { GenericElectricityDataDeviceToIoBroker } from './GenericElectricityDataDeviceToIoBroker';

export class HumiditySensorToIoBroker extends GenericElectricityDataDeviceToIoBroker {
    readonly #ioBrokerDevice: Humidity;

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

        this.#ioBrokerDevice = new Humidity(
            { ...ChannelDetector.getPatterns().humidity, isIoBrokerDevice: false } as DetectedDevice,
            adapter,
            this.enableDeviceTypeStates(),
        );
    }

    protected enableDeviceTypeStates(): DeviceOptions {
        this.enableDeviceTypeStateForAttribute(PropertyType.Humidity, {
            endpointId: this.appEndpoint.getNumber(),
            clusterId: RelativeHumidityMeasurement.Cluster.id,
            attributeName: 'measuredValue',
            convertValue: value => value / 100, // TODO Validate
        });
        return super.enableDeviceTypeStates();
    }

    get ioBrokerDevice(): Humidity {
        return this.#ioBrokerDevice;
    }
}
