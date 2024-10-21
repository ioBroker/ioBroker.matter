import { capitalize, ClusterId, Logger, serialize } from '@matter/main';
import { BasicInformationCluster } from '@matter/main/clusters';
import { AttributeModel, ClusterModel, CommandModel, DeviceTypeModel, MatterModel } from '@matter/main/model';
import {
    DecodedAttributeReportValue,
    DecodedEventReportValue,
    FabricScopeError,
    SupportedAttributeClient,
    UnknownSupportedAttributeClient,
} from '@matter/main/protocol';
import { GlobalAttributes } from '@matter/main/types';
import { Endpoint, NodeStates, PairedNode } from '@project-chip/matter.js/device';
import { SubscribeManager } from '../lib';
import { SubscribeCallback } from '../lib/SubscribeManager';
import type { MatterAdapter } from '../main';
import ioBrokerDeviceFabric from './from-matter/ioBrokerFactory';

const SystemClusters: ClusterId[] = [
    ClusterId(0x0004), // Groups
    ClusterId(0x0005), // Scenes
    ClusterId(0x001d), // Descriptor
    ClusterId(0x001e), // Binding
    ClusterId(0x001f), // Access Control
    ClusterId(0x002b), // Localization Configuration
    ClusterId(0x002c), // Time Format Localization
    ClusterId(0x002d), // Unit Localization
    ClusterId(0x002e), // Power Source Configuration
    ClusterId(0x0030), // General Commissioning
    ClusterId(0x0031), // Network Commissioning
    ClusterId(0x0032), // Diagnostic Logs
    ClusterId(0x0033), // General Diagnostics
    ClusterId(0x0034), // Software Diagnostics
    ClusterId(0x0035), // Thread Network ClusterId(Diagnostics
    ClusterId(0x0036), // Wi-Fi Network Diagnostics
    ClusterId(0x0037), // Ethernet Network Diagnostics
    ClusterId(0x0038), // Time Synchronization
    ClusterId(0x0039), // Bridged Device Basic Information
    ClusterId(0x003c), // Administrator Commissioning
    ClusterId(0x003e), // Node Operational Credentials
    ClusterId(0x003f), // Group Key Management
    ClusterId(0x0046), // ICD Management
    ClusterId(0x0062), // Scenes Management
];

function toHex(value: number, minimumLength = 4): string {
    return `0x${value.toString(16).padStart(minimumLength, '0')}`;
}

export class GeneralMatterNode {
    nodeId: string;
    nodeBaseId: string;
    connectionStateId: string;
    connectionStatusId: string;
    endpointMap = new Map<number, { baseId: string; endpoint: Endpoint }>();
    attributeTypeMap = new Map<string, ioBroker.CommonType>();
    eventMap = new Set<string>();
    subscriptions = new Map<string, SubscribeCallback>();

    constructor(
        protected readonly adapter: MatterAdapter,
        readonly node: PairedNode,
    ) {
        this.nodeId = node.nodeId.toString();
        this.nodeBaseId = `controller.${this.nodeId}`;
        this.connectionStateId = `${this.nodeBaseId}.info.connection`;
        this.connectionStatusId = `${this.nodeBaseId}.info.status`;
    }

    async initialize(): Promise<void> {
        const rootEndpoint = this.node.getRootEndpoint();
        if (rootEndpoint === undefined) {
            this.adapter.log.warn(`Node "${this.node.nodeId}" has not yet been initialized! Should not not happen`);
            return;
        }

        // create device
        const deviceObj: ioBroker.Object = {
            _id: this.nodeBaseId,
            type: 'folder',
            common: {
                name: this.nodeId,
                statusStates: {
                    onlineId: this.connectionStateId,
                },
            },
            native: {
                nodeId: this.nodeId,
            },
        };

        const info = this.node.getRootClusterClient(BasicInformationCluster);
        if (info !== undefined) {
            deviceObj.common.name = await info.getProductNameAttribute();
            deviceObj.native.vendorId = toHex(await info.getVendorIdAttribute());
            deviceObj.native.vendorName = await info.getVendorNameAttribute();
            deviceObj.native.productId = toHex(await info.getProductIdAttribute());
            deviceObj.native.nodeLabel = await info.getNodeLabelAttribute();
            deviceObj.native.productLabel = info.isAttributeSupportedByName('productLabel')
                ? await info.getProductLabelAttribute()
                : undefined;
            deviceObj.native.serialNumber = info.isAttributeSupportedByName('serialNumber')
                ? await info.getSerialNumberAttribute()
                : undefined;
        }

        await this.adapter.extendObject(deviceObj._id, deviceObj);

        await this.adapter.setObjectNotExists(`${this.nodeBaseId}.info`, {
            type: 'channel',
            common: {
                name: 'Node connection info',
            },
            native: {},
        });

        await this.adapter.setObjectNotExists(this.connectionStateId, {
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

        await this.adapter.setObjectNotExists(this.connectionStatusId, {
            type: 'state',
            common: {
                name: 'Connection status',
                role: 'state',
                type: 'number',
                states: {
                    [NodeStates.Connected]: 'connected',
                    [NodeStates.Disconnected]: 'disconnected',
                    [NodeStates.Reconnecting]: 'reconnecting',
                    [NodeStates.WaitingForDeviceDiscovery]: 'waitingForDeviceDiscovery',
                },
                read: true,
                write: false,
            },
            native: {},
        });

        await this.adapter.setState(this.connectionStateId, this.node.isConnected, true);
        await this.adapter.setState(this.connectionStatusId, this.node.state, true);

        await this.#processRootEndpointStructure(rootEndpoint);
    }

    // On Root level we create devices for all endpoints because these are devices
    async #processRootEndpointStructure(rootEndpoint: Endpoint): Promise<void> {
        // TODO make configurable if included or not
        //await this.#endpointToIoBrokerDevices(rootEndpoint);

        for (const childEndpoint of rootEndpoint.getChildEndpoints()) {
            await this.#endpointToIoBrokerDevices(childEndpoint, this.nodeBaseId);
        }
    }

    async #endpointToIoBrokerDevices(endpoint: Endpoint, baseId: string): Promise<void> {
        const id = endpoint.number;
        if (id === undefined) {
            this.adapter.log.warn(`Endpoint ${endpoint.name} has no number!`);
            return;
        }

        const deviceTypeModel = MatterModel.standard.get(DeviceTypeModel, endpoint.deviceType);
        const deviceTypeName = deviceTypeModel?.name ?? endpoint.name ?? 'Unknown';

        this.adapter.log.info(`Endpoint to ioBroker Devices ${endpoint.name} / ${deviceTypeName}`);

        const endpointDeviceBaseId = `${baseId}.${deviceTypeName}-${id}`;
        await this.adapter.setObjectNotExists(endpointDeviceBaseId, {
            type: 'device',
            common: {
                name: endpoint.name,
            },
            native: {
                nodeId: this.nodeId,
                endpointId: endpoint.number,
            },
        });

        if (deviceTypeModel === undefined) {
            this.adapter.log.warn(`Unknown device type: ${serialize(endpoint.deviceType)}. Please report this issue.`);
        }
        // An Aggregator device type has a slightly different structure
        else if (deviceTypeModel.name === 'Aggregator') {
            for (const childEndpoint of endpoint.getChildEndpoints()) {
                // Recursive call to process all sub endpoints for raw states
                await this.#endpointToIoBrokerDevices(childEndpoint, endpointDeviceBaseId);
            }
        } else {
            // TODO
            const ioBrokerDevice = await ioBrokerDeviceFabric(endpoint, endpointDeviceBaseId);
        }

        await this.#processEndpointRawDataStructure(endpoint, endpointDeviceBaseId);
    }

    async #processEndpointRawDataStructure(
        endpoint: Endpoint,
        endpointDeviceBaseId: string,
        path?: number[],
    ): Promise<void> {
        this.adapter.log.info(`${''.padStart((path?.length ?? 0) * 2)}Endpoint ${endpoint.number} (${endpoint.name}):`);

        const id = endpoint.number;
        if (id === undefined) {
            this.adapter.log.warn(`Endpoint ${endpoint.name} has no number!`);
            return;
        }
        const endpointPath = path === undefined ? [id] : [...path, id];

        await this.adapter.setObjectNotExists(`${endpointDeviceBaseId}.data`, {
            type: 'folder',
            common: {
                name: 'Raw endpoint data',
            },
            native: {},
        });

        await this.initializeEndpointRawDataStates(endpoint, endpointDeviceBaseId, endpointPath.join('-'));

        for (const childEndpoint of endpoint.getChildEndpoints()) {
            // Recursive call to process all sub endpoints for raw states
            await this.#processEndpointRawDataStructure(childEndpoint, endpointDeviceBaseId, endpointPath);
        }
    }

    #getAttributeMapId(endpointId: number, clusterId: number, attributeId: number): string {
        return `${endpointId}.${clusterId}.${attributeId}`;
    }

    #getEventMapId(endpointId: number, clusterId: number, eventId: number): string {
        return `${endpointId}.${clusterId}.${eventId}`;
    }

    #determineIoBrokerDatatype(
        endpointId: number,
        clusterId: number,
        attributeId: number,
        isUnknown: boolean,
    ): ioBroker.CommonType {
        const knownType = this.attributeTypeMap.get(this.#getAttributeMapId(endpointId, clusterId, attributeId));
        if (knownType !== undefined) return knownType;

        let type: ioBroker.CommonType;
        if (isUnknown) {
            type = 'mixed';
        } else {
            const attributeModel = MatterModel.standard.get(ClusterModel, clusterId)?.get(AttributeModel, attributeId);
            const effectiveType = attributeModel?.effectiveType;
            if (effectiveType === undefined) {
                type = 'mixed';
            } else if (effectiveType.startsWith('int') || effectiveType.startsWith('uint')) {
                if (effectiveType.endsWith('64')) return 'string';
                type = 'number';
            } else if (effectiveType === 'bool') {
                type = 'boolean';
            } else if (effectiveType === 'string') {
                type = 'string';
            } else {
                type = 'object';
            }
        }
        this.attributeTypeMap.set(this.#getAttributeMapId(endpointId, clusterId, attributeId), type);
        return type;
    }

    async initializeEndpointRawDataStates(
        endpoint: Endpoint,
        endpointDeviceBaseId: string,
        path: string,
    ): Promise<void> {
        if (endpoint.number === undefined) {
            this.adapter.log.warn(`Endpoint ${endpoint.name} has no number!`);
            return;
        }
        const endpointBaseId = `${endpointDeviceBaseId}.data.${path}`;

        this.endpointMap.set(endpoint.number, { baseId: endpointBaseId, endpoint });

        await this.adapter.setObjectNotExists(endpointBaseId, {
            type: 'folder',
            common: {
                name: path,
            },
            native: {},
        });

        // Ignore ClusterServers for now
        // Process ClusterClients
        const clusters = endpoint.getAllClusterClients();
        for (const clusterClient of clusters) {
            const clusterId = clusterClient.id;
            // TODO make Configurable
            if (SystemClusters.includes(clusterId)) continue;
            const clusterBaseId = `${endpointBaseId}.${toHex(clusterId)}`;

            await this.adapter.setObjectNotExists(clusterBaseId, {
                type: 'folder',
                common: {
                    name: clusterClient.name,
                },
                native: {
                    nodeId: this.nodeId,
                    endpointId: endpoint.number,
                    clusterId,
                },
            });

            const { supportedFeatures: features } = clusterClient;
            const globalAttributes = GlobalAttributes<any>(features);
            const supportedFeatures = new Array<string>();
            for (const featureName in features) {
                if (features[featureName] === true) supportedFeatures.push(featureName);
            }
            await this.adapter.setObjectNotExists(`${clusterBaseId}.supportedFeatures`, {
                type: 'state',
                common: {
                    name: 'Supported Features',
                    role: 'state',
                    type: 'string',
                    read: true,
                    write: false,
                },
                native: {},
            });
            await this.adapter.setState(`${clusterBaseId}.supportedFeatures`, supportedFeatures.join(', '), true);

            const attributes = clusterClient.attributes;
            let addedAttributes = 0;
            for (const attributeName in attributes) {
                const attribute = attributes[attributeName];
                if (attribute === undefined) continue;
                if (!(attribute instanceof SupportedAttributeClient)) continue;
                // TODO make Configurable
                if (attributeName in globalAttributes) continue;
                const unknown = attribute instanceof UnknownSupportedAttributeClient;
                const attributeBaseId = `${clusterBaseId}.attributes.${attribute.name.replace('unknownAttribute_', '')}`;

                const targetType = this.#determineIoBrokerDatatype(
                    endpoint.number,
                    attribute.clusterId,
                    attribute.id,
                    unknown,
                );
                await this.adapter.extendObject(attributeBaseId, {
                    type: 'state',
                    common: {
                        name: attribute.name,
                        role: 'state',
                        type: targetType,
                        read: true,
                        write: attribute.attribute.writable,
                    },
                    native: {},
                });
                addedAttributes++;

                if (this.node.isConnected) {
                    // Only request values when connected, else old values should still be current
                    try {
                        const attributeValue = await attribute.get(false); // Only use locally cached values, do not request from remote
                        await this.adapter.setState(
                            attributeBaseId,
                            this.#formatAttributeServerValue(endpoint.number, attributeValue, targetType),
                            true,
                        );
                    } catch (error) {
                        if (error instanceof FabricScopeError) {
                            this.adapter.log.warn('Fabric-Scoped');
                        } else {
                            this.adapter.log.warn(`Error: ${(error as any).message}`);
                        }
                    }
                }

                if (attribute.attribute.writable) {
                    const handler: SubscribeCallback = state => {
                        if (state.ack) return; // Only controls are processed
                        attribute
                            .set(state.val)
                            .catch(error => this.adapter.log.warn(`Error: ${(error as any).message}`));
                    };
                    this.subscriptions.set(attributeBaseId, handler);
                    await SubscribeManager.subscribe(`${this.adapter.namespace}.${attributeBaseId}`, handler);
                }
            }
            if (addedAttributes > 0) {
                await this.adapter.setObjectNotExists(`${clusterBaseId}.attributes`, {
                    type: 'folder',
                    common: {
                        name: 'Attributes',
                    },
                    native: {},
                });
            }

            let addedEvents = 0;
            const events = clusterClient.events;
            for (const eventName in events) {
                const event = events[eventName];
                if (event === undefined) continue;
                const eventBaseId = `${clusterBaseId}.events.${event.name}`;

                this.eventMap.add(this.#getEventMapId(endpoint.number, event.clusterId, event.id));
                await this.adapter.extendObject(eventBaseId, {
                    type: 'state',
                    common: {
                        name: event.name,
                        role: 'state',
                        type: 'object',
                        read: true,
                        write: false,
                    },
                    native: {},
                });
                addedEvents++;
            }
            if (addedEvents > 0) {
                await this.adapter.setObjectNotExists(`${clusterBaseId}.events`, {
                    type: 'folder',
                    common: {
                        name: 'Events',
                    },
                    native: {},
                });
            }

            let addedCommands = 0;
            const commands = clusterClient.commands;
            for (const commandName in commands) {
                if (!clusterClient.isCommandSupportedByName(commandName)) continue;
                const command = commands[commandName];
                if (command === undefined) continue;
                const commandBaseId = `${clusterBaseId}.commands.${commandName}`;

                const commandModel = MatterModel.standard
                    .get(ClusterModel, clusterId)
                    ?.get(CommandModel, capitalize(commandName));
                if (!commandModel) continue;

                const hasArguments = commandModel.children?.length > 0;

                await this.adapter.extendObject(commandBaseId, {
                    type: 'state',
                    common: {
                        name: command.name,
                        role: hasArguments ? 'state' : 'button',
                        type: hasArguments ? 'object' : 'boolean',
                        read: false,
                        write: true,
                    },
                    native: {},
                });

                const handler: SubscribeCallback = state => {
                    if (state.ack) return; // Only controls are processed

                    let parsedValue: any;
                    if (hasArguments) {
                        try {
                            parsedValue = JSON.parse(state.val as string);
                        } catch (error) {
                            try {
                                parsedValue = JSON.parse(`"${state.val}"`);
                            } catch (innerError) {
                                console.log(`ERROR: Could not parse value ${state.val} as JSON.`);
                                return;
                            }
                        }
                    } else {
                        parsedValue = undefined;
                    }

                    command(parsedValue, {
                        asTimedRequest: commandModel.effectiveAccess.timed,
                    }).catch(error => this.adapter.log.warn(`Error: ${(error as any).message}`));
                };
                this.subscriptions.set(commandBaseId, handler);
                await SubscribeManager.subscribe(`${this.adapter.namespace}.${commandBaseId}`, handler);
                addedCommands++;
            }
            if (addedCommands > 0) {
                await this.adapter.setObjectNotExists(`${clusterBaseId}.commands`, {
                    type: 'folder',
                    common: {
                        name: 'Commands',
                    },
                    native: {},
                });
            }
        }
    }

    async handleChangedAttribute(data: DecodedAttributeReportValue<any>): Promise<void> {
        const {
            path: { nodeId, clusterId, endpointId, attributeId, attributeName },
            value,
        } = data;
        this.adapter.log.debug(
            `attributeChangedCallback "${this.nodeId}": Attribute ${nodeId}/${endpointId}/${toHex(clusterId)}/${attributeName} changed to ${Logger.toJSON(
                value,
            )}`,
        );
        const targetType = this.attributeTypeMap.get(this.#getAttributeMapId(endpointId, clusterId, attributeId));
        const endpointBaseId = this.endpointMap.get(endpointId)?.baseId;
        if (targetType === undefined || endpointBaseId === undefined) {
            return;
        }
        await this.adapter.setState(
            `${endpointBaseId}.${toHex(clusterId)}.attributes.${attributeName.replace('unknownAttribute_', '')}`,
            this.#formatAttributeServerValue(endpointId, value, targetType),
            true,
        );
    }

    async handleChangedEvent(data: DecodedEventReportValue<any>): Promise<void> {
        const {
            path: { nodeId, clusterId, endpointId, eventId, eventName },
            events,
        } = data;
        this.adapter.log.debug(
            `eventTriggeredCallback "${this.nodeId}": Event ${nodeId}/${endpointId}/${toHex(clusterId)}/${eventName} triggered with ${Logger.toJSON(
                events,
            )}`,
        );
        if (!this.eventMap.has(this.#getEventMapId(endpointId, clusterId, eventId))) {
            return;
        }
        const endpointBaseId = this.endpointMap.get(endpointId)?.baseId;
        if (endpointBaseId === undefined) {
            return;
        }
        await this.adapter.setState(
            `${endpointBaseId}.${toHex(clusterId)}.events.${eventName}`,
            Logger.toJSON(events),
            true,
        );
    }

    async handleStateChange(state: NodeStates): Promise<void> {
        await this.adapter.setState(this.connectionStateId, state === NodeStates.Connected, true);
        await this.adapter.setState(this.connectionStatusId, state, true);

        switch (state) {
            case NodeStates.Connected:
                this.adapter.log.debug(`Node "${this.nodeId}" connected`);
                break;
            case NodeStates.Disconnected:
                this.adapter.log.debug(`Node "${this.nodeId}" disconnected`);
                break;
            case NodeStates.Reconnecting:
                this.adapter.log.debug(`Node "${this.nodeId}" reconnecting`);
                break;
            case NodeStates.WaitingForDeviceDiscovery:
                this.adapter.log.debug(`Node "${this.nodeId}" waiting for device discovery`);
                break;
        }
    }

    #formatAttributeServerValue(endpointId: number, attributeValue: any, targetType: ioBroker.CommonType): string {
        let value: any;
        if (attributeValue === null || attributeValue === undefined) {
            value = null;
        } else if (targetType === 'object') {
            value = Logger.toJSON(attributeValue);
        } else if (targetType === 'number') {
            if (typeof attributeValue === 'number') {
                value = attributeValue;
            } else {
                value = 'NaN';
            }
        } else if (targetType === 'boolean') {
            value = !!attributeValue;
        } else if (targetType === 'string') {
            value = attributeValue.toString();
        } else {
            if (typeof attributeValue === 'object') {
                value = Logger.toJSON(attributeValue);
            } else {
                value = attributeValue;
            }
        }
        return value;
    }

    async destroy(): Promise<void> {
        for (const [id, handler] of this.subscriptions) {
            await SubscribeManager.unsubscribe(`${this.adapter.namespace}.${id}`, handler);
        }
        this.subscriptions.clear();
    }
}
