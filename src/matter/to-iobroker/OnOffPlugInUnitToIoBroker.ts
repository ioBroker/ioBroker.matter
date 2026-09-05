import ChannelDetector from '@iobroker/type-detector';
import { OnOff } from '@matter/main/clusters';
import { OnOffClient } from '@matter/main/behaviors';
import type { Endpoint, ClientNode } from '@matter/main';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { DetectedDevice, DeviceOptions } from '../../lib/devices/GenericDevice';
import { Socket } from '../../lib/devices/Socket';
import { GenericElectricityDataDeviceToIoBroker } from './GenericElectricityDataDeviceToIoBroker';
import type { MatterAdapter } from '../../main';
import { OnOffCustomStates, type OnOffCustomStatesType } from './custom-states';

export class OnOffPlugInUnitToIoBroker extends GenericElectricityDataDeviceToIoBroker<OnOffCustomStatesType> {
    readonly #ioBrokerDevice: Socket;

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
            OnOffCustomStates,
        );

        this.#ioBrokerDevice = new Socket(
            { ...ChannelDetector.getPatterns().socket, isIoBrokerDevice: false } as DetectedDevice,
            adapter,
            this.enableDeviceTypeStates(),
            OnOffCustomStates,
        );
    }

    protected enableDeviceTypeStates(): DeviceOptions {
        this.#enableCustomStates();

        this.enableDeviceTypeStateForAttribute(PropertyType.Power, {
            endpointId: this.appEndpoint.number,
            clusterId: OnOff.id,
            attributeName: 'onOff',
            changeHandler: async value => {
                if (value) {
                    await this.appEndpoint.commandsOf(OnOffClient)?.on();
                } else {
                    await this.appEndpoint.commandsOf(OnOffClient)?.off();
                }
            },
        });
        this.enableDeviceTypeStateForAttribute(PropertyType.PowerActual, {
            endpointId: this.appEndpoint.number,
            clusterId: OnOff.id,
            attributeName: 'onOff',
        });
        return super.enableDeviceTypeStates();
    }

    #enableCustomStates(): void {
        const endpointId = this.appEndpoint.number;

        // StartUp On/Off - defines device behavior on power-up
        this.enableCustomStateForAttribute('startUpOnOff', {
            endpointId,
            clusterId: OnOff.id,
            attributeName: 'startUpOnOff',
            changeHandler: async (startUpOnOff: number | null) => {
                await this.appEndpoint.setStateOf(OnOffClient, {
                    startUpOnOff,
                });
            },
        });
    }

    get ioBrokerDevice(): Socket {
        return this.#ioBrokerDevice;
    }
}
