import ChannelDetector from '@iobroker/type-detector';
import { IlluminanceMeasurement } from '@matter/main/clusters';
import type { Endpoint, ClientNode } from '@matter/main';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { DetectedDevice, DeviceOptions } from '../../lib/devices/GenericDevice';
import { GenericDeviceToIoBroker } from './GenericDeviceToIoBroker';
import { Illuminance } from '../../lib/devices/Illuminance';
import type { MatterAdapter } from '../../main';

export class LightSensorToIoBroker extends GenericDeviceToIoBroker {
    readonly #ioBrokerDevice: Illuminance;

    constructor(
        node: ClientNode,
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

        this.#ioBrokerDevice = new Illuminance(
            { ...ChannelDetector.getPatterns().illuminance, isIoBrokerDevice: false } as DetectedDevice,
            adapter,
            this.enableDeviceTypeStates(),
        );
    }

    protected enableDeviceTypeStates(): DeviceOptions {
        this.enableDeviceTypeStateForAttribute(PropertyType.Brightness, {
            endpointId: this.appEndpoint.number,
            clusterId: IlluminanceMeasurement.id,
            attributeName: 'measuredValue',
            convertValue: (value: number) => Math.round(Math.pow(10, (value - 1) / 10000)),
        });
        return super.enableDeviceTypeStates();
    }

    get ioBrokerDevice(): Illuminance {
        return this.#ioBrokerDevice;
    }
}
