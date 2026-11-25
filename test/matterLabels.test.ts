import { expect } from 'chai';
import { Bytes } from '@matter/main';
import { basicInformationLabels, matterName } from '../src/matter/matterLabels';

// 32 characters but 34 bytes, so a cut by characters keeps it whole and over the limit
const UMLAUT_NAME = `Wohnzimmer Deckenleuchte Küche ${'ü'}`;
const LONG_UMLAUT_NAME = 'Ü'.repeat(40);

describe('basicInformationLabels', () => {
    it('cuts NodeLabel and ProductName to 32 bytes and ProductLabel to 64 bytes', () => {
        const labels = basicInformationLabels(LONG_UMLAUT_NAME);
        expect(labels.nodeLabel).to.equal('Ü'.repeat(16));
        expect(labels.productName).to.equal('Ü'.repeat(16));
        expect(labels.productLabel).to.equal('Ü'.repeat(32));
    });

    it('keeps a name that fits in characters but not in bytes within the byte limit', () => {
        const labels = basicInformationLabels(UMLAUT_NAME);
        expect(Bytes.utf8Length(labels.nodeLabel)).to.be.at.most(32);
        expect(labels.productLabel).to.equal(UMLAUT_NAME);
    });

    it('keeps a short ASCII name unchanged', () => {
        expect(basicInformationLabels('Lamp')).to.deep.equal({
            nodeLabel: 'Lamp',
            productName: 'Lamp',
            productLabel: 'Lamp',
        });
    });
});

describe('matterName', () => {
    it('cuts to 32 bytes without splitting a character', () => {
        expect(matterName(LONG_UMLAUT_NAME)).to.equal('Ü'.repeat(16));
        expect(matterName(`${'a'.repeat(31)}😀`)).to.equal('a'.repeat(31));
    });
});
