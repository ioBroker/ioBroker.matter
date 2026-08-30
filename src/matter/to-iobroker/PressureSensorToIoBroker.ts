import ChannelDetector from '@iobroker/type-detector';
import { PressureMeasurement } from '@matter/main/clusters';
import type { Endpoint } from '@matter/main';
import type { PairedNode } from '@project-chip/matter.js/device';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { DetectedDevice, DeviceOptions } from '../../lib/devices/GenericDevice';
import { Pressure } from '../../lib/devices/Pressure';
import { GenericDeviceToIoBroker } from './GenericDeviceToIoBroker';
import type { MatterAdapter } from '../../main';

export class PressureSensorToIoBroker extends GenericDeviceToIoBroker {
    readonly #ioBrokerDevice: Pressure;

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

        this.#ioBrokerDevice = new Pressure(
            { ...ChannelDetector.getPatterns().pressure, isIoBrokerDevice: false } as DetectedDevice,
            adapter,
            this.enableDeviceTypeStates(),
        );
    }

    protected enableDeviceTypeStates(): DeviceOptions {
        this.enableDeviceTypeStateForAttribute(PropertyType.Pressure, {
            endpointId: this.appEndpoint.number,
            clusterId: PressureMeasurement.id,
            attributeName: 'measuredValue',
            // Matter MeasuredValue = 10 x Pressure[kPa] and 1 kPa = 10 mbar, so the factors cancel out
            // and the value passes straight through to the ioBroker PRESSURE state in mbar
            convertValue: (value: number | null) => (value === null ? undefined : value),
        });
        return super.enableDeviceTypeStates();
    }

    get ioBrokerDevice(): Pressure {
        return this.#ioBrokerDevice;
    }
}
