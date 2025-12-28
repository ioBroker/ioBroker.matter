import type { Endpoint as LegacyEndpoint } from '@project-chip/matter.js/device';
import {
    type ClusterServer,
    SupportedAttributeClient,
    UnknownSupportedAttributeClient,
} from '@project-chip/matter.js/cluster';
import type { ClusterClientObj } from '@matter/main/protocol';
import { Diagnostic, serialize } from '@matter/main';
import { GlobalAttributes } from '@matter/main/types';

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

    clusterServerFilter?: (endpoint: LegacyEndpoint, cluster: ClusterServer) => boolean;
    clusterClientFilter?: (endpoint: LegacyEndpoint, cluster: ClusterClientObj) => boolean;
    endpointFilter?: (endpoint: LegacyEndpoint) => boolean;
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

function logControllerClusterServer(
    endpoint: LegacyEndpoint,
    clusterServer: ClusterServer,
    options: EndpointLoggingOptions = {},
): NestedArray<string> {
    if (options.clusterServerFilter !== undefined && !options.clusterServerFilter(endpoint, clusterServer)) {
        return [''];
    }

    return [`Cluster-Client "${clusterServer.name}"`];
}

function logControllerClusterClient(
    endpoint: LegacyEndpoint,
    clusterClient: ClusterClientObj,
    options: EndpointLoggingOptions = {},
): NestedArray<string> {
    if (options.clusterClientFilter !== undefined && !options.clusterClientFilter(endpoint, clusterClient)) {
        return '';
    }

    const result = new Array<NestedArray<string>>();

    const { supportedFeatures: features } = clusterClient;
    const globalAttributes = GlobalAttributes<any>(features);
    const supportedFeatures = new Array<string>();
    for (const featureName in features) {
        if (features[featureName] === true) {
            supportedFeatures.push(featureName);
        }
    }

    result.push(
        `Cluster-Server "${clusterClient.name}" (${Diagnostic.hex(clusterClient.id)}) ${
            supportedFeatures.length ? `(Features: ${supportedFeatures.join(', ')})` : ''
        }`,
    );
    if (options.logClusterGlobalAttributes !== false) {
        const subResult = new Array<NestedArray<string>>();
        subResult.push('Global-Attributes:');
        const subSub = new Array<string>();
        for (const attributeName in globalAttributes) {
            const attribute = clusterClient.attributes[attributeName];
            if (attribute === undefined) {
                continue;
            }

            subSub.push(`"${attribute.name}" (${Diagnostic.hex(attribute.id)})`);
        }
        subResult.push(subSub);
        result.push(subResult);
    }
    if (options.logClusterAttributes !== false) {
        const subResult = new Array<NestedArray<string>>();
        subResult.push('Attributes:');
        const subSub = new Array<string>();
        for (const attributeName in clusterClient.attributes) {
            if (attributeName in globalAttributes) {
                continue;
            }
            const attribute = clusterClient.attributes[attributeName];
            if (attribute === undefined) {
                continue;
            }
            const supported = attribute instanceof SupportedAttributeClient;
            if (!supported && options.logNotSupportedClusterAttributes === false) {
                continue;
            }
            const unknown = attribute instanceof UnknownSupportedAttributeClient;

            let info = '';
            if (!supported) {
                info += ' (Not Supported)';
            }
            if (unknown) {
                info += ' (Unknown)';
            }

            subSub.push(
                `"${attribute.name}" = ${shortenString(serialize(attribute.getLocal()))} (${Diagnostic.hex(attribute.id)})${info}`,
            );
        }
        subResult.push(subSub);
        result.push(subResult);
    }
    if (options.logClusterCommands !== false) {
        const subResult = new Array<NestedArray<string>>();
        subResult.push('Commands:');
        const subSub = new Array<string>();
        for (const commandName in clusterClient.commands) {
            if (commandName.match(/^\d+$/)) {
                continue;
            }
            const supported = clusterClient.isCommandSupportedByName(commandName);
            if (!supported && options.logNotSupportedClusterCommands === false) {
                continue;
            }
            subSub.push(`"${commandName}"${supported ? '' : ' (Not Supported)'}`);
        }
        subResult.push(subSub);
        result.push(subResult);
    }
    if (options.logClusterEvents !== false) {
        const subResult = new Array<NestedArray<string>>();
        subResult.push('Events:');
        const subSub = new Array<string>();
        for (const eventName in clusterClient.events) {
            const event = clusterClient.events[eventName];
            if (event === undefined) {
                continue;
            }

            subSub.push(`"${event.name}" (${Diagnostic.hex(event.id)})`);
        }
        subResult.push(subSub);
        result.push(subResult);
    }
    return result;
}

function _logControllerEndpoint(
    endpoint: LegacyEndpoint,
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

    result.push(`Endpoint ${endpoint.number} (${endpoint.name}):`);
    if (options.logClusterServers !== false) {
        const subResult = new Array<NestedArray<string>>();
        subResult.push('Cluster-Servers:');
        for (const clusterServer of endpoint.getAllClusterServers()) {
            subResult.push(logControllerClusterServer(endpoint, clusterServer, options));
        }
        result.push(subResult);
    }
    if (options.logClusterClients !== false) {
        const subResult = new Array<NestedArray<string>>();
        subResult.push('Cluster-Clients:');
        for (const clusterClient of endpoint.getAllClusterClients()) {
            subResult.push(logControllerClusterClient(endpoint, clusterClient, options));
        }
        result.push(subResult);
    }
    if (options.logChildEndpoints !== false) {
        const subResult = new Array<NestedArray<string>>();
        subResult.push('Child-Endpoints:');
        for (const childEndpoint of endpoint.getChildEndpoints()) {
            subResult.push(logControllerEndpoint(childEndpoint, options));
        }
        result.push(subResult);
    }
    return result;
}

export function logControllerEndpoint(
    endpoint: LegacyEndpoint,
    options: EndpointLoggingOptions = {
        logNotSupportedClusterAttributes: false,
        logNotSupportedClusterEvents: false,
        logNotSupportedClusterCommands: false,
    },
): string {
    return arrayToString(_logControllerEndpoint(endpoint, options));
}

function arrayToString(array: NestedArray<string>, indent: string = ''): string {
    if (typeof array === 'string') {
        return `${indent}${array}`;
    }
    return array.map(item => arrayToString(item, `${indent}  `)).join('\n');
}
