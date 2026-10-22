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
    acceptAttestationFindings,
    AttestationRejectedError,
    classifyCommissioningFailure,
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

describe('acceptAttestationFindings', () => {
    const findings: AttestationFinding[] = [
        { level: 'error', type: DeviceAttestationCheck.TrustedAsTestCertificate, message: 'test certificate' },
        { level: 'warning', type: DeviceAttestationCheck.DclServiceUnavailable, message: 'no DCL' },
    ];

    it('accepts every finding, errors included, so devices that pair today keep pairing', () => {
        expect(acceptAttestationFindings(() => undefined)(findings)).to.equal(true);
    });

    it('logs each finding', () => {
        const lines = new Array<string>();
        acceptAttestationFindings(line => lines.push(line))(findings);
        expect(lines).to.have.length(2);
        expect(lines[0]).to.contain('TrustedAsTestCertificate').and.to.contain('test certificate');
    });
});
