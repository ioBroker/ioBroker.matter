import { expect } from 'chai';
import { MatterAggregateError } from '@matter/main';
import { CommissioningError, PairRetransmissionLimitReachedError } from '@matter/main/protocol';
import { explainBleOnlyCommissioningFailure } from '../src/matter/bleOnlyCommissioning';

describe('explainBleOnlyCommissioningFailure', () => {
    it('explains a device that never answered on the IP network', () => {
        const notFound = new PairRetransmissionLimitReachedError(
            'Failed to connect on any discovered server before timeout',
        );

        const explained = explainBleOnlyCommissioningFailure(notFound);

        expect(explained?.message).to.contain('not found on the IP network');
        expect(explained?.message).to.contain('this host has no BLE');
        expect(explained?.cause).to.equal(notFound);
    });

    it('recognizes the failure when matter.js wraps it', () => {
        const notFound = new PairRetransmissionLimitReachedError('Failed to connect on any discovered server');

        expect(explainBleOnlyCommissioningFailure(new Error('Commissioning failed', { cause: notFound }))).to.be.an(
            'error',
        );
        expect(explainBleOnlyCommissioningFailure(new MatterAggregateError([notFound]))).to.be.an('error');
    });

    it('keeps every other failure as it is', () => {
        expect(explainBleOnlyCommissioningFailure(new CommissioningError('Commission error for "addNoc": 9'))).to.equal(
            undefined,
        );
        expect(explainBleOnlyCommissioningFailure(new Error('Passcode is missing'))).to.equal(undefined);
    });
});
