import { expect } from 'chai';
import { DeviceNotDiscoveredError, DiscoveryIncompleteError, NoDiscoveryTransportError } from '@matter/main';
import {
    DeviceAlreadyCommissionedToThisFabricError,
    DeviceAttestationCheck,
    DeviceAttestationError,
    PasscodeMismatchError,
    type AttestationFinding,
} from '@matter/main/protocol';
import {
    attestationPolicy,
    AttestationRefusal,
    AttestationRejectedError,
    classifyCommissioningFailure,
    TestDeviceNotAllowedError,
    DeviceAlreadyCommissionedError,
    DeviceNotFoundError,
    isUnreachedAddress,
    WrongPairingCodeError,
} from '../src/matter/commissioningErrors';

describe('wrong passcode classification', () => {
    const isWrongPasscode = (error: unknown) => classifyCommissioningFailure(error) instanceof WrongPairingCodeError;

    it('recognizes a mismatch directly and through a cause', () => {
        expect(isWrongPasscode(new PasscodeMismatchError('mismatch'))).to.equal(true);
        expect(isWrongPasscode(new Error('commissioning failed', { cause: new PasscodeMismatchError('x') }))).to.equal(
            true,
        );
    });

    it('recognizes an aggregate in which every attempt rejected the code', () => {
        const error = new AggregateError([new PasscodeMismatchError('a'), new PasscodeMismatchError('b')]);
        expect(isWrongPasscode(error)).to.equal(true);
    });

    it('does not blame the code when another attempt failed for a different reason', () => {
        const error = new AggregateError([new PasscodeMismatchError('other device'), new Error('timeout')]);
        expect(isWrongPasscode(error)).to.equal(false);
    });

    it('does not blame the code for an empty aggregate or an unrelated error', () => {
        expect(isWrongPasscode(new AggregateError([]))).to.equal(false);
        expect(isWrongPasscode(new Error('timeout'))).to.equal(false);
        expect(isWrongPasscode('mismatch')).to.equal(false);
    });
});

describe('classifyCommissioningFailure', () => {
    const attestationError = () => new DeviceAttestationError(DeviceAttestationCheck.PaaNotTrusted, 'PAA not trusted');

    it('maps a rejected attestation, also when wrapped', () => {
        expect(classifyCommissioningFailure(attestationError())).to.be.instanceOf(AttestationRejectedError);
        const wrapped = new Error('commissioning failed', { cause: attestationError() });
        expect(classifyCommissioningFailure(wrapped)).to.be.instanceOf(AttestationRejectedError);
    });

    it('maps a wrong passcode', () => {
        const failure = classifyCommissioningFailure(new PasscodeMismatchError('mismatch'));
        expect(failure).to.be.instanceOf(WrongPairingCodeError);
        expect(failure?.message).to.equal('The pairing code is wrong');
    });

    it('maps a device that is already paired', () => {
        const error = new DeviceAlreadyCommissionedToThisFabricError('already');
        expect(classifyCommissioningFailure(error)).to.be.instanceOf(DeviceAlreadyCommissionedError);
    });

    it('maps a discovery that found no usable device', () => {
        expect(classifyCommissioningFailure(new DeviceNotDiscoveredError('none'))).to.be.instanceOf(
            DeviceNotFoundError,
        );
        expect(classifyCommissioningFailure(new DiscoveryIncompleteError('timeout'))).to.be.instanceOf(
            DeviceNotFoundError,
        );
    });

    it('does not claim a missing device when discovery had no transport to look with', () => {
        expect(classifyCommissioningFailure(new NoDiscoveryTransportError('no scanner'))).to.equal(undefined);
    });

    it('gives an aggregate a reason only when every attempt has the same one', () => {
        const same = new AggregateError([attestationError(), attestationError()]);
        expect(classifyCommissioningFailure(same)).to.be.instanceOf(AttestationRejectedError);
        const mixed = new AggregateError([attestationError(), new PasscodeMismatchError('x')]);
        expect(classifyCommissioningFailure(mixed)).to.equal(undefined);
        const unrelated = new AggregateError([new DeviceAlreadyCommissionedToThisFabricError('x'), new Error('y')]);
        expect(classifyCommissioningFailure(unrelated)).to.equal(undefined);
    });

    it('leaves a failure without a dedicated reason to the caller', () => {
        expect(classifyCommissioningFailure(new Error('timeout'))).to.equal(undefined);
    });

    it('keeps the original error as the cause', () => {
        const error = new PasscodeMismatchError('mismatch');
        expect(classifyCommissioningFailure(error)?.cause).to.equal(error);
    });
});

describe('CommissioningFailure subclasses', () => {
    it('carry the name of their own class', () => {
        const cause = new Error('x');
        expect(new WrongPairingCodeError(cause).name).to.equal('WrongPairingCodeError');
        expect(new AttestationRejectedError(cause).name).to.equal('AttestationRejectedError');
        expect(new DeviceNotFoundError(cause).name).to.equal('DeviceNotFoundError');
        expect(new DeviceAlreadyCommissionedError(cause).name).to.equal('DeviceAlreadyCommissionedError');
    });
});

describe('isUnreachedAddress', () => {
    it('is true for a device that did not answer and for failures without a dedicated reason', () => {
        expect(isUnreachedAddress(new DiscoveryIncompleteError('timeout'))).to.equal(true);
        expect(isUnreachedAddress(new Error('timeout'))).to.equal(true);
    });

    it('is false when discovery would fail the same way', () => {
        expect(isUnreachedAddress(new PasscodeMismatchError('mismatch'))).to.equal(false);
        expect(isUnreachedAddress(new DeviceAlreadyCommissionedToThisFabricError('already'))).to.equal(false);
        expect(
            isUnreachedAddress(new DeviceAttestationError(DeviceAttestationCheck.PaaNotTrusted, 'PAA not trusted')),
        ).to.equal(false);
    });
});

describe('attestationPolicy', () => {
    const testCertificate: AttestationFinding = {
        level: 'error',
        type: DeviceAttestationCheck.TrustedAsTestCertificate,
        message: 'test certificate',
    };
    const notReported: AttestationFinding = {
        level: 'error',
        type: DeviceAttestationCheck.CertificationDeclarationFieldMismatch,
        message: 'CD vendor_id 0xFFF1 does not match BasicInformation VendorID (not reported by the device)',
    };
    const mismatch: AttestationFinding = {
        level: 'error',
        type: DeviceAttestationCheck.CertificationDeclarationFieldMismatch,
        message: 'CD vendor_id 0xFFF1 does not match BasicInformation VendorID 0x1234',
    };
    const unknownSigner: AttestationFinding = {
        level: 'error',
        type: DeviceAttestationCheck.CdSignerUnknown,
        message: 'CD signer SKID 00 is not known to be a CD signer',
    };
    const warning: AttestationFinding = {
        level: 'warning',
        type: DeviceAttestationCheck.DclServiceUnavailable,
        message: 'no DCL',
    };
    const otherWarning: AttestationFinding = {
        level: 'info',
        type: DeviceAttestationCheck.CertificationTypeTest,
        message: 'test certification type',
    };

    function decide(
        findings: AttestationFinding[],
        testNetDclEnabled: boolean,
    ): { refusal?: unknown; lines: string[] } {
        const lines = new Array<string>();
        const log = { info: (line: string) => lines.push(line), warn: (line: string) => lines.push(line) };
        try {
            attestationPolicy(testNetDclEnabled, log)(findings);
            return { lines };
        } catch (refusal) {
            return { refusal, lines };
        }
    }

    it('accepts a device with only warnings and infos', () => {
        expect(decide([otherWarning], false).refusal).to.equal(undefined);
    });

    it('refuses a test certificate without test devices allowed and names the setting', () => {
        const { refusal } = decide([testCertificate, otherWarning], false);
        expect(refusal).to.be.instanceOf(AttestationRefusal);
        expect((refusal as Error).message)
            .to.contain('test/development certificate')
            .and.to.contain('Allow test devices');
        expect(classifyCommissioningFailure(new Error('wrapped', { cause: refusal }))).to.be.instanceOf(
            TestDeviceNotAllowedError,
        );
    });

    it('accepts a test certificate and an unreported BasicInformation ID with test devices allowed', () => {
        expect(decide([testCertificate, notReported], true).refusal).to.equal(undefined);
    });

    it('refuses a Certification Declaration that names other IDs, also with test devices allowed', () => {
        const { refusal } = decide([mismatch], true);
        expect((refusal as Error).message).to.contain('CertificationDeclarationFieldMismatch');
        expect((refusal as Error).message).to.not.contain('Allow test devices');
    });

    it('refuses an unknown Certification Declaration signer, also with test devices allowed', () => {
        const { refusal } = decide([unknownSigner, testCertificate], false);
        expect(classifyCommissioningFailure(refusal)).to.be.instanceOf(AttestationRejectedError);
        expect(decide([unknownSigner], true).refusal).to.be.instanceOf(AttestationRefusal);
        expect((decide([unknownSigner, testCertificate], false).refusal as Error).message).to.not.contain(
            'Allow test devices',
        );
    });

    it('names the setting next to the findings when only test-net findings refuse', () => {
        const { refusal } = decide([testCertificate, notReported], false);
        expect((refusal as Error).message)
            .to.contain('Device attestation refused')
            .and.to.contain('Allow test devices');
    });

    it('does not report a test certificate when only the BasicInformation IDs were not reported', () => {
        const { refusal } = decide([notReported], false);
        expect((refusal as Error).message).to.contain('Allow test devices');
        expect(classifyCommissioningFailure(refusal)).to.be.instanceOf(AttestationRejectedError);
    });

    it('refuses a device whose certificates were not checked against the DCL', () => {
        const { refusal } = decide([warning, testCertificate], true);
        expect(refusal).to.be.instanceOf(AttestationRefusal);
        expect((refusal as Error).message).to.contain('DclServiceUnavailable');
        expect(classifyCommissioningFailure(refusal)).to.be.instanceOf(AttestationRejectedError);
    });

    it('logs every finding and the refusal', () => {
        const { lines } = decide([testCertificate, otherWarning], false);
        expect(lines).to.have.length(3);
        expect(lines[0]).to.contain('TrustedAsTestCertificate').and.to.contain('test certificate');
    });
});
