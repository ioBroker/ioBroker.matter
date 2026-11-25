import { Bytes } from '@matter/main';
import { createHash } from 'crypto';

/** MD5 hash a string */
export function md5(str: string): string {
    return createHash('md5').update(str).digest('hex');
}

/**
 * The Matter SoftwareVersion for a semver version string: major, minor and patch as groups of three decimal digits,
 * so 1.3.1 becomes 1003001. Matter requires a newer version to have a larger SoftwareVersion (spec 11.1.5.10).
 * A pre-release suffix is ignored, and minor or patch values above 999 are not supported.
 * Returns 0 for a string that does not start with major.minor.patch.
 */
export function matterSoftwareVersion(version: string): number {
    const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
    if (match === null) {
        return 0;
    }
    const [, major, minor, patch] = match;
    return Number(major) * 1_000_000 + Number(minor) * 1_000 + Number(patch);
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
