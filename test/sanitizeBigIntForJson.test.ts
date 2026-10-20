import { expect } from 'chai';
import { FabricId, NodeId } from '@matter/main';
import { sanitizeBigIntForJson } from '../src/lib/utils';

describe('sanitizeBigIntForJson', () => {
    it('converts a top-level bigint to its decimal string', () => {
        expect(sanitizeBigIntForJson(42n)).to.equal('42');
    });

    it('leaves plain JSON values untouched', () => {
        const input = { a: 1, b: 'two', c: true, d: null, e: [1, 2, 3] };
        expect(sanitizeBigIntForJson(input)).to.deep.equal(input);
    });

    it('converts nested bigints inside objects and arrays to strings', () => {
        const input = { outer: { id: 7n, list: [1n, 2n], name: 'x' } };
        expect(sanitizeBigIntForJson(input)).to.deep.equal({
            outer: { id: '7', list: ['1', '2'], name: 'x' },
        });
    });

    // Reproduces the crash from #916: controllerInitializePaseCommissioner returns `fabricData`
    // with rootNodeId (NodeId) and fabricId (FabricId), both bigint. The js-controller states DB
    // serializes the sendTo callback with JSON.stringify, which throws on a raw bigint.
    describe('the controllerInitializePaseCommissioner result that crashed the adapter (#916)', () => {
        const buildPaseResult = (): { result: { rootCertificateData: unknown; fabricData: unknown } } => ({
            result: {
                rootCertificateData: { someCa: 'data' },
                fabricData: {
                    rootNodeId: NodeId(0xfff4430000000001n),
                    fabricId: FabricId(1n),
                },
            },
        });

        it('throws when the raw result is stringified (the crash)', () => {
            expect(() => JSON.stringify(buildPaseResult())).to.throw(TypeError, /serialize a BigInt/);
        });

        it('is JSON-serializable after sanitizing (no throw)', () => {
            const sanitized = sanitizeBigIntForJson(buildPaseResult());
            expect(() => JSON.stringify(sanitized)).to.not.throw();
        });

        it('turns the Matter identifiers into their decimal strings and keeps the rest', () => {
            const sanitized = sanitizeBigIntForJson(buildPaseResult()) as {
                result: { rootCertificateData: unknown; fabricData: { rootNodeId: unknown; fabricId: unknown } };
            };
            expect(sanitized.result.fabricData.rootNodeId).to.equal('18443440041268084737');
            expect(sanitized.result.fabricData.fabricId).to.equal('1');
            expect(sanitized.result.rootCertificateData).to.deep.equal({ someCa: 'data' });
        });
    });
});
