import { type AttributeId, type ClusterId, Diagnostic, EndpointNumber, type EventId } from '@matter/main';
import { BasicInformation, BridgedDeviceBasicInformation, Identify } from '@matter/main/clusters';
import type { DecodedEventData } from '@matter/main/protocol';
import type { Endpoint, PairedNode, DeviceBasicInformation } from '@project-chip/matter.js/device';
import type { GenericDevice } from '../../lib';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { DeviceOptions } from '../../lib/devices/GenericDevice';
import { decamelize, toHex } from '../../lib/utils';

export type EnabledProperty = {
    common?: Partial<ioBroker.StateCommon>;
    endpointId?: EndpointNumber;
    clusterId?: ClusterId;
    attributeId?: AttributeId;
    attributeName?: string;
    convertValue?: (value: any) => any;
    changeHandler?: (value: any) => Promise<void>;
    pollAttribute?: boolean;
};

export type GenericDeviceConfiguration = {
    pollInterval?: number;
};

/** Base class to map an ioBroker device to a matter device. */
export abstract class GenericDeviceToIoBroker {
    readonly #adapter: ioBroker.Adapter;
    readonly baseId: string;
    readonly #node: PairedNode;
    protected readonly appEndpoint: Endpoint;
    readonly #rootEndpoint: Endpoint;
    #name: string;
    readonly deviceType: string;
    readonly #deviceOptions: DeviceOptions;
    #enabledProperties = new Map<PropertyType, EnabledProperty>();
    #connectionStateId: string;
    #hasBridgedReachabilityAttribute = false;
    #pollTimeout?: ioBroker.Timeout;
    #destroyed = false;
    #initialized = false;
    #pollInterval = 60_000;
    #hasAttributesToPoll = false;

    protected constructor(
        adapter: ioBroker.Adapter,
        node: PairedNode,
        endpoint: Endpoint,
        rootEndpoint: Endpoint,
        endpointDeviceBaseId: string,
        deviceTypeName: string,
        defaultConnectionStateId: string,
    ) {
        this.#adapter = adapter;
        this.#node = node;
        this.appEndpoint = endpoint;
        this.#rootEndpoint = rootEndpoint;
        this.baseId = endpointDeviceBaseId;
        this.#name = deviceTypeName;
        this.deviceType = deviceTypeName;
        this.#connectionStateId = defaultConnectionStateId;

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

    get number(): EndpointNumber {
        return this.appEndpoint.number!;
    }

    get connectionStateId(): string {
        return this.#connectionStateId;
    }

    get nodeBasicInformation(): Partial<DeviceBasicInformation> {
        return this.#node.basicInformation ?? {};
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
        if (!this.#enabledProperties.has(PropertyType.Unreachable)) {
            this.enableDeviceTypeState(PropertyType.Unreachable, {
                endpointId: this.appEndpoint.number,
                clusterId: BridgedDeviceBasicInformation.Cluster.id,
                attributeName: 'reachable',
                convertValue: value => !value,
            });
            if (this.#enabledProperties.has(PropertyType.Unreachable)) {
                this.#hasBridgedReachabilityAttribute = true;
            }
        }
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
            pollAttribute?: boolean;
        } & ({ vendorSpecificAttributeId: AttributeId } | { attributeName?: string }),
    ): void {
        const { endpointId, clusterId, convertValue, changeHandler, pollAttribute } = data;
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
            if (!cluster || !cluster.isAttributeSupportedByName(attributeName)) {
                return;
            }

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
            pollAttribute,
        });
    }

    async getMatterState(property: PropertyType): Promise<any> {
        const matterLocation = this.#enabledProperties.get(property);
        if (matterLocation === undefined) {
            return;
        }
        const { endpointId, clusterId, attributeName } = matterLocation;
        if (endpointId === undefined || clusterId === undefined || attributeName === undefined) {
            return;
        }

        const cluster =
            endpointId === 0
                ? this.#rootEndpoint.getClusterClientById(clusterId)
                : endpointId === this.appEndpoint.number
                  ? this.appEndpoint.getClusterClientById(clusterId)
                  : undefined;
        if (!cluster) {
            return;
        }
        return cluster.attributes[attributeName].get(false);
    }

    async updateIoBrokerState(property: PropertyType, value: any): Promise<void> {
        const properties = this.#enabledProperties.get(property);
        if (properties === undefined) {
            return;
        }
        const { convertValue } = properties;
        if (convertValue !== undefined) {
            value = convertValue(value);
        }
        if (value !== undefined) {
            await this.ioBrokerDevice.updatePropertyValue(property, value);

            if (property === PropertyType.Unreachable && this.#hasBridgedReachabilityAttribute) {
                await this.#adapter.setStateAsync(this.#connectionStateId, { val: !value, ack: true });
            }
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
        const existingObject = await this.#adapter.getObjectAsync(this.baseId);
        if (existingObject) {
            if (existingObject.common.name) {
                this.#name =
                    typeof existingObject.common.name === 'string'
                        ? existingObject.common.name
                        : existingObject.common.name.en;
            }
            this.setDeviceConfiguration({
                pollInterval: existingObject.native?.pollInterval,
            });
        }

        await this.ioBrokerDevice.init();
        this.#registerIoBrokerHandlersAndInitialize();
        await this.#initializeStates();

        if (this.#hasBridgedReachabilityAttribute) {
            await this.#adapter.setObjectNotExists(`${this.baseId}.info`, {
                type: 'channel',
                common: {
                    name: 'Bridged Device connection info',
                },
                native: {},
            });

            this.#connectionStateId = `${this.baseId}.info.connection`;
            await this.#adapter.setObjectNotExists(`${this.#connectionStateId}`, {
                type: 'state',
                common: {
                    name: 'Connected',
                    role: 'indicator.connected',
                    type: 'boolean',
                    read: true,
                    write: false,
                },
                native: {},
            });

            await this.#adapter.setState(this.#connectionStateId, {
                val:
                    (await this.appEndpoint
                        .getClusterClient(BridgedDeviceBasicInformation.Cluster)
                        ?.getReachableAttribute()) ?? false,
                ack: true,
            });
        }

        await this.#adapter.extendObjectAsync(this.baseId, {
            common: {
                statusStates: {
                    onlineId: `${this.#connectionStateId}`,
                },
            },
        });

        this.#initialized = true;
    }

    #registerIoBrokerHandlersAndInitialize(): void {
        // install ioBroker listeners
        // here we react on changes from the ioBroker side for onOff and current lamp level
        this.ioBrokerDevice.onChange(async (event: { property: PropertyType; value: unknown }) => {
            const matterLocation = this.#enabledProperties.get(event.property);
            if (matterLocation === undefined) {
                return;
            }
            const { changeHandler } = matterLocation;
            if (changeHandler === undefined) {
                return;
            }
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
        this.#initAttributePolling();
    }

    #initAttributePolling(): void {
        if (this.#pollTimeout !== undefined) {
            this.#adapter.clearTimeout(this.#pollTimeout);
            this.#pollTimeout = undefined;
        }
        const pollingAttributes = new Array<{
            endpointId: EndpointNumber;
            clusterId: ClusterId;
            attributeId: AttributeId;
        }>();
        for (const { endpointId, clusterId, attributeId, pollAttribute } of this.#enabledProperties.values()) {
            if (pollAttribute) {
                if (endpointId !== undefined && clusterId !== undefined && attributeId !== undefined) {
                    pollingAttributes.push({ endpointId, clusterId, attributeId });
                }
            }
        }
        if (pollingAttributes.length) {
            this.#hasAttributesToPoll = true;
            this.#pollTimeout = this.#adapter.setTimeout(
                () => this.#pollAttributes(pollingAttributes),
                this.#pollInterval,
            );
        }
    }

    async #pollAttributes(
        attributes: {
            endpointId: EndpointNumber;
            clusterId: ClusterId;
            attributeId: AttributeId;
        }[],
    ): Promise<void> {
        this.#pollTimeout = undefined;
        if (this.#destroyed || attributes.length === 0) {
            return;
        }

        if (this.#node.isConnected) {
            // Split in chunks of maximum 9 attributes and get an interactionClient from node
            const client = await this.#node.getInteractionClient();

            for (let i = 0; i < attributes.length; i += 9) {
                if (this.#destroyed) {
                    return;
                }
                // Maximum read for 9 attribute paths is allowed, so split in chunks of 9
                const chunk = attributes.slice(i, i + 9);

                // Collect the endpoints and clusters and get the last known data version for each to use as filter
                const endpointClusters = new Map<string, { endpointId: EndpointNumber; clusterId: ClusterId }>();
                for (const { endpointId, clusterId } of chunk) {
                    const key = `${endpointId}-${clusterId}`;
                    endpointClusters.set(key, { endpointId, clusterId });
                }
                const dataVersionFilters = new Array<{
                    endpointId: EndpointNumber;
                    clusterId: ClusterId;
                    dataVersion: number;
                }>();
                for (const data of endpointClusters.values()) {
                    const filter = client.getCachedClusterDataVersions(data);
                    if (filter.length) {
                        dataVersionFilters.push(filter[0]);
                    }
                }

                try {
                    // Query the attributes
                    const result = await client.getMultipleAttributes({
                        attributes: chunk.map(({ endpointId, clusterId, attributeId }) => ({
                            endpointId,
                            clusterId,
                            attributeId,
                        })),
                        dataVersionFilters,
                    });

                    // Handle the results as if they would have come as subscription update
                    for (const {
                        path: { endpointId, clusterId, attributeId, attributeName },
                        value,
                    } of result) {
                        await this.handleChangedAttribute({
                            clusterId,
                            endpointId,
                            attributeId,
                            attributeName,
                            value,
                        });
                    }
                } catch (e) {
                    this.#adapter.log.info(`Error polling attributes for node ${this.#node.nodeId}: ${e}`);
                }
            }
        } else {
            this.#adapter.log.debug(`Node ${this.#node.nodeId} is not connected, do not poll attributes`);
        }

        this.#pollTimeout = this.#adapter.setTimeout(() => this.#pollAttributes(attributes), this.#pollInterval);
    }

    destroy(): Promise<void> {
        this.#destroyed = true;
        if (this.#pollTimeout !== undefined) {
            this.#adapter.clearTimeout(this.#pollTimeout);
            this.#pollTimeout = undefined;
        }
        return this.ioBrokerDevice.destroy();
    }

    hasIdentify(): boolean {
        return this.appEndpoint.hasClusterClient(Identify.Cluster);
    }

    async identify(identifyTime = 30): Promise<void> {
        await this.appEndpoint.getClusterClient(Identify.Cluster)?.identify({ identifyTime });
    }

    async rename(name: string): Promise<void> {
        this.#name = name;
        await this.#adapter.extendObjectAsync(this.baseId, { common: { name } });
    }

    getDeviceDetails(): Record<string, Record<string, unknown>> {
        const result: Record<string, Record<string, unknown>> = {};

        const states = this.ioBrokerDevice.states;
        if (Object.keys(states).length) {
            result.states = states;
        }

        result.details = {
            name: this.#name,
            primaryDeviceType: this.deviceType,
            deviceTypes: this.appEndpoint
                .getDeviceTypes()
                .map(({ name, code }) => `${name} (${toHex(code)})`)
                .join(', '),
            endpoint: this.appEndpoint.number,
        } as Record<string, unknown>;

        result.matterClusters = {} as Record<string, unknown>;
        for (const client of this.appEndpoint.getAllClusterClients()) {
            const activeFeatures = new Array<string>();
            Object.keys(client.supportedFeatures).forEach(f => client.supportedFeatures[f] && activeFeatures.push(f));
            result.matterClusters[`__header__${client.name}`] = decamelize(client.name);
            result.matterClusters[`${client.name}__Features`] = activeFeatures.length
                ? activeFeatures.map(name => decamelize(name)).join(', ')
                : 'no explicit feature set';
            result.matterClusters[`${client.name}__Revision`] = client.revision;
        }

        return result;
    }

    get deviceConfiguration(): { pollInterval?: number } {
        return {
            pollInterval: this.#hasAttributesToPoll ? Math.round(this.#pollInterval / 1000) : undefined,
        };
    }

    setDeviceConfiguration(config: GenericDeviceConfiguration): void {
        const { pollInterval } = config;
        if (pollInterval !== undefined) {
            if (isNaN(pollInterval) || pollInterval < 30 || pollInterval > 2_147_482) {
                this.#adapter.log.warn(
                    `Invalid polling interval ${pollInterval} seconds, use former value of ${Math.round(this.#pollInterval / 1000)}.`,
                );
                return;
            }
            this.#pollInterval = pollInterval * 1000;
            if (this.#initialized) {
                // If already initialized, restart polling
                this.#initAttributePolling();
            }
        }
    }
}
