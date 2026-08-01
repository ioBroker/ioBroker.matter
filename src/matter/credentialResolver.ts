import { DEFAULT_CREDENTIAL_ID, type MatterControllerConfig } from '../ioBrokerTypes';

export interface ResolvedWifiCredential {
    ssid: string;
    password: string;
}

export interface ResolvedThreadCredential {
    networkName: string;
    operationalDataset: string;
}

/**
 * Resolve the WiFi credential set to push during BLE commissioning. An absent or `default` id selects the
 * scalar controller config fields (legacy behavior); any other id selects a named entry from
 * `additionalWifiCredentials`. Returns undefined when the selected set is not fully configured.
 */
export function resolveWifiCredential(config: MatterControllerConfig, id?: string): ResolvedWifiCredential | undefined {
    if (!id || id === DEFAULT_CREDENTIAL_ID) {
        if (config.wifiSSID && config.wifiPassword) {
            return { ssid: config.wifiSSID, password: config.wifiPassword };
        }
        return undefined;
    }
    const entry = config.additionalWifiCredentials?.find(e => e.id === id);
    if (entry?.ssid && entry.password) {
        return { ssid: entry.ssid, password: entry.password };
    }
    return undefined;
}

/**
 * Resolve the Thread credential set to push during BLE commissioning. An absent or `default` id selects the
 * scalar controller config fields (legacy behavior); any other id selects a named entry from
 * `additionalThreadCredentials`. Returns undefined when the selected set is not configured.
 */
export function resolveThreadCredential(
    config: MatterControllerConfig,
    id?: string,
): ResolvedThreadCredential | undefined {
    if (!id || id === DEFAULT_CREDENTIAL_ID) {
        if (config.threadNetworkName !== undefined && config.threadOperationalDataSet !== undefined) {
            return {
                networkName: config.threadNetworkName,
                operationalDataset: config.threadOperationalDataSet,
            };
        }
        return undefined;
    }
    const entry = config.additionalThreadCredentials?.find(e => e.id === id);
    if (entry && entry.operationalDataset) {
        return { networkName: entry.networkName, operationalDataset: entry.operationalDataset };
    }
    return undefined;
}
