import ChannelDetector from '@iobroker/type-detector';
import { OnOff } from '@matter/main/clusters';
import type { Endpoint, PairedNode } from '@project-chip/matter.js/device';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { DetectedDevice, DeviceOptions } from '../../lib/devices/GenericDevice';
import { Light } from '../../lib/devices/Light';
import { GenericElectricityDataDeviceToIoBroker } from './GenericElectricityDataDeviceToIoBroker';
import type { MatterAdapter } from '../../main';
import { OnOffCustomStates, type OnOffCustomStatesType } from './custom-states';

export class OnOffLightToIoBroker extends GenericElectricityDataDeviceToIoBroker<OnOffCustomStatesType> {
    readonly #ioBrokerDevice: Light;

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
            OnOffCustomStates,
        );

        this.#ioBrokerDevice = new Light(
            { ...ChannelDetector.getPatterns().light, isIoBrokerDevice: false } as DetectedDevice,
            adapter,
            this.enableDeviceTypeStates(),
            OnOffCustomStates,
        );
    }

    protected enableDeviceTypeStates(): DeviceOptions {
        this.#enableCustomStates();

        this.enableDeviceTypeStateForAttribute(PropertyType.Power, {
            endpointId: this.appEndpoint.getNumber(),
            clusterId: OnOff.Cluster.id,
            attributeName: 'onOff',
            changeHandler: async value => {
                if (value) {
                    await this.appEndpoint.getClusterClient(OnOff.Complete)?.on();
                } else {
                    await this.appEndpoint.getClusterClient(OnOff.Complete)?.off();
                }
            },
        });
        this.enableDeviceTypeStateForAttribute(PropertyType.PowerActual, {
            endpointId: this.appEndpoint.getNumber(),
            clusterId: OnOff.Cluster.id,
            attributeName: 'onOff',
            convertValue: async value => {
                await this.#ioBrokerDevice.updatePower(value); // Also Ack Power Set State
                return value;
            },
        });
        return super.enableDeviceTypeStates();
    }

    #enableCustomStates(): void {
        const endpointId = this.appEndpoint.getNumber();

        // StartUp On/Off - defines device behavior on power-up
        this.enableCustomStateForAttribute('startUpOnOff', {
            endpointId,
            clusterId: OnOff.Cluster.id,
            attributeName: 'startUpOnOff',
            changeHandler: async (value: number | null) => {
                const client = await this.node.getInteractionClient();
                await client.setAttribute({
                    attributeData: {
                        endpointId,
                        clusterId: OnOff.Complete.id,
                        attribute: OnOff.Complete.attributes.startUpOnOff,
                        value,
                    },
                });
            },
        });
    }

    get ioBrokerDevice(): Light {
        return this.#ioBrokerDevice;
    }
}
