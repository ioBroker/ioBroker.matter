import { expect } from 'chai';
import { PasscodeMismatchError } from '@matter/main/protocol';
import { isWrongPasscode } from '../src/matter/commissioningErrors';

describe('isWrongPasscode', () => {
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
