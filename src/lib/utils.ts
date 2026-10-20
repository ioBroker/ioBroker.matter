import { Bytes } from '@matter/main';
import { createHash } from 'crypto';

/** MD5 hash a string */
export function md5(str: string): string {
    return createHash('md5').update(str).digest('hex');
}

export function toUpperCaseHex(value: number | bigint, minimumLength = 4): string {
    return `0x${value.toString(16).padStart(minimumLength, '0').toUpperCase()}`;
}

export function toHex(value: number, minimumLength = 4): string {
    return `0x${value.toString(16).padStart(minimumLength, '0')}`;
}

export function decamelize(camlized: string): string {
    // Convert a camelized string like "nodeIdValue" into a normal string "Node Id Value"
    const str = camlized.replace(/([a-z])([A-Z])/g, '$1 $2');
    return str[0].toUpperCase() + str.slice(1);
}

export function bytesToMac(bytes: Bytes): string {
    return Bytes.toHex(bytes)
        .match(/.{1,2}/g)!
        .join(':');
}

export function bytesToIpV4(bytes: Bytes): string {
    return Array.from(Bytes.of(bytes)).join('.');
}

export function bytesToIpV6(bytes: Bytes): string {
    const data = Bytes.of(bytes);
    // Convert the byte array to an array of 8 groups of 16-bit numbers
    const groups = [];
    for (let i = 0; i < 16; i += 2) {
        groups.push(((data[i] << 8) | data[i + 1]).toString(16));
    }

    // Join the groups with colons
    const ipv6 = groups.join(':');

    // Compress the longest sequence of zeroes using "::"
    return ipv6.replace(/(?:^|:)0(:0)*(:|$)/, '::');
}

/**
 * Return a deep, JSON-serializable clone of a value, turning every `bigint` into its decimal string.
 *
 * Matter identifiers such as `NodeId` and `FabricId` are `bigint`. When a `controller*`/`device*`
 * command result that carries one is handed to `sendTo`, the js-controller states DB serializes the
 * callback with `JSON.stringify`, which throws `TypeError: Do not know how to serialize a BigInt` and
 * crashes the adapter (#916, same error class as #815). Running the result through this helper first
 * mirrors exactly that serialization - so nothing which would survive the wire is lost - while
 * rescuing bigints as strings, the way the GUI path in JsonConfigUtils already does.
 */
export function sanitizeBigIntForJson<T>(value: T): T {
    return JSON.parse(JSON.stringify(value, (_key, val) => (typeof val === 'bigint' ? val.toString() : val)));
}
