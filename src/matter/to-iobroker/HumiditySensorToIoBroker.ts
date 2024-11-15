import ChannelDetector from '@iobroker/type-detector';
import { RelativeHumidityMeasurement } from '@matter/main/clusters';
import { Endpoint } from '@project-chip/matter.js/device';
import { GenericDevice } from '../../lib';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import { DetectedDevice, DeviceOptions } from '../../lib/devices/GenericDevice';
import Humidity from '../../lib/devices/Humidity';
import { GenericElectricityDataDeviceToIoBroker } from './GenericElectricityDataDeviceToIoBroker';

/** Mapping Logic to map a ioBroker Light device to a Matter OnOffLightDevice. */
export class HumiditySensorToIoBroker extends GenericElectricityDataDeviceToIoBroker {
    readonly #ioBrokerDevice: Humidity;

    constructor(
        endpoint: Endpoint,
        rootEndpoint: Endpoint,
        adapter: ioBroker.Adapter,
        endpointDeviceBaseId: string,
        deviceTypeName: string,
    ) {
        super(adapter, endpoint, rootEndpoint, endpointDeviceBaseId, deviceTypeName);

        this.#ioBrokerDevice = new Humidity(
            { ...ChannelDetector.getPatterns().humidity, isIoBrokerDevice: false } as DetectedDevice,
            adapter,
            this.enableDeviceTypeStates(),
        );
    }

    protected enableDeviceTypeStates(): DeviceOptions {
        this.enableDeviceTypeState(PropertyType.Humidity, {
            endpointId: this.appEndpoint.getNumber(),
            clusterId: RelativeHumidityMeasurement.Cluster.id,
            attributeName: 'measuredValue',
            convertValue: value => value / 100, // TODO Validate
        });
        return super.enableDeviceTypeStates();
    }

    get ioBrokerDevice(): GenericDevice {
        return this.#ioBrokerDevice;
    }
}