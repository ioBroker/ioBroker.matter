import ChannelDetector from '@iobroker/type-detector';
import { TemperatureMeasurement } from '@matter/main/clusters';
import type { Endpoint, PairedNode } from '@project-chip/matter.js/device';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { DetectedDevice, DeviceOptions } from '../../lib/devices/GenericDevice';
import { Temperature } from '../../lib/devices/Temperature';
import { GenericElectricityDataDeviceToIoBroker } from './GenericElectricityDataDeviceToIoBroker';

export class TemperatureSensorToIoBroker extends GenericElectricityDataDeviceToIoBroker {
    readonly #ioBrokerDevice: Temperature;

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

        this.#ioBrokerDevice = new Temperature(
            { ...ChannelDetector.getPatterns().temperature, isIoBrokerDevice: false } as DetectedDevice,
            adapter,
            this.enableDeviceTypeStates(),
        );
    }

    temperatureFromMatter(value: number): number {
        return parseFloat((value / 100).toFixed(2));
    }

    protected enableDeviceTypeStates(): DeviceOptions {
        this.enableDeviceTypeStateForAttribute(PropertyType.Temperature, {
            endpointId: this.appEndpoint.getNumber(),
            clusterId: TemperatureMeasurement.Cluster.id,
            attributeName: 'measuredValue',
            convertValue: value => this.temperatureFromMatter(value),
        });
        return super.enableDeviceTypeStates();
    }

    get ioBrokerDevice(): Temperature {
        return this.#ioBrokerDevice;
    }
}
