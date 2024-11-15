import ChannelDetector from '@iobroker/type-detector';
import { TemperatureMeasurement } from '@matter/main/clusters';
import { Endpoint } from '@project-chip/matter.js/device';
import { GenericDevice } from '../../lib';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import { DetectedDevice, DeviceOptions } from '../../lib/devices/GenericDevice';
import Temperature from '../../lib/devices/Temperature';
import { GenericElectricityDataDeviceToIoBroker } from './GenericElectricityDataDeviceToIoBroker';

/** Mapping Logic to map a ioBroker Light device to a Matter OnOffLightDevice. */
export class TemperatureSensorToIoBroker extends GenericElectricityDataDeviceToIoBroker {
    readonly #ioBrokerDevice: Temperature;

    constructor(
        endpoint: Endpoint,
        rootEndpoint: Endpoint,
        adapter: ioBroker.Adapter,
        endpointDeviceBaseId: string,
        deviceTypeName: string,
    ) {
        super(adapter, endpoint, rootEndpoint, endpointDeviceBaseId, deviceTypeName);

        this.#ioBrokerDevice = new Temperature(
            { ...ChannelDetector.getPatterns().temperature, isIoBrokerDevice: false } as DetectedDevice,
            adapter,
            this.enableDeviceTypeStates(),
        );
    }

    protected enableDeviceTypeStates(): DeviceOptions {
        this.enableDeviceTypeState(PropertyType.Temperature, {
            endpointId: this.appEndpoint.getNumber(),
            clusterId: TemperatureMeasurement.Cluster.id,
            attributeName: 'measuredValue',
            convertValue: value => value / 100, // TODO Validate
        });
        return super.enableDeviceTypeStates();
    }

    get ioBrokerDevice(): GenericDevice {
        return this.#ioBrokerDevice;
    }
}
