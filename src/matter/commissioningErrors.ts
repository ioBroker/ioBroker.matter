import { DiscoveryError, NoDiscoveryTransportError } from '@matter/main';
import {
    DeviceAlreadyCommissionedToThisFabricError,
    DeviceAttestationCheck,
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

/** The device attestation failed, either a check matter.js fails on its own or the {@link attestationPolicy}. */
export class AttestationRejectedError extends CommissioningFailure {
    constructor(cause: unknown) {
        super('The device attestation was rejected', cause);
    }
}

/** The device has a test certificate, which pairing only accepts with test devices allowed in the adapter settings. */
export class TestDeviceNotAllowedError extends CommissioningFailure {
    constructor(cause: unknown) {
        super(
            'The device uses a test certificate. Enable "Allow test devices and custom/unofficial OTA updates" in the adapter settings to pair it',
            cause,
        );
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

type FailureKind = 'attestation' | 'testDevice' | 'passcode' | 'alreadyCommissioned' | 'notFound';

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
    if (error instanceof AttestationRefusal) {
        return error.onlyTestCertificates ? 'testDevice' : 'attestation';
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
        case 'testDevice':
            return new TestDeviceNotAllowedError(error);
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
 * The attestation policy refused the device. The message says why, and for a device with a test certificate how
 * the user can allow it.
 */
export class AttestationRefusal extends Error {
    /**
     * @param reason why the device is refused
     * @param onlyTestCertificates whether only test certificates refuse the device, so allowing test devices in the
     *   adapter settings would accept it
     */
    constructor(
        reason: string,
        readonly onlyTestCertificates: boolean,
    ) {
        super(reason);
        this.name = new.target.name;
    }
}

const TEST_NET_HINT =
    'To pair it, enable "Allow test devices and custom/unofficial OTA updates" in the adapter settings. Only do this if you trust the vendor.';

/**
 * The message matter.js gives a Certification Declaration mismatch when the device did not report its
 * BasicInformation VendorID or ProductID during commissioning. matter.js uses the same check type for every CD
 * check, so only the message tells this case apart.
 */
const BASIC_INFORMATION_NOT_REPORTED = /BasicInformation (VendorID|ProductID) \(not reported by the device\)$/;

/**
 * Whether `finding` is an error-level finding that pairing accepts with test devices allowed: a test certificate,
 * or a Certification Declaration that cannot be checked against the BasicInformation VendorID or ProductID because
 * the device did not report it.
 *
 * @see Matter Core specification § 6.2.3.1 "Attestation Information Validation"
 */
export function isTestNetAcceptedError({ level, type, message }: AttestationFinding): boolean {
    if (level !== 'error') {
        return false;
    }
    switch (type) {
        case DeviceAttestationCheck.TrustedAsTestCertificate:
            return true;
        case DeviceAttestationCheck.CertificationDeclarationFieldMismatch:
            return BASIC_INFORMATION_NOT_REPORTED.test(message);
        default:
            return false;
    }
}

/**
 * Why device attestation refuses a device, or `undefined` when no finding stops it. When allowing test devices would
 * accept the device, the text says so; otherwise every refusing finding is named with its check.
 */
export function attestationRefusalOf(findings: AttestationFinding[], testNetDclEnabled: boolean): string | undefined {
    const errors = findings.filter(
        finding => finding.level === 'error' && !(testNetDclEnabled && isTestNetAcceptedError(finding)),
    );
    if (errors.length === 0) {
        return undefined;
    }
    const named = `Device attestation refused: ${errors.map(({ type, message }) => `${type}: ${message}`).join('; ')}`;
    if (testNetDclEnabled || !errors.every(isTestNetAcceptedError)) {
        return named;
    }
    if (errors.every(({ type }) => type === DeviceAttestationCheck.TrustedAsTestCertificate)) {
        return `This device uses a test/development certificate. ${TEST_NET_HINT}`;
    }
    return `${named}. ${TEST_NET_HINT}`;
}

/**
 * The `onAttestationFailure` policy for pairing: a device is refused when an error-level finding remains after
 * {@link isTestNetAcceptedError} findings are accepted with test devices allowed. matter.js also passes the checks
 * it fails hard, such as an unknown Certification Declaration signer, as error findings. Warnings do not refuse,
 * except `DclServiceUnavailable`: the controller always registers the certificate service, so a missing one means
 * the checks against it did not run.
 *
 * @param testNetDclEnabled whether test devices are allowed
 * @param log receives every finding and the refusal; the caller reports the failed commissioning
 * @throws {AttestationRefusal} when the device is refused
 */
export function attestationPolicy(
    testNetDclEnabled: boolean,
    log: Pick<ioBroker.Logger, 'info'>,
): (findings: AttestationFinding[]) => true {
    return (reported: AttestationFinding[]) => {
        for (const { level, type, message } of reported) {
            log.info(`Device attestation finding (${level}) ${type}: ${message}`);
        }
        const findings = reported.map((finding): AttestationFinding =>
            finding.type === DeviceAttestationCheck.DclServiceUnavailable ? { ...finding, level: 'error' } : finding,
        );
        const refusal = attestationRefusalOf(findings, testNetDclEnabled);
        if (refusal !== undefined) {
            log.info(refusal);
            const onlyTestCertificates =
                !testNetDclEnabled &&
                findings
                    .filter(({ level }) => level === 'error')
                    .every(({ type }) => type === DeviceAttestationCheck.TrustedAsTestCertificate);
            throw new AttestationRefusal(refusal, onlyTestCertificates);
        }
        for (const { type, message } of findings.filter(isTestNetAcceptedError)) {
            log.info(`Accepting the device attestation with test devices allowed despite ${type}: ${message}`);
        }
        return true;
    };
}
