import { expect } from 'chai';
import { matterSoftwareVersion } from '../src/lib/utils';

describe('matterSoftwareVersion', () => {
    it('gives a later version a larger number', () => {
        const ordered = ['0.6.10', '0.7.0', '1.0.0', '1.3.1', '1.3.2', '1.4.0', '2.0.0'];
        const numbers = ordered.map(matterSoftwareVersion);
        expect(numbers).to.deep.equal([...numbers].sort((a, b) => a - b));
        expect(new Set(numbers).size).to.equal(ordered.length);
    });

    it('encodes major, minor and patch as three-digit groups', () => {
        expect(matterSoftwareVersion('1.3.1')).to.equal(1_003_001);
    });

    it('ignores a pre-release suffix', () => {
        expect(matterSoftwareVersion('1.4.0-alpha.2')).to.equal(1_004_000);
    });

    it('returns 0 for a string that is not major.minor.patch', () => {
        expect(matterSoftwareVersion('dev')).to.equal(0);
        expect(matterSoftwareVersion('v1.2.3')).to.equal(0);
    });
});
