import ChannelDetector from '@iobroker/type-detector';
import { TemperatureMeasurement } from '@matter/main/clusters';
import type { Endpoint } from '@matter/main';
import type { PairedNode } from '@project-chip/matter.js/device';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { DetectedDevice, DeviceOptions } from '../../lib/devices/GenericDevice';
import { Temperature } from '../../lib/devices/Temperature';
import { GenericElectricityDataDeviceToIoBroker } from './GenericElectricityDataDeviceToIoBroker';
import type { MatterAdapter } from '../../main';
import { MatterConverters } from '../ConversionUtils';

export class TemperatureSensorToIoBroker extends GenericElectricityDataDeviceToIoBroker {
    readonly #ioBrokerDevice: Temperature;

    constructor(
        node: PairedNode,
        endpoint: Endpoint,
        rootEndpoint: Endpoint,
        adapter: MatterAdapter,
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

    protected enableDeviceTypeStates(): DeviceOptions {
        this.enableDeviceTypeStateForAttribute(PropertyType.Temperature, {
            endpointId: this.appEndpoint.number,
            clusterId: TemperatureMeasurement.id,
            attributeName: 'measuredValue',
            convertValue: value => MatterConverters.fromMatterHundredths(value),
        });
        return super.enableDeviceTypeStates();
    }

    get ioBrokerDevice(): Temperature {
        return this.#ioBrokerDevice;
    }
}
