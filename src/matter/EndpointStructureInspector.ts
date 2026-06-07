import { Diagnostic, type Endpoint, type Behavior, type ClusterBehavior, serialize } from '@matter/main';
import { FeatureSet } from '@matter/main/model';
import { GlobalAttributes, VoidSchema } from '@matter/main/types';

export type EndpointLoggingOptions = {
    logClusterServers?: boolean;
    logClusterClients?: boolean;
    logChildEndpoints?: boolean;
    logClusterGlobalAttributes?: boolean;
    logClusterAttributes?: boolean;
    logNotSupportedClusterAttributes?: boolean;
    logClusterCommands?: boolean;
    logClusterEvents?: boolean;
    logNotSupportedClusterEvents?: boolean;
    logNotSupportedClusterCommands?: boolean;
    logAttributePrimitiveValues?: boolean;
    logAttributeObjectValues?: boolean;

    clusterServerFilter?: (endpoint: Endpoint, clusterName: string) => boolean;
    clusterClientFilter?: (endpoint: Endpoint, clusterName: string) => boolean;
    endpointFilter?: (endpoint: Endpoint) => boolean;
};

export type NestedArray<T> = T | Array<T> | Array<NestedArray<T>>;

/** Shortens a string by logging 2/3 of the maxLength, then "..." and the last 1/3 of the string. */
function shortenString(str?: string, maxLength = 150): string {
    if (str === undefined) {
        return 'undefined';
    }

    if (str.length <= maxLength) {
        return str;
    }
    const partLength = Math.floor(maxLength / 3);
    return `${str.slice(0, partLength)}...${str.slice(-partLength)}`;
}

function logServerClusterServer(
    endpoint: Endpoint,
    clusterName: string,
    type: Behavior.Type,
    options: EndpointLoggingOptions = {},
): NestedArray<string> {
    if (options.clusterServerFilter !== undefined && !options.clusterServerFilter(endpoint, clusterName)) {
        return [''];
    }
    const cluster = (type as ClusterBehavior.Type)?.cluster;

    const result = new Array<NestedArray<string>>();

    const features = new FeatureSet(cluster.supportedFeatures);
    const supportedFeatures = [...features.values()];
    const globalAttributes = GlobalAttributes<any>({});

    result.push(
        `Cluster-Server "${clusterName}" (${Diagnostic.hex(cluster.id)}) ${
            supportedFeatures.length ? `(Features: ${supportedFeatures.join(', ')})` : ''
        }`,
    );
    const elements = endpoint.behaviors.elementsOf(type);
    const state = endpoint.stateOf(type) as Record<string, unknown>;

    if (options.logClusterGlobalAttributes !== false) {
        const subResult = new Array<NestedArray<string>>();
        subResult.push('Global-Attributes:');
        const subSub = new Array<string>();
        for (const attributeName in globalAttributes) {
            if (!elements.attributes.has(attributeName)) {
                continue;
            }
            const attribute = cluster.attributes[attributeName];

            const value = state[attributeName];
            subSub.push(
                `"${attributeName}" (${Diagnostic.hex(attribute.id)})${value !== undefined ? `: value = ${shortenString(serialize(value))}` : ''}`,
            );
        }
        subResult.push(subSub);
        result.push(subResult);
    }
    if (options.logClusterAttributes !== false) {
        const subResult = new Array<NestedArray<string>>();
        subResult.push('Attributes:');
        const subSub = new Array<string>();
        for (const attributeName of elements.attributes) {
            if (attributeName in globalAttributes) {
                continue;
            }
            const attribute = cluster.attributes[attributeName];
            if (attribute === undefined) {
                continue;
            }

            const value = state[attributeName];
            subSub.push(
                `"${attributeName}" (${Diagnostic.hex(attribute.id)})${value !== undefined ? `: value = ${shortenString(serialize(value))}` : ''}`,
            );
        }
        subResult.push(subSub);
        result.push(subResult);
    }
    if (options.logClusterCommands !== false) {
        const subResult = new Array<NestedArray<string>>();
        subResult.push('Commands:');
        const subSub = new Array<string>();
        for (const commandName of elements.commands) {
            const command = cluster.commands[commandName];
            if (command === undefined) {
                continue;
            }
            subSub.push(
                `"${commandName}" (${Diagnostic.hex(cluster.commands[commandName].requestId)}${cluster.commands[commandName].responseSchema instanceof VoidSchema ? '' : `/${Diagnostic.hex(cluster.commands[commandName].responseId)}`})`,
            );
        }
        subResult.push(subSub);
        result.push(subResult);
    }
    if (options.logClusterEvents !== false) {
        const subResult = new Array<NestedArray<string>>();
        subResult.push('Events:');
        const subSub = new Array<string>();
        for (const eventName of elements.events) {
            const event = cluster.events[eventName];
            if (event === undefined) {
                continue;
            }
            subSub.push(`"${eventName}" (${Diagnostic.hex(event.id)})`);
        }
        subResult.push(subSub);
        result.push(subResult);
    }
    return result;
}

function _logServerEndpoint(
    endpoint: Endpoint,
    options: EndpointLoggingOptions = {
        logNotSupportedClusterAttributes: false,
        logNotSupportedClusterEvents: false,
        logNotSupportedClusterCommands: false,
    },
): NestedArray<string> {
    if (options.endpointFilter !== undefined && !options.endpointFilter(endpoint)) {
        return '';
    }

    const result = new Array<NestedArray<string>>();

    result.push(`Endpoint ${endpoint.number} (${endpoint.type.name} / ${endpoint.id}):`);
    if (options.logClusterServers !== false) {
        const subResult = new Array<NestedArray<string>>();
        subResult.push('Cluster-Servers:');
        for (const [name, type] of Object.entries(endpoint.behaviors.supported)) {
            if (!(type as ClusterBehavior.Type)?.cluster) {
                continue; // Skip non-cluster behaviors
            }
            subResult.push(logServerClusterServer(endpoint, name, type, options));
        }
        result.push(subResult);
    }
    /*if (options.logClusterClients !== false) {
        const subResult = new Array<NestedArray<string>>();
        subResult.push('Cluster-Clients:');
        for (const clusterClient of endpoint.getAllClusterClients()) {
            subResult.push(logServerClusterClient(endpoint, clusterClient, options));
        }
        result.push(subResult);
    }*/
    if (options.logChildEndpoints !== false) {
        const subResult = new Array<NestedArray<string>>();
        subResult.push('Child-Endpoints:');
        for (const childEndpoint of endpoint.parts) {
            subResult.push(logServerEndpoint(childEndpoint, options));
        }
        result.push(subResult);
    }
    return result;
}

export function logServerEndpoint(
    endpoint: Endpoint,
    options: EndpointLoggingOptions = {
        logNotSupportedClusterAttributes: false,
        logNotSupportedClusterEvents: false,
        logNotSupportedClusterCommands: false,
    },
): string {
    return arrayToString(_logServerEndpoint(endpoint, options));
}

function arrayToString(array: NestedArray<string>, indent: string = ''): string {
    if (typeof array === 'string') {
        return `${indent}${array}`;
    }
    return array.map(item => arrayToString(item, `${indent}  `)).join('\n');
}
