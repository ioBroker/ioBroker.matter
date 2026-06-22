import ChannelDetector from '@iobroker/type-detector';
import { Switch } from '@matter/main/clusters';
import { SwitchClient } from '@matter/main/behaviors';
import type { Endpoint } from '@matter/main';
import type { PairedNode } from '@project-chip/matter.js/device';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { DetectedDevice, DeviceOptions } from '../../lib/devices/GenericDevice';
import { ButtonSensor } from '../../lib/devices/ButtonSensor';
import { Socket } from '../../lib/devices/Socket';
import { GenericDeviceToIoBroker } from './GenericDeviceToIoBroker';
import type { MatterAdapter } from '../../main';

export class GenericSwitchToIoBroker extends GenericDeviceToIoBroker {
    readonly #ioBrokerDevice: ButtonSensor | Socket;

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

        const features = this.appEndpoint.behaviors.typeFor(SwitchClient)?.features;

        if (features?.momentarySwitch) {
            // Momentary switch is mapped to a ButtonSensor
            this.#ioBrokerDevice = new ButtonSensor(
                { ...ChannelDetector.getPatterns().buttonSensor, isIoBrokerDevice: false } as DetectedDevice,
                adapter,
                this.enableMomentarySwitchDeviceTypeStates(),
            );
        } else {
            // A Latching Switch (only other option) is mapped to a Socket
            this.#ioBrokerDevice = new Socket(
                { ...ChannelDetector.getPatterns().socket, isIoBrokerDevice: false } as DetectedDevice,
                adapter,
                this.enableLatchingSwitchDeviceTypeStates(),
            );
        }
    }

    protected enableMomentarySwitchDeviceTypeStates(): DeviceOptions {
        /*this.enableDeviceTypeStateForAttribute(PropertyType.Press, {
            endpointId: this.appEndpoint.number,
            clusterId: Switch.id,
            attributeName: 'currentPosition',
            convertValue: value => value !== 0,
        });*/
        // Move to event for now
        this.enableDeviceTypeStateForEvent(PropertyType.Press, {
            endpointId: this.appEndpoint.number,
            clusterId: Switch.id,
            eventName: 'initialPress',
            convertValue: () => true,
        });

        const features = this.appEndpoint.behaviors.typeFor(SwitchClient)?.features;
        if (features?.momentarySwitchLongPress) {
            this.enableDeviceTypeStateForEvent(PropertyType.PressLong, {
                endpointId: this.appEndpoint.number,
                clusterId: Switch.id,
                eventName: 'longPress',
                convertValue: () => true,
            });
            this.enableDeviceTypeStateForEvent(PropertyType.PressLong, {
                endpointId: this.appEndpoint.number,
                clusterId: Switch.id,
                eventName: 'longRelease',
                convertValue: () => false,
            });
        }
        return this.enableDeviceTypeStates();
    }

    protected enableLatchingSwitchDeviceTypeStates(): DeviceOptions {
        this.enableDeviceTypeStateForAttribute(PropertyType.PowerActual, {
            endpointId: this.appEndpoint.number,
            clusterId: Switch.id,
            attributeName: 'currentPosition',
            convertValue: value => value !== 0,
        });

        return this.enableDeviceTypeStates();
    }

    get ioBrokerDevice(): ButtonSensor | Socket {
        return this.#ioBrokerDevice;
    }
}
