import { Bytes, Logger } from '@matter/main';
import { OperationalDataset } from '@matter/main/protocol';
import { type ThreadCredentialsRegistry } from '@matter/thread-br-client';

const logger = Logger.get('ThreadCredentials');

function formatDatasetForLog(ds: OperationalDataset): string {
    const fields = new Array<string>();
    fields.push(`xp=${ds.extPanId === undefined ? '?' : Bytes.toHex(ds.extPanId).toUpperCase()}`);
    fields.push(`network="${ds.networkName ?? ''}"`);
    if (ds.channel !== undefined) {
        fields.push(`ch=${ds.channel}`);
    }
    fields.push(`pskc=${ds.pskc !== undefined ? 'set' : 'missing'}`);
    fields.push(`networkKey=${ds.networkKey !== undefined ? 'set' : 'missing'}`);
    return fields.join(', ');
}

/**
 * Decode an operational-dataset hex string and register the derived Thread credentials. Returns the
 * parsed dataset on success. Logs only public dataset fields — never pskc/networkKey.
 */
export function registerThreadCredentialsFromHex(
    credentials: ThreadCredentialsRegistry,
    hex: string | undefined,
    source: string,
): OperationalDataset | undefined {
    if (hex === undefined || hex === '') {
        return undefined;
    }
    try {
        const ds = OperationalDataset.decode(hex);
        credentials.register(ds);
        logger.info(`Registered Thread credentials from ${source} (${formatDatasetForLog(ds)})`);
        return ds;
    } catch (e) {
        logger.warn(`Could not register Thread credentials from ${source}: ${e}`);
        return undefined;
    }
}

/**
 * Split an `OtbrRestCapability.baseUrl` (e.g. `http://[fd00::1]:8081`) into the host + port the
 * `OtbrRestClient` constructor expects. Square-bracketed IPv6 hosts are stripped — the client re-wraps them.
 */
export function parseRestBaseUrl(baseUrl: string): { host: string; port: number } {
    const url = new URL(baseUrl);
    let host = url.hostname;
    if (host.startsWith('[') && host.endsWith(']')) {
        host = host.slice(1, -1);
    }
    const port = url.port === '' ? 8081 : Number(url.port);
    return { host, port };
}
