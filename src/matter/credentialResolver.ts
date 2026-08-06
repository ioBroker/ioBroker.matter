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

/**
 * Whether any credential set is complete enough to push during BLE commissioning — the default scalars or
 * any named entry. Resolved through the same functions commissioning uses, so the two cannot disagree about
 * what counts as configured: a user whose only network is a named entry still gets BLE.
 */
export function hasAnyCommissioningCredential(config: MatterControllerConfig): boolean {
    if (resolveWifiCredential(config) !== undefined || resolveThreadCredential(config) !== undefined) {
        return true;
    }
    return (
        (config.additionalWifiCredentials ?? []).some(entry => resolveWifiCredential(config, entry.id) !== undefined) ||
        (config.additionalThreadCredentials ?? []).some(
            entry => resolveThreadCredential(config, entry.id) !== undefined,
        )
    );
}
