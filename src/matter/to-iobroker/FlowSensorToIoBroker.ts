import ChannelDetector from '@iobroker/type-detector';
import { FlowMeasurement } from '@matter/main/clusters';
import type { Endpoint, ClientNode } from '@matter/main';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { DetectedDevice, DeviceOptions } from '../../lib/devices/GenericDevice';
import { Flow } from '../../lib/devices/Flow';
import { GenericDeviceToIoBroker } from './GenericDeviceToIoBroker';
import type { MatterAdapter } from '../../main';

export class FlowSensorToIoBroker extends GenericDeviceToIoBroker {
    readonly #ioBrokerDevice: Flow;

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

        this.#ioBrokerDevice = new Flow(
            { ...ChannelDetector.getPatterns().flow, isIoBrokerDevice: false } as DetectedDevice,
            adapter,
            this.enableDeviceTypeStates(),
        );
    }

    protected enableDeviceTypeStates(): DeviceOptions {
        this.enableDeviceTypeStateForAttribute(PropertyType.Flow, {
            endpointId: this.appEndpoint.number,
            clusterId: FlowMeasurement.id,
            attributeName: 'measuredValue',
            // Matter MeasuredValue = 10 x Flow[m³/h], and the ioBroker FLOW state is m³/h
            convertValue: (value: number | null) => (value === null ? undefined : value / 10),
        });
        return super.enableDeviceTypeStates();
    }

    get ioBrokerDevice(): Flow {
        return this.#ioBrokerDevice;
    }
}
