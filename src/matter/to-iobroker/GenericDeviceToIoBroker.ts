import { AttributeId, ClusterId, Diagnostic, EndpointNumber, EventId } from '@matter/main';
import { BasicInformation } from '@matter/main/clusters';
import { DecodedEventData } from '@matter/main/protocol';
import { Endpoint } from '@project-chip/matter.js/device';
import { GenericDevice } from '../../lib';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import { DeviceOptions } from '../../lib/devices/GenericDevice';

export type EnabledProperty = {
    common?: Partial<ioBroker.StateCommon>;
    endpointId?: EndpointNumber;
    clusterId?: ClusterId;
    attributeId?: AttributeId;
    attributeName?: string;
    convertValue?: (value: any) => any;
    changeHandler?: (value: any) => Promise<void>;
};

/** Base class to map an ioBroker device to a matter device. */
export abstract class GenericDeviceToIoBroker {
    readonly baseId: string;
    protected readonly appEndpoint: Endpoint;
    readonly #rootEndpoint: Endpoint;
    readonly #name: string;
    readonly #deviceOptions: DeviceOptions;
    #enabledProperties = new Map<PropertyType, EnabledProperty>();

    protected constructor(endpoint: Endpoint, rootEndpoint: Endpoint, endpointDeviceBaseId: string) {
        this.appEndpoint = endpoint;
        this.#rootEndpoint = rootEndpoint;
        this.baseId = endpointDeviceBaseId;
        this.#name = endpoint.getDeviceTypes()[0].name;

        this.#deviceOptions = {
            additionalStateData: {},
            uuid: '',
            enabled: true,
            name: this.#name,
            oid: this.baseId,
            type: '...',
            auto: true,
            noComposed: true,
        };
    }

    /** Return the ioBroker device this mapping is for. */
    abstract ioBrokerDevice: GenericDevice;

    get name(): string {
        return this.#name;
    }

    /**
     * Method to override to add own states to the device.
     * This method is called by the constructor.
     */
    protected enableDeviceTypeStates(): DeviceOptions {
        this.enableDeviceTypeState(PropertyType.Unreachable, {
            endpointId: EndpointNumber(0),
            clusterId: BasicInformation.Cluster.id,
            attributeName: 'reachable',
            convertValue: value => !value,
        });
        return this.#deviceOptions;
    }

    /**
     * Enable a state for a Matter attribute if it exists and the property type is supported.
     * Important: provide attributeName for all standard Matter properties OR provide attributeId for vendor specific properties.
     */
    protected enableDeviceTypeState(
        type: PropertyType,
        data: {
            endpointId?: EndpointNumber;
            clusterId?: ClusterId;
            convertValue?: (value: any) => any;
            changeHandler?: (value: any) => Promise<void>;
        } & ({ vendorSpecificAttributeId: AttributeId } | { attributeName?: string }),
    ): void {
        const { endpointId, clusterId, convertValue, changeHandler } = data;
        const stateData = this.#deviceOptions.additionalStateData![type] ?? {};
        if (stateData.id !== undefined) {
            console.log(`State ${type} already enabled`);
            return;
        }

        let attributeId: AttributeId | undefined;
        const attributeName =
            'vendorSpecificAttributeId' in data
                ? `unknownAttribute_${Diagnostic.hex(data.vendorSpecificAttributeId)}`
                : data.attributeName;
        if (endpointId !== undefined && clusterId !== undefined && attributeName !== undefined) {
            const cluster =
                endpointId === 0
                    ? this.#rootEndpoint.getClusterClientById(clusterId)
                    : this.appEndpoint.getClusterClientById(clusterId);
            if (!cluster || !cluster.isAttributeSupportedByName(attributeName)) return;

            attributeId = cluster.attributes[attributeName].id;
        }

        stateData.id = `${this.baseId}.`;
        this.#deviceOptions.additionalStateData![type] = stateData;
        this.#enabledProperties.set(type, {
            endpointId,
            clusterId,
            attributeId,
            attributeName,
            convertValue,
            changeHandler,
        });
    }

    async getMatterState(property: PropertyType): Promise<any> {
        const matterLocation = this.#enabledProperties.get(property);
        if (matterLocation === undefined) return;
        const { endpointId, clusterId, attributeName } = matterLocation;
        if (endpointId === undefined || clusterId === undefined || attributeName === undefined) return;

        const cluster =
            endpointId === 0
                ? this.#rootEndpoint.getClusterClientById(clusterId)
                : endpointId === this.appEndpoint.number
                  ? this.appEndpoint.getClusterClientById(clusterId)
                  : undefined;
        if (!cluster) return;
        return cluster.attributes[attributeName].get(false);
    }

    async updateIoBrokerState(property: PropertyType, value: any): Promise<void> {
        const properties = this.#enabledProperties.get(property);
        if (properties === undefined) return;
        const { convertValue } = properties;
        if (convertValue !== undefined) {
            value = convertValue(value);
        }
        if (value !== undefined) {
            await this.ioBrokerDevice.updatePropertyValue(property, value);
        }
    }

    async handleChangedAttribute(data: {
        clusterId: ClusterId;
        endpointId: EndpointNumber;
        attributeId: AttributeId;
        attributeName: string;
        value: any;
    }): Promise<void> {
        for (const [property, matterLocation] of this.#enabledProperties) {
            if (
                matterLocation.clusterId === data.clusterId &&
                matterLocation.endpointId === data.endpointId &&
                matterLocation.attributeId === data.attributeId
            ) {
                return this.updateIoBrokerState(property, data.value);
            }
        }
    }

    async handleTriggeredEvent(_data: {
        clusterId: ClusterId;
        endpointId: EndpointNumber;
        eventId: EventId;
        eventName: string;
        events: DecodedEventData<any>[];
    }): Promise<void> {
        // TODO if relevant
    }

    /** Initialization Logic for the device. makes sure all handlers are registered for both sides. */
    async init(): Promise<void> {
        await this.ioBrokerDevice.init();
        this.#registerIoBrokerHandlersAndInitialize();
        await this.#initializeStates();
    }

    #registerIoBrokerHandlersAndInitialize(): void {
        // install ioBroker listeners
        // here we react on changes from the ioBroker side for onOff and current lamp level
        this.ioBrokerDevice.onChange(async (event: { property: PropertyType; value: unknown }) => {
            const matterLocation = this.#enabledProperties.get(event.property);
            if (matterLocation === undefined) return;
            const { changeHandler } = matterLocation;
            if (changeHandler === undefined) return;
            //console.log(`handle change event for ${event.property} with value ${event.value}`);
            await changeHandler(event.value);
        });
    }

    /** Initialize the states of the ioBroker device with the current values from the matter device. */
    async #initializeStates(): Promise<void> {
        for (const property of this.#enabledProperties.keys()) {
            const value = await this.getMatterState(property);
            if (value !== undefined) {
                await this.updateIoBrokerState(property, value);
            }
        }
    }

    destroy(): Promise<void> {
        return this.ioBrokerDevice.destroy();
    }
}
