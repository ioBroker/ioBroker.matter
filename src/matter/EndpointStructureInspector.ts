import {
    type EndpointInterface,
    type ClusterServer,
    type ClusterClientObj,
    type AnyAttributeServer,
    FabricScopeError,
    SupportedAttributeClient,
    UnknownSupportedAttributeClient,
} from '@matter/main/protocol';
import { Diagnostic } from '@matter/main';
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

    clusterServerFilter?: (endpoint: EndpointInterface, cluster: ClusterServer) => boolean;
    clusterClientFilter?: (endpoint: EndpointInterface, cluster: ClusterClientObj) => boolean;
    endpointFilter?: (endpoint: EndpointInterface) => boolean;
};

function getAttributeServerValue(attribute: AnyAttributeServer<any>, options: EndpointLoggingOptions = {}): string {
    let value = '';
    try {
        const attributeValue = attribute.getLocal();
        const attributeValueType = typeof attributeValue;
        if (
            (attributeValueType !== 'object' || attributeValue === null) &&
            options.logAttributePrimitiveValues !== false
        ) {
            value = attributeValue === null ? 'null' : attributeValue.toString();
        } else if (
            attributeValueType === 'object' &&
            attributeValue !== null &&
            options.logAttributeObjectValues !== false
        ) {
            value = Diagnostic.json(attributeValue);
        }
    } catch (error) {
        if (error instanceof FabricScopeError) {
            value = 'Fabric-Scoped';
        } else {
            value = `Error: ${error.message}`;
        }
    }
    return value;
}

export type NestedArray<T> = T | Array<T> | Array<NestedArray<T>>;

function logClusterServer(
    endpoint: EndpointInterface,
    clusterServer: ClusterServer,
    options: EndpointLoggingOptions = {},
): NestedArray<string> {
    if (options.clusterServerFilter !== undefined && !options.clusterServerFilter(endpoint, clusterServer)) {
        return [''];
    }

    const result = new Array<NestedArray<string>>();

    const featureMap = clusterServer.attributes.featureMap?.getLocal() ?? {};
    const globalAttributes = GlobalAttributes<any>(featureMap);
    const supportedFeatures = new Array<string>();
    for (const featureName in featureMap) {
        if (featureMap[featureName] === true) {
            supportedFeatures.push(featureName);
        }
    }
    result.push(
        `Cluster-Server "${clusterServer.name}" (${Diagnostic.hex(clusterServer.id)}) ${
            supportedFeatures.length ? `(Features: ${supportedFeatures.join(', ')})` : ''
        }`,
    );
    if (options.logClusterGlobalAttributes !== false) {
        const subResult = new Array<NestedArray<string>>();
        subResult.push('Global-Attributes:');
        const subSub = new Array<string>();
        for (const attributeName in globalAttributes) {
            const attribute = clusterServer.attributes[attributeName];
            if (attribute === undefined) {
                continue;
            }

            const value = getAttributeServerValue(attribute, options);
            subSub.push(
                `"${attribute.name}" (${Diagnostic.hex(attribute.id)})${value !== '' ? `: value = ${value}` : ''}`,
            );
        }
        subResult.push(subSub);
        result.push(subResult);
    }
    if (options.logClusterAttributes !== false) {
        const subResult = new Array<NestedArray<string>>();
        subResult.push('Attributes:');
        const subSub = new Array<string>();
        for (const attributeName in clusterServer.attributes) {
            if (attributeName in globalAttributes) {
                continue;
            }
            const attribute = clusterServer.attributes[attributeName];
            if (attribute === undefined) {
                continue;
            }

            const value = getAttributeServerValue(attribute, options);
            subSub.push(
                `"${attribute.name}" (${Diagnostic.hex(attribute.id)})${value !== '' ? `: value = ${value}` : ''}`,
            );
        }
        subResult.push(subSub);
        result.push(subResult);
    }
    if (options.logClusterCommands !== false) {
        const subResult = new Array<NestedArray<string>>();
        subResult.push('Commands:');
        const subSub = new Array<string>();
        const commands = clusterServer.commands;
        for (const commandName in commands) {
            const command = commands[commandName];
            if (command === undefined) {
                continue;
            }
            subSub.push(
                `"${command.name}" (${Diagnostic.hex(command.invokeId)}/${Diagnostic.hex(command.responseId)})`,
            );
        }
        subResult.push(subSub);
        result.push(subResult);
    }
    if (options.logClusterEvents !== false) {
        const subResult = new Array<NestedArray<string>>();
        subResult.push('Events:');
        const subSub = new Array<string>();
        const events = clusterServer.events;
        for (const eventName in events) {
            const event = events[eventName];
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

function logClusterClient(
    endpoint: EndpointInterface,
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
        `Cluster-Client "${clusterClient.name}" (${Diagnostic.hex(clusterClient.id)}) ${
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

            subSub.push(`"${attribute.name}" (${Diagnostic.hex(attribute.id)})${info}`);
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

function _logEndpoint(
    endpoint: EndpointInterface,
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
            subResult.push(logClusterServer(endpoint, clusterServer, options));
        }
        result.push(subResult);
    }
    if (options.logClusterClients !== false) {
        const subResult = new Array<NestedArray<string>>();
        subResult.push('Cluster-Clients:');
        for (const clusterClient of endpoint.getAllClusterClients()) {
            subResult.push(logClusterClient(endpoint, clusterClient, options));
        }
        result.push(subResult);
    }
    if (options.logChildEndpoints !== false) {
        const subResult = new Array<NestedArray<string>>();
        subResult.push('Child-Endpoints:');
        for (const childEndpoint of endpoint.getChildEndpoints()) {
            subResult.push(logEndpoint(childEndpoint, options));
        }
        result.push(subResult);
    }
    return result;
}

export function logEndpoint(
    endpoint: EndpointInterface,
    options: EndpointLoggingOptions = {
        logNotSupportedClusterAttributes: false,
        logNotSupportedClusterEvents: false,
        logNotSupportedClusterCommands: false,
    },
): string {
    return arrayToString(_logEndpoint(endpoint, options));
}

function arrayToString(array: NestedArray<string>, indent: string = ''): string {
    if (typeof array === 'string') {
        return `${indent}${array}`;
    }
    return array.map(item => arrayToString(item, `${indent}  `)).join('\n');
}
