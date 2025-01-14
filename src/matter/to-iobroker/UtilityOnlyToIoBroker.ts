import ChannelDetector from '@iobroker/type-detector';
import type { Endpoint, PairedNode } from '@project-chip/matter.js/device';
import type { GenericDevice } from '../../lib';
import type ElectricityDataDevice from '../../lib/devices/ElectricityDataDevice';
import type { DetectedDevice } from '../../lib/devices/GenericDevice';
import Light from '../../lib/devices/Light';
import { GenericElectricityDataDeviceToIoBroker } from './GenericElectricityDataDeviceToIoBroker';
import type { StructuredJsonFormData } from '../../lib/JsonConfigUtils';

/** Mapping Logic to map a ioBroker Light device to a Matter OnOffLightDevice. */
export class UtilityOnlyToIoBroker extends GenericElectricityDataDeviceToIoBroker {
    readonly #ioBrokerDevice: ElectricityDataDevice;
    readonly #deviceTypeSupported;

    constructor(
        node: PairedNode,
        endpoint: Endpoint,
        rootEndpoint: Endpoint,
        adapter: ioBroker.Adapter,
        endpointDeviceBaseId: string,
        deviceTypeName: string,
        defaultConnectionStateId: string,
        defaultName: string,
        deviceTypeSupported: boolean,
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

        this.#deviceTypeSupported = deviceTypeSupported;
        this.#ioBrokerDevice = new Light(
            // TODO: Change to something generic like ElectricityDataDevice that we need to define first
            { ...ChannelDetector.getPatterns().light, isIoBrokerDevice: false } as DetectedDevice,
            adapter,
            this.enableDeviceTypeStates(),
        );
    }

    override get ioBrokerDeviceType(): string | undefined {
        return 'ElectricityDataDevice';
    }

    override get iconDeviceType(): string {
        // Return a special measurement icon for it
        return 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+DQogICAgPHBhdGggZmlsbD0iY3VycmVudENvbG9yIiBkPSJtMjIgMjAuNTktNC42OS00LjY5QzE4LjM3IDE0LjU1IDE5IDEyLjg1IDE5IDExYzAtNC40Mi0zLjU4LTgtOC04LTQuMDggMC03LjQ0IDMuMDUtNy45MyA3aDIuMDJDNS41NyA3LjE3IDguMDMgNSAxMSA1YzMuMzEgMCA2IDIuNjkgNiA2cy0yLjY5IDYtNiA2Yy0yLjQyIDAtNC41LTEuNDQtNS40NS0zLjVIMy40QzQuNDUgMTYuNjkgNy40NiAxOSAxMSAxOWMxLjg1IDAgMy41NS0uNjMgNC45LTEuNjlMMjAuNTkgMjJ6IiAvPg0KICAgIDxwYXRoIGZpbGw9ImN1cnJlbnRDb2xvciIgZD0iTTguNDMgOS42OSA5LjY1IDE1aDEuNjRsMS4yNi0zLjc4Ljk1IDIuMjhoMlYxMmgtMWwtMS4yNS0zaC0xLjU0bC0xLjEyIDMuMzdMOS4zNSA3SDcuN2wtMS4yNSA0SDF2MS41aDYuNTV6IiAvPg0KPC9zdmc+';
    }

    get ioBrokerDevice(): GenericDevice {
        return this.#ioBrokerDevice;
    }

    override async getDeviceDetails(): Promise<StructuredJsonFormData> {
        const details = await super.getDeviceDetails();

        const unsupportedInfo = {
            __header__UnsupportedNotice: 'This Device type is not automatically mapped to ioBroker!',
            __text__UnsupportedNotice1: `For this device type (${this.deviceType}) no mapping is defined yet to ioBroker device structures. Please report this as an Issue with the Debug details from the Node tile and Endpoint information.`,
            __text__UnsupportedNotice2: `The Matter Application cluster details have been exposed in the ioBroker objects. You can see all attributes and information and also invoke commands on the device. For commands you might need to consult the Matter Application Cluster specification.`,
        };

        if (!this.#deviceTypeSupported) {
            if (details.states) {
                details.states = {
                    ...unsupportedInfo,
                    ...details.states,
                };
            }
            details.details = {
                ...unsupportedInfo,
                ...details.details,
            };
        }

        return details;
    }
}
