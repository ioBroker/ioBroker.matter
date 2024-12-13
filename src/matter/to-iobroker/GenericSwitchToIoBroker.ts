import ChannelDetector from '@iobroker/type-detector';
import { Switch } from '@matter/main/clusters';
import type { Endpoint, PairedNode } from '@project-chip/matter.js/device';
import type { GenericDevice } from '../../lib';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { DetectedDevice, DeviceOptions } from '../../lib/devices/GenericDevice';
import ButtonSensor from '../../lib/devices/ButtonSensor';
import Socket from '../../lib/devices/Socket';
import { GenericDeviceToIoBroker } from './GenericDeviceToIoBroker';

/** Mapping Logic to map a ioBroker Contact Sensor device to a Matter OnOffLightDevice. */
export class GenericSwitchToIoBroker extends GenericDeviceToIoBroker {
    readonly #ioBrokerDevice: ButtonSensor | Socket;

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

        if (this.appEndpoint.getClusterClient(Switch.Complete)?.supportedFeatures.momentarySwitch) {
            // Momentary switch is mapped to a ButtonSensor
            this.#ioBrokerDevice = new ButtonSensor(
                { ...ChannelDetector.getPatterns().buttonSensor, isIoBrokerDevice: false } as DetectedDevice,
                adapter,
                this.enableDeviceTypeStates(),
            );
        } else {
            // A Latching Switch (only other option) is mapped to a Socket
            this.#ioBrokerDevice = new Socket(
                { ...ChannelDetector.getPatterns().socket, isIoBrokerDevice: false } as DetectedDevice,
                adapter,
                this.enableDeviceTypeStates(),
            );
        }
    }

    protected enableDeviceTypeStates(): DeviceOptions {
        if (this.#ioBrokerDevice instanceof ButtonSensor) {
            this.enableDeviceTypeState(PropertyType.Press, {
                endpointId: this.appEndpoint.getNumber(),
                clusterId: Switch.Cluster.id,
                attributeName: 'currentPosition',
                convertValue: value => value !== 0,
            });

            const hasLongPress = this.appEndpoint.getClusterClient(Switch.Complete)?.supportedFeatures
                .momentarySwitchLongPress;
            // TODO: Add support for long press events
        } else {
            this.enableDeviceTypeState(PropertyType.PowerActual, {
                endpointId: this.appEndpoint.getNumber(),
                clusterId: Switch.Cluster.id,
                attributeName: 'currentPosition',
                convertValue: value => value !== 0,
            });
        }

        return super.enableDeviceTypeStates();
    }

    get ioBrokerDevice(): GenericDevice {
        return this.#ioBrokerDevice;
    }
}
