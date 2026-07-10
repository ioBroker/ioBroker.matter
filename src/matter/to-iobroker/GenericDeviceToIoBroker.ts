import {
    type MaybePromise,
    type AttributeId,
    type ClusterId,
    type EventId,
    type Endpoint,
    camelize,
    ClusterBehavior,
    Diagnostic,
    EndpointNumber,
    Matter,
} from '@matter/main';
import type { MatterAdapter } from '../../main';
import { BasicInformation, BridgedDeviceBasicInformation, PowerSource } from '@matter/main/clusters';
import {
    BridgedDeviceBasicInformationClient,
    DescriptorClient,
    IdentifyClient,
    PowerSourceClient,
} from '@matter/main/behaviors';
import type { DecodedEventData } from '@matter/main/protocol';
import type { PairedNode } from '@project-chip/matter.js/device';
import type { GenericDevice } from '../../lib';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { DeviceOptions } from '../../lib/devices/GenericDevice';
import { decamelize, toHex } from '../../lib/utils';
import type { StructuredJsonFormData } from '../../lib/JsonConfigUtils';
import type { DeviceStatus } from '@iobroker/dm-utils';
import type {
    CustomStateCommon,
    CustomStateDefinition,
    CustomStateNames,
    CustomStatesRecord,
    EmptyCustomStates,
} from './custom-states';

export interface EnabledProperty {
    common?: Partial<ioBroker.StateCommon>;
    endpointId?: EndpointNumber;
    clusterId?: ClusterId;
}

export interface EnabledAttributeProperty extends EnabledProperty {
    type: 'attribute';
    attributeId?: AttributeId;
    attributeName?: string;
    convertValue?: (value: any) => MaybePromise<any>;
    changeHandler?: (value: any) => MaybePromise<void> | void;
    pollAttribute?: boolean;
}

export interface EnabledEventProperty extends EnabledProperty {
    type: 'event';
    eventId?: EventId;
    eventName?: string;
    convertValue: (property: PropertyType, event: DecodedEventData<any>) => MaybePromise<any>;
}

export type GenericDeviceConfiguration = {
    pollInterval?: number;
};

/** Property definition for custom state attribute mappings */
export interface EnabledCustomAttributeProperty {
    type: 'attribute';
    endpointId?: EndpointNumber;
    clusterId?: ClusterId;
    attributeId?: AttributeId;
    attributeName?: string;
    convertValue?: (value: any) => MaybePromise<any>;
    changeHandler?: (value: any) => MaybePromise<void> | void;
    pollAttribute?: boolean;
    common?: CustomStateCommon;
}

function attributePathToString(path: {
    endpointId: EndpointNumber;
    clusterId: ClusterId;
    attributeName: string;
}): string {
    return `A:${path.endpointId}-${path.clusterId}-${path.attributeName}`;
}

function eventPathToString(path: { endpointId: EndpointNumber; clusterId: ClusterId; eventName: string }): string {
    return `E:${path.endpointId}-${path.clusterId}-${path.eventName}`;
}

/** Base class to map an ioBroker device to a matter device. */
export abstract class GenericDeviceToIoBroker<C extends CustomStatesRecord = EmptyCustomStates> {
    readonly #adapter: MatterAdapter;
    readonly baseId: string;
    readonly #node: PairedNode;
    protected readonly appEndpoint: Endpoint;
    readonly #rootEndpoint: Endpoint;
    readonly #behaviorIdCache = new Map<string, string | undefined>();
    #name?: string;
    #defaultName: string;
    readonly deviceType: string;
    readonly #deviceOptions: DeviceOptions;
    #enabledAttributeProperties = new Map<PropertyType, EnabledAttributeProperty>();
    #enabledEventProperties = new Map<PropertyType, EnabledEventProperty[]>();
    #matterMappings = new Map<string, PropertyType | ((value: any) => MaybePromise<any>)>();
    #connectionStateId: string;
    #hasBridgedReachabilityAttribute = false;
    #pollTimeout?: ioBroker.Timeout;
    #destroyed = false;
    #initialized = false;
    #pollInterval?: number;
    #hasAttributesToPoll = false;
    /** Tracks in-progress changeHandler calls: property → value currently being handled */
    #inProgressChangeHandlers = new Map<PropertyType, unknown>();
    /** Tracks in-progress custom changeHandler calls: customPropertyName → value currently being handled */
    #inProgressCustomChangeHandlers = new Map<string, unknown>();

    /** Custom state definitions passed to this converter */
    protected readonly customStateDefinitions: C;
    /** Enabled custom attribute properties - keyed by custom property name */
    #enabledCustomAttributeProperties = new Map<string, EnabledCustomAttributeProperty>();
    /** Matter path mappings for custom states - maps path to custom property name or handler */
    #customMatterMappings = new Map<string, string | ((value: any) => MaybePromise<any>)>();

    protected constructor(
        adapter: MatterAdapter,
        node: PairedNode,
        endpoint: Endpoint,
        rootEndpoint: Endpoint,
        endpointDeviceBaseId: string,
        deviceTypeName: string,
        defaultConnectionStateId: string,
        defaultName: string,
        customStateDefinitions?: C,
    ) {
        this.#adapter = adapter;
        this.#node = node;
        this.appEndpoint = endpoint;
        this.#rootEndpoint = rootEndpoint;
        this.baseId = endpointDeviceBaseId;
        this.#defaultName = defaultName;
        this.deviceType = deviceTypeName;
        this.#connectionStateId = defaultConnectionStateId;
        this.customStateDefinitions = customStateDefinitions ?? ({} as C);

        this.#deviceOptions = {
            additionalStateData: {},
            uuid: '',
            enabled: true,
            name: this.#name || deviceTypeName,
            oid: this.baseId,
            type: '...',
            auto: true,
            noComposed: true,
        };
    }

    /** Return the ioBroker device this mapping is for. */
    abstract ioBrokerDevice: GenericDevice;

    get ioBrokerDeviceType(): string | undefined {
        return this.ioBrokerDevice.deviceType;
    }

    get iconDeviceType(): string | undefined {
        return this.ioBrokerDevice.deviceType;
    }

    get name(): string {
        return this.#name ?? this.#defaultName ?? this.deviceType;
    }

    get number(): EndpointNumber {
        return this.appEndpoint.number;
    }

    get connectionStateId(): string {
        return this.#connectionStateId;
    }

    get nodeBasicInformation(): Record<string, unknown> {
        return this.#node.basicInformation ?? {};
    }

    get node(): PairedNode {
        return this.#node;
    }

    /**
     * Method to override to add own states to the device.
     * This method is called by the constructor.
     */
    protected enableDeviceTypeStates(): DeviceOptions {
        this.enableDeviceTypeStateForAttribute(PropertyType.Unreachable, {
            endpointId: EndpointNumber(0),
            clusterId: BasicInformation.id,
            attributeName: 'reachable',
            convertValue: value => !value,
        });
        if (!this.#enabledAttributeProperties.has(PropertyType.Unreachable)) {
            this.enableDeviceTypeStateForAttribute(PropertyType.Unreachable, {
                endpointId: this.appEndpoint.number,
                clusterId: BridgedDeviceBasicInformation.id,
                attributeName: 'reachable',
                convertValue: value => !value,
            });
            if (this.#enabledAttributeProperties.has(PropertyType.Unreachable)) {
                this.#hasBridgedReachabilityAttribute = true;
            }
        }
        // Check for PowerSource
        this.#enablePowerSourceStates();

        return this.#deviceOptions;
    }

    #enablePowerSourceStatesForEndpoint(endpoint: Endpoint): boolean {
        const powerSource = endpoint.maybeStateOf(PowerSourceClient);
        if (powerSource === undefined) {
            return false;
        }
        const endpointId = endpoint.number;
        this.enableDeviceTypeStateForAttribute(PropertyType.LowBattery, {
            endpointId,
            clusterId: PowerSource.id,
            attributeName: 'batChargeLevel',
            convertValue: value => value !== PowerSource.BatChargeLevel.Ok,
            pollAttribute: true,
        });
        this.enableDeviceTypeStateForAttribute(PropertyType.Battery, {
            endpointId,
            clusterId: PowerSource.id,
            attributeName: 'batPercentRemaining',
            convertValue: value => Math.round(value / 2),
            pollAttribute: true,
        });
        endpoint
            .eventsOf(PowerSourceClient)
            .batPercentRemaining$Changed?.on(() => this.#adapter.refreshControllerDevices());
        return true;
    }

    #enablePowerSourceStates(): void {
        if (!this.#enablePowerSourceStatesForEndpoint(this.appEndpoint)) {
            this.#enablePowerSourceStatesForEndpoint(this.#rootEndpoint);
        }
    }

    protected registerStateChangeHandlerForAttribute(
        data: {
            endpointId: EndpointNumber;
            clusterId: ClusterId;
            matterValueChanged: (value: any) => MaybePromise<any>;
        } & ({ vendorSpecificAttributeId: AttributeId } | { attributeName?: string }),
    ): void {
        const { endpointId, clusterId, matterValueChanged } = data;
        const attributeName =
            'vendorSpecificAttributeId' in data
                ? `unknownAttribute_${Diagnostic.hex(data.vendorSpecificAttributeId)}`
                : data.attributeName;
        if (attributeName !== undefined && !this.#attributeIsSupported(endpointId, clusterId, attributeName)) {
            return;
        }

        if (attributeName === undefined) {
            this.#adapter.log.warn(
                `No attribute name cound be determined for change handler for ${endpointId}/${clusterId}`,
            );
            return;
        }
        const pathId = attributePathToString({ endpointId, clusterId, attributeName });
        this.#matterMappings.set(pathId, matterValueChanged);
    }

    /**
     * Enable a state for a Matter attribute if it exists and the property type is supported.
     * Important: provide attributeName for all standard Matter properties OR provide attributeId for vendor specific properties.
     */
    protected enableDeviceTypeStateForAttribute(
        type: PropertyType,
        data?: {
            endpointId?: EndpointNumber;
            clusterId?: ClusterId;
            convertValue?: (value: any) => MaybePromise<any>;
            changeHandler?: (value: any) => MaybePromise<void> | void;
            pollAttribute?: boolean;
            modes?: { [key: string]: string };
        } & ({ vendorSpecificAttributeId: AttributeId } | { attributeName?: string | string[] }),
    ): void {
        const stateData = this.#deviceOptions.additionalStateData![type] ?? {};
        if (stateData.id !== undefined) {
            console.log(`State ${type} already enabled`);
            return;
        }

        if (data !== undefined) {
            const { endpointId, clusterId, convertValue, changeHandler, pollAttribute, modes } = data;
            let attributeId: AttributeId | undefined;
            const requestedAttributeName =
                'vendorSpecificAttributeId' in data
                    ? `unknownAttribute_${Diagnostic.hex(data.vendorSpecificAttributeId)}`
                    : data.attributeName;
            let attributeName = Array.isArray(requestedAttributeName)
                ? requestedAttributeName[0]
                : requestedAttributeName;
            if (endpointId !== undefined && clusterId !== undefined && requestedAttributeName !== undefined) {
                attributeName = this.#firstSupportedAttributeName(endpointId, clusterId, requestedAttributeName);
                if (attributeName === undefined) {
                    return;
                }

                attributeId = Matter.clusters(clusterId)?.attributes.find(m => camelize(m.name) === attributeName)
                    ?.id as AttributeId | undefined;
            }

            if (endpointId !== undefined && clusterId !== undefined && attributeName !== undefined) {
                const pathId = attributePathToString({ endpointId, clusterId, attributeName });
                this.#matterMappings.set(pathId, type);
            }
            this.#enabledAttributeProperties.set(type, {
                type: 'attribute',
                endpointId,
                clusterId,
                attributeId,
                attributeName,
                convertValue,
                changeHandler,
                pollAttribute,
            });

            if (modes !== undefined) {
                stateData.defaultStates = modes;
            }
        }

        stateData.id = `${this.baseId}.`;
        this.#deviceOptions.additionalStateData![type] = stateData;
    }

    /**
     * Enable a state for a Matter attribute if it exists and the property type is supported.
     * Important: provide attributeName for all standard Matter properties OR provide attributeId for vendor specific properties.
     */
    protected enableDeviceTypeStateForEvent(
        type: PropertyType,
        data: {
            endpointId: EndpointNumber;
            clusterId: ClusterId;
            convertValue: (property: PropertyType, event: DecodedEventData<any>) => MaybePromise<any>;
        } & ({ vendorSpecificEventId: EventId } | { eventName: string }),
    ): void {
        const { endpointId, clusterId, convertValue } = data;
        const stateData = this.#deviceOptions.additionalStateData![type] ?? {};

        let eventId: EventId | undefined;
        const eventName =
            'vendorSpecificEventId' in data
                ? `unknownEvent_${Diagnostic.hex(data.vendorSpecificEventId)}`
                : data.eventName;
        if (endpointId !== undefined && clusterId !== undefined && eventName !== undefined) {
            const clusterState = this.#getClusterState(endpointId, clusterId);
            if (!clusterState) {
                return;
            }

            eventId = Matter.clusters(clusterId)?.events.find(m => camelize(m.name) === eventName)?.id as
                | EventId
                | undefined;
        }

        if (stateData.id === undefined) {
            stateData.id = `${this.baseId}.`;
        }
        const pathId = eventPathToString({ endpointId, clusterId, eventName });
        this.#deviceOptions.additionalStateData![type] = stateData;
        if (this.#matterMappings.get(pathId)) {
            console.log(`State path ${pathId} already enabled, overwriting`);
        }
        this.#matterMappings.set(pathId, type);
        const knownEvents = this.#enabledEventProperties.get(type) ?? [];
        knownEvents.push({
            type: 'event',
            endpointId,
            clusterId,
            eventId,
            eventName,
            convertValue,
        });
        this.#enabledEventProperties.set(type, knownEvents);
    }

    /**
     * Enable a custom state for a Matter attribute.
     * Uses type-safe custom property names from the generic type parameter C.
     *
     * @param customPropertyName - The custom property name (must be a key in C)
     * @param data - Attribute mapping data (endpoint, cluster, attribute, converters)
     */
    protected enableCustomStateForAttribute<K extends CustomStateNames<C>>(
        customPropertyName: K,
        data?: {
            endpointId?: EndpointNumber;
            clusterId?: ClusterId;
            convertValue?: (value: any) => MaybePromise<any>;
            changeHandler?: (value: any) => MaybePromise<void> | void;
            pollAttribute?: boolean;
            common?: CustomStateCommon;
        } & ({ vendorSpecificAttributeId: AttributeId } | { attributeName?: string }),
    ): void {
        // Get definition from custom state definitions
        const definition = this.customStateDefinitions[customPropertyName] as CustomStateDefinition | undefined;
        if (!definition) {
            this.#adapter.log.warn(`Custom state definition not found for: ${customPropertyName}`);
            return;
        }

        // Check if already enabled
        if (this.#enabledCustomAttributeProperties.has(customPropertyName)) {
            this.#adapter.log.debug(`Custom state ${customPropertyName} already enabled`);
            return;
        }

        if (data !== undefined) {
            const { endpointId, clusterId, convertValue, changeHandler, pollAttribute, common } = data;
            let attributeId: AttributeId | undefined;
            const attributeName =
                'vendorSpecificAttributeId' in data
                    ? `unknownAttribute_${Diagnostic.hex(data.vendorSpecificAttributeId)}`
                    : data.attributeName;

            if (endpointId !== undefined && clusterId !== undefined && attributeName !== undefined) {
                if (!this.#attributeIsSupported(endpointId, clusterId, attributeName)) {
                    return;
                }
                attributeId = Matter.clusters(clusterId)?.attributes.find(m => camelize(m.name) === attributeName)
                    ?.id as AttributeId | undefined;
            }

            // Register the Matter path mapping
            if (endpointId !== undefined && clusterId !== undefined && attributeName !== undefined) {
                const pathId = attributePathToString({ endpointId, clusterId, attributeName });
                this.#customMatterMappings.set(pathId, customPropertyName);
            }

            // Store the enabled property
            this.#enabledCustomAttributeProperties.set(customPropertyName, {
                type: 'attribute',
                endpointId,
                clusterId,
                attributeId,
                attributeName,
                convertValue,
                changeHandler,
                pollAttribute,
                common,
            });
        }
    }

    /** Get the Matter state value for a custom property */
    getCustomMatterState(customPropertyName: string): any {
        const matterLocation = this.#enabledCustomAttributeProperties.get(customPropertyName);
        if (matterLocation === undefined || matterLocation.type !== 'attribute') {
            return;
        }
        const { endpointId, clusterId, attributeName } = matterLocation;
        if (endpointId === undefined || clusterId === undefined || attributeName === undefined) {
            return;
        }

        const clusterState = this.#getClusterState(endpointId, clusterId);
        if (!clusterState) {
            return;
        }
        return clusterState[attributeName];
    }

    /** Update an ioBroker custom state with a value from Matter */
    async updateCustomIoBrokerState(customPropertyName: string, value: any): Promise<void> {
        const properties = this.#enabledCustomAttributeProperties.get(customPropertyName);
        if (properties === undefined || properties.type !== 'attribute') {
            return;
        }
        const { convertValue } = properties;
        if (convertValue !== undefined) {
            value = await convertValue(value);
        }
        if (value !== undefined) {
            try {
                await this.ioBrokerDevice.updateCustomValue(customPropertyName, value);
            } catch (e) {
                this.#adapter.log.error(
                    `Error updating custom property ${customPropertyName} with value ${value}: ${e}`,
                );
            }
        }
    }

    /** Get enabled custom property names */
    get enabledCustomPropertyNames(): string[] {
        return Array.from(this.#enabledCustomAttributeProperties.keys());
    }

    getMatterState(property: PropertyType): any {
        const matterLocation = this.#enabledAttributeProperties.get(property);
        if (matterLocation === undefined || matterLocation.type !== 'attribute') {
            return;
        }
        const { endpointId, clusterId, attributeName } = matterLocation;
        if (endpointId === undefined || clusterId === undefined || attributeName === undefined) {
            return;
        }

        const clusterState = this.#getClusterState(endpointId, clusterId);
        if (!clusterState) {
            return;
        }
        return clusterState[attributeName];
    }

    async updateIoBrokerState(property: PropertyType, value: any): Promise<void> {
        const properties = this.#enabledAttributeProperties.get(property);
        if (properties === undefined || properties.type !== 'attribute') {
            return;
        }
        const { convertValue } = properties;
        if (convertValue !== undefined) {
            value = await convertValue(value);
        }
        if (value !== undefined) {
            try {
                await this.ioBrokerDevice.updatePropertyValue(property, value);
            } catch (e) {
                this.#adapter.log.error(`Error updating property ${property} with value ${value}: ${e}`);
            }

            if (property === PropertyType.Unreachable && this.#hasBridgedReachabilityAttribute) {
                await this.#adapter.setState(this.#connectionStateId, { val: !value, ack: true });
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
        const pathId = attributePathToString(data);

        // Check standard property mappings first
        const pathProperty = this.#matterMappings.get(pathId);
        if (pathProperty !== undefined) {
            if (typeof pathProperty === 'function') {
                await pathProperty(data.value);
                return;
            }
            await this.updateIoBrokerState(pathProperty, data.value);
            return;
        }

        // Check custom state mappings
        const customProperty = this.#customMatterMappings.get(pathId);
        if (customProperty !== undefined) {
            if (typeof customProperty === 'function') {
                await customProperty(data.value);
                return;
            }
            await this.updateCustomIoBrokerState(customProperty, data.value);
        }
    }

    async handleTriggeredEvent(data: {
        clusterId: ClusterId;
        endpointId: EndpointNumber;
        eventId: EventId;
        eventName: string;
        events: DecodedEventData<any>[];
    }): Promise<void> {
        const pathId = eventPathToString(data);
        const pathProperty = this.#matterMappings.get(pathId);
        if (pathProperty === undefined) {
            return;
        }
        if (typeof pathProperty === 'function') {
            for (const event of data.events) {
                await pathProperty(event);
            }
            return;
        }
        const propertyHandlers = this.#enabledEventProperties.get(pathProperty);
        if (propertyHandlers === undefined) {
            return;
        }
        for (const { convertValue } of propertyHandlers) {
            for (const event of data.events) {
                const value = await convertValue(pathProperty, event);
                if (value !== undefined) {
                    try {
                        await this.ioBrokerDevice.updatePropertyValue(pathProperty, value);
                    } catch (e) {
                        this.#adapter.log.error(`Error updating property ${pathProperty} with value ${value}: ${e}`);
                    }
                }
            }
        }
    }

    /** Initialization Logic for the device. makes sure all handlers are registered for both sides. */
    async init(delayStateInit = false): Promise<void> {
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
        if (!delayStateInit) {
            await this.initializeStates();
        }

        if (this.#name === undefined) {
            this.#name = this.#defaultName;
        }

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
                val: this.appEndpoint.maybeStateOf(BridgedDeviceBasicInformationClient)?.reachable ?? false,
                ack: true,
            });
        }

        if (!existingObject || existingObject.common.statusStates?.onlineId !== this.#connectionStateId) {
            await this.#adapter.extendObjectAsync(this.baseId, {
                common: {
                    statusStates: {
                        onlineId: `${this.#connectionStateId}`,
                    },
                },
            });
        }

        this.#initialized = true;
    }

    #registerIoBrokerHandlersAndInitialize(): void {
        // install ioBroker listeners
        // here we react on changes from the ioBroker side for onOff and current lamp level
        this.ioBrokerDevice.onChange(async (event: { property: PropertyType; value: unknown }) => {
            const matterLocation = this.#enabledAttributeProperties.get(event.property);
            if (matterLocation === undefined || matterLocation.type !== 'attribute') {
                return;
            }
            const { changeHandler } = matterLocation;
            if (changeHandler === undefined) {
                return;
            }
            if (event.value === undefined) {
                return;
            }
            // Skip duplicate: same property with same value is already being handled
            if (
                this.#inProgressChangeHandlers.has(event.property) &&
                this.#inProgressChangeHandlers.get(event.property) === event.value
            ) {
                this.#adapter.log.info(
                    `Skipping duplicate change event for ${event.property} with value ${JSON.stringify(event.value)} (handler already in progress)`,
                );
                return;
            }
            this.#adapter.log.debug(
                `Handle change event for ${event.property} with value ${JSON.stringify(event.value)}`,
            );
            this.#inProgressChangeHandlers.set(event.property, event.value);
            try {
                await changeHandler(event.value);
            } finally {
                this.#inProgressChangeHandlers.delete(event.property);
            }
        });

        // Handle custom state changes from ioBroker side
        this.ioBrokerDevice.onCustomChange(async (event: { customPropertyName: string; value: unknown }) => {
            const matterLocation = this.#enabledCustomAttributeProperties.get(event.customPropertyName);
            if (matterLocation === undefined || matterLocation.type !== 'attribute') {
                return;
            }
            const { changeHandler } = matterLocation;
            if (changeHandler === undefined) {
                return;
            }
            if (event.value === undefined) {
                return;
            }
            // Skip duplicate: same custom property with same value is already being handled
            if (
                this.#inProgressCustomChangeHandlers.has(event.customPropertyName) &&
                this.#inProgressCustomChangeHandlers.get(event.customPropertyName) === event.value
            ) {
                this.#adapter.log.info(
                    `Skipping duplicate custom change event for ${event.customPropertyName} with value ${JSON.stringify(event.value)} (handler already in progress)`,
                );
                return;
            }
            this.#adapter.log.debug(
                `Handle custom change event for ${event.customPropertyName} with value ${JSON.stringify(event.value)}`,
            );
            this.#inProgressCustomChangeHandlers.set(event.customPropertyName, event.value);
            try {
                await changeHandler(event.value);
            } finally {
                this.#inProgressCustomChangeHandlers.delete(event.customPropertyName);
            }
        });
    }

    /** Initialize the states of the ioBroker device with the current values from the matter device. */
    async initializeStates(): Promise<void> {
        // Initialize standard property states
        for (const property of this.#enabledAttributeProperties.keys()) {
            const value = this.getMatterState(property);
            if (value !== undefined) {
                await this.updateIoBrokerState(property, value);
            }
        }

        // Initialize custom states
        for (const [customPropertyName, property] of this.#enabledCustomAttributeProperties.entries()) {
            // Initialize the custom state in the device
            await this.ioBrokerDevice.initCustomState(customPropertyName, `${this.baseId}.`, property.common);

            // Set initial value from Matter
            const value = this.getCustomMatterState(customPropertyName);
            if (value !== undefined) {
                await this.updateCustomIoBrokerState(customPropertyName, value);
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
            attributeName?: string;
        }>();

        // Add standard property attributes for polling
        for (const property of this.#enabledAttributeProperties.values()) {
            if (property.type === 'attribute' && property.pollAttribute) {
                const { endpointId, clusterId, attributeId, attributeName } = property;
                if (endpointId !== undefined && clusterId !== undefined && attributeId !== undefined) {
                    pollingAttributes.push({ endpointId, clusterId, attributeId, attributeName });
                }
            }
        }

        // Add custom state attributes for polling
        for (const property of this.#enabledCustomAttributeProperties.values()) {
            if (property.type === 'attribute' && property.pollAttribute) {
                const { endpointId, clusterId, attributeId, attributeName } = property;
                if (endpointId !== undefined && clusterId !== undefined && attributeId !== undefined) {
                    pollingAttributes.push({ endpointId, clusterId, attributeId, attributeName });
                }
            }
        }

        if (pollingAttributes.length) {
            this.#hasAttributesToPoll = true;
            this.#pollTimeout = this.#adapter.setTimeout(
                () => this.#pollAttributes(pollingAttributes),
                this.pollInterval,
            );
        }
    }

    get pollInterval(): number {
        return this.#pollInterval ?? (this.#node.deviceInformation?.isBatteryPowered ? 24 * 60 * 60_000 : 60_000);
    }

    async #pollAttributes(
        attributes: {
            endpointId: EndpointNumber;
            clusterId: ClusterId;
            attributeId: AttributeId;
            attributeName?: string;
        }[],
    ): Promise<void> {
        this.#pollTimeout = undefined;
        if (this.#destroyed || attributes.length === 0) {
            return;
        }

        if (this.#node.isConnected) {
            // Group by (endpointId, clusterId) → one remote read per cluster
            const groupMap = new Map<string, typeof attributes>();
            for (const attr of attributes) {
                const key = `${attr.endpointId}:${attr.clusterId}`;
                const group = groupMap.get(key) ?? [];
                group.push(attr);
                groupMap.set(key, group);
            }

            for (const [, group] of groupMap) {
                if (this.#destroyed) {
                    return;
                }
                const { endpointId, clusterId } = group[0];
                const behaviorId = this.#getBehaviorId(endpointId, clusterId);
                if (!behaviorId) {
                    continue;
                }

                const ep = endpointId === 0 ? this.#rootEndpoint : this.appEndpoint;
                try {
                    const clusterState = (await (ep as any).getStateOf(behaviorId)) as Record<string, any>;
                    for (const attr of group) {
                        if (attr.attributeName === undefined) {
                            continue;
                        }
                        const value = clusterState[attr.attributeName];
                        if (value === undefined) {
                            continue;
                        }
                        await this.handleChangedAttribute({
                            clusterId: attr.clusterId,
                            endpointId: attr.endpointId,
                            attributeId: attr.attributeId,
                            attributeName: attr.attributeName,
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

        if (!this.#destroyed) {
            this.#pollTimeout = this.#adapter.setTimeout(() => this.#pollAttributes(attributes), this.pollInterval);
        }
    }

    async destroy(): Promise<void> {
        this.#destroyed = true;
        if (this.#pollTimeout !== undefined) {
            this.#adapter.clearTimeout(this.#pollTimeout);
            this.#pollTimeout = undefined;
        }
        if (this.#hasBridgedReachabilityAttribute) {
            await this.#adapter.setState(this.#connectionStateId, { val: false, ack: true });
        }
        return this.ioBrokerDevice.destroy();
    }

    hasIdentify(): boolean {
        return !!this.appEndpoint.behaviors.supported.identify;
    }

    async identify(identifyTime = 10): Promise<void> {
        await this.appEndpoint.commandsOf(IdentifyClient)?.identify({ identifyTime });
    }

    async rename(name: string): Promise<void> {
        this.#name = name;
        await this.#adapter.extendObjectAsync(this.baseId, { common: { name } });
    }

    #addPowerSourceStates(endpoint: Endpoint): Record<string, unknown> | undefined {
        const states: Record<string, unknown> = {};

        const powerSource = endpoint.maybeStateOf(PowerSourceClient);
        if (powerSource === undefined) {
            return undefined;
        }
        states.__header__powersourcedetails = 'Power Source Details';

        if (powerSource.batQuantity !== undefined && powerSource.batReplacementDescription !== undefined) {
            states.includedBattery = `${powerSource.batQuantity} x ${powerSource.batReplacementDescription}`;
        }
        const voltage = powerSource.batVoltage;
        const percentRemaining = powerSource.batPercentRemaining;

        if (typeof voltage === 'number') {
            states.batteryVoltage = `${(voltage / 1_000).toFixed(2)} V${typeof percentRemaining === 'number' ? ` (${Math.round(percentRemaining / 2)}%)` : ''}`;
        } else if (typeof percentRemaining === 'number') {
            states.batteryVoltage = `${Math.round(percentRemaining / 2)}%`;
        }

        if (!states.includedBattery && !states.batteryVoltage) {
            delete states.__header__powersourcedetails;
        } else if (Array.isArray(powerSource.endpointList)) {
            states.__header__powersourcedetails = 'Power Source Details';
            states.providesPowerForTheseEndpoints = powerSource.endpointList.join(', ');
        }
        return states;
    }

    getMatterStates(): Record<string, unknown> {
        return this.#addPowerSourceStates(this.appEndpoint) ?? this.#addPowerSourceStates(this.#rootEndpoint) ?? {};
    }

    getDeviceDetails(nodeConnected: boolean): StructuredJsonFormData {
        const result: StructuredJsonFormData = {};

        const states = this.ioBrokerDevice.getStates();
        if (Object.keys(states).length) {
            result.states = {
                __header__details: 'Mapped ioBroker States',
                ...states,
            };
        }

        result.details = {
            __header__details: 'Device Details',
            name: this.#name,
            primaryDeviceType: this.deviceType,
            deviceTypes: ((this.appEndpoint as any).stateOf(DescriptorClient)?.deviceTypeList ?? [])
                .map(({ deviceType }: { deviceType: number }) => {
                    const name = Matter.deviceTypes(deviceType)?.name;
                    return name !== undefined ? `${name} (${toHex(deviceType)})` : toHex(deviceType);
                })
                .join(', '),
            endpoint: this.appEndpoint.number,
            ...(nodeConnected ? this.getMatterStates() : {}),
        };

        result.matterClusters = {};
        for (const [behaviorId, BehaviorType] of Object.entries(this.appEndpoint.behaviors.supported)) {
            if (!ClusterBehavior.is(BehaviorType)) {
                continue;
            }
            const clusterState = (this.appEndpoint.state as any)[behaviorId];
            if (!clusterState) {
                continue;
            }
            const featureMap: Record<string, boolean> = clusterState.featureMap ?? {};
            const activeFeatures = Object.entries(featureMap)
                .filter(([, v]) => v === true)
                .map(([k]) => decamelize(k));
            result.matterClusters[`__header__${behaviorId}`] = decamelize(behaviorId);
            result.matterClusters[`${behaviorId}__Features`] = activeFeatures.length
                ? activeFeatures.join(', ')
                : 'no explicit feature set';
            result.matterClusters[`${behaviorId}__Revision`] = clusterState.clusterRevision;
        }

        return result;
    }

    get deviceConfiguration(): { pollInterval?: number } {
        return {
            pollInterval: this.#hasAttributesToPoll ? Math.round(this.pollInterval / 1000) : undefined,
        };
    }

    setDeviceConfiguration(config: GenericDeviceConfiguration): void {
        const { pollInterval } = config;
        if (pollInterval !== undefined) {
            if (isNaN(pollInterval) || pollInterval < 30 || pollInterval > 2_147_482) {
                this.#adapter.log.warn(
                    `Invalid polling interval ${pollInterval} seconds, use former value of ${Math.round(this.pollInterval / 1000)}.`,
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

    #getBatteryStatus(endpoint: Endpoint): number | string | undefined {
        const powerSource = endpoint.maybeStateOf(PowerSourceClient);
        if (powerSource === undefined) {
            return undefined;
        }
        if (powerSource.batChargeState === PowerSource.BatChargeState.IsCharging) {
            return 'charging';
        }
        const voltage = powerSource.batVoltage;
        const percentRemaining = powerSource.batPercentRemaining;

        if (typeof percentRemaining === 'number') {
            return Math.round(percentRemaining / 2);
        } else if (typeof voltage === 'number') {
            return `${voltage}mV`;
        }
    }

    /**
     * Whether the paired device actually supports the attribute. The state key is present for every
     * schema attribute, but non-conformant devices leave unsupported optional attributes undefined -
     * so check the value, not just key presence (supported nullable attributes read null).
     */
    #attributeIsSupported(endpointId: EndpointNumber, clusterId: ClusterId, attributeName: string): boolean {
        const clusterState = this.#getClusterState(endpointId, clusterId);
        return clusterState !== undefined && clusterState[attributeName] !== undefined;
    }

    /**
     * Resolve the attribute name to use when a state maps to several candidate attributes that depend
     * on the cluster feature set (e.g. activeCurrent vs rmsCurrent). Returns the first candidate the
     * device actually supports, or undefined when none is supported.
     */
    #firstSupportedAttributeName(
        endpointId: EndpointNumber,
        clusterId: ClusterId,
        attributeName: string | string[],
    ): string | undefined {
        const candidates = Array.isArray(attributeName) ? attributeName : [attributeName];
        return candidates.find(name => this.#attributeIsSupported(endpointId, clusterId, name));
    }

    #getClusterState(endpointId: EndpointNumber, clusterId: ClusterId): Record<string, any> | undefined {
        const behaviorId = this.#getBehaviorId(endpointId, clusterId);
        if (behaviorId === undefined) {
            return undefined;
        }
        const ep = endpointId === 0 ? this.#rootEndpoint : this.appEndpoint;
        return (ep.state as any)[behaviorId];
    }

    #getBehaviorId(endpointId: EndpointNumber, clusterId: ClusterId): string | undefined {
        const cacheKey = `${endpointId}:${clusterId}`;
        if (this.#behaviorIdCache.has(cacheKey)) {
            return this.#behaviorIdCache.get(cacheKey);
        }
        const ep = endpointId === 0 ? this.#rootEndpoint : this.appEndpoint;
        let behaviorId: string | undefined;
        for (const [id, BehaviorType] of Object.entries(ep.behaviors.supported)) {
            if (ClusterBehavior.is(BehaviorType) && BehaviorType.cluster.id === clusterId) {
                behaviorId = id;
                break;
            }
        }
        this.#behaviorIdCache.set(cacheKey, behaviorId);
        return behaviorId;
    }

    getStatus(nodeStatus: DeviceStatus): DeviceStatus {
        const status: DeviceStatus = {
            connection: typeof nodeStatus === 'object' ? nodeStatus.connection : nodeStatus,
        };

        if (status.connection === 'connected') {
            status.battery = this.#getBatteryStatus(this.appEndpoint) ?? this.#getBatteryStatus(this.#rootEndpoint);
        }
        return status;
    }
}
