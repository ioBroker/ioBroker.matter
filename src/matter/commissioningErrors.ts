import { DiscoveryError, NoDiscoveryTransportError } from '@matter/main';
import {
    DeviceAlreadyCommissionedToThisFabricError,
    DeviceAttestationError,
    PasscodeMismatchError,
    type AttestationFinding,
} from '@matter/main/protocol';

/** A commissioning failure the user can act on. The message doubles as the admin i18n key. */
export class CommissioningFailure extends Error {
    constructor(message: string, cause: unknown) {
        super(message, { cause });
        this.name = new.target.name;
    }
}

/** The device rejected the pairing code. */
export class WrongPairingCodeError extends CommissioningFailure {
    constructor(cause: unknown) {
        super('The pairing code is wrong', cause);
    }
}

/** The device attestation failed a check that matter.js does not leave to the attestation policy. */
export class AttestationRejectedError extends CommissioningFailure {
    constructor(cause: unknown) {
        super('The device attestation was rejected', cause);
    }
}

/** Discovery ended without a device that matched the pairing code. */
export class DeviceNotFoundError extends CommissioningFailure {
    constructor(cause: unknown) {
        super('The device was not found in the network', cause);
    }
}

/** The device already holds this controller's fabric. */
export class DeviceAlreadyCommissionedError extends CommissioningFailure {
    constructor(cause: unknown) {
        super('The device is already paired with this controller', cause);
    }
}

type FailureKind = 'attestation' | 'passcode' | 'alreadyCommissioned' | 'notFound';

/**
 * Commissioning without a known address tries every discovered device that matches the discriminator in
 * parallel and fails with an aggregate of all attempts. A manual code carries only a 4-bit discriminator, so
 * another device can be among them and fail for its own reason while the intended one failed for a different
 * one. An aggregate therefore has a kind only when every attempt has the same kind.
 */
function kindOf(error: unknown): FailureKind | undefined {
    if (error instanceof AggregateError) {
        const kinds = error.errors.map(kindOf);
        const [first] = kinds;
        return first !== undefined && kinds.every(kind => kind === first) ? first : undefined;
    }
    if (error instanceof DeviceAttestationError) {
        return 'attestation';
    }
    if (error instanceof PasscodeMismatchError) {
        return 'passcode';
    }
    if (error instanceof DeviceAlreadyCommissionedToThisFabricError) {
        return 'alreadyCommissioned';
    }
    // Without a scanner for any allowed transport, no device could have been found
    if (error instanceof DiscoveryError && !(error instanceof NoDiscoveryTransportError)) {
        return 'notFound';
    }
    return error instanceof Error && error.cause !== undefined ? kindOf(error.cause) : undefined;
}

/**
 * Maps a commissioning failure to the reason the user can act on, or `undefined` when the failure has no
 * dedicated reason and the original error should be reported as it is.
 */
export function classifyCommissioningFailure(error: unknown): CommissioningFailure | undefined {
    switch (kindOf(error)) {
        case 'attestation':
            return new AttestationRejectedError(error);
        case 'passcode':
            return new WrongPairingCodeError(error);
        case 'alreadyCommissioned':
            return new DeviceAlreadyCommissionedError(error);
        case 'notFound':
            return new DeviceNotFoundError(error);
        default:
            return undefined;
    }
}

/**
 * Whether commissioning at an address the caller supplied failed because nothing usable answered there, so
 * discovering the device is worth a try. A wrong code, a device that is already paired or a rejected
 * attestation fail the same way after discovery.
 */
export function isUnreachedAddress(error: unknown): boolean {
    const classified = classifyCommissioningFailure(error);
    return classified === undefined || classified instanceof DeviceNotFoundError;
}

/**
 * Attestation findings are logged and accepted, so a device with a test certificate or an unverifiable
 * attestation can still be paired, as it always could. matter.js accepts every finding when no policy is
 * set, but only for backward compatibility and with the intent to stop doing so.
 *
 * @param log receives one line per finding
 */
export function acceptAttestationFindings(log: (message: string) => void): (findings: AttestationFinding[]) => true {
    return (findings: AttestationFinding[]) => {
        for (const { level, type, message } of findings) {
            log(`Device attestation finding (${level}) ${type}: ${message}`);
        }
        return true;
    };
}
