import ChannelDetector from '@iobroker/type-detector';
import { BooleanState } from '@matter/main/clusters';
import type { Endpoint, PairedNode } from '@project-chip/matter.js/device';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { DetectedDevice, DeviceOptions } from '../../lib/devices/GenericDevice';
import { Window } from '../../lib/devices/Window';
import { GenericDeviceToIoBroker } from './GenericDeviceToIoBroker';
import type { MatterAdapter } from '../../main';

export class ContactSensorToIoBroker extends GenericDeviceToIoBroker {
    readonly #ioBrokerDevice: Window; // TODO That's a hack for now, could also be Door or Generic?

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

        this.#ioBrokerDevice = new Window(
            { ...ChannelDetector.getPatterns().window, isIoBrokerDevice: false } as DetectedDevice,
            adapter,
            this.enableDeviceTypeStates(),
        );
    }

    protected enableDeviceTypeStates(): DeviceOptions {
        this.enableDeviceTypeStateForAttribute(PropertyType.Value, {
            endpointId: this.appEndpoint.getNumber(),
            clusterId: BooleanState.Cluster.id,
            attributeName: 'stateValue',
            convertValue: value => !value,
        });

        return super.enableDeviceTypeStates();
    }

    get ioBrokerDevice(): Window {
        return this.#ioBrokerDevice;
    }
}
