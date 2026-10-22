import { strictEqual } from 'node:assert';
import { OnOffServer } from '@matter/main/behaviors';
import { AttributeModel, ClusterModel } from '@matter/main/model';
import { resolveAttributeId } from '../src/matter/GeneralMatterNode';

/**
 * Attribute names reach the adapter as behavior property names. matter.js names an attribute it does not
 * recognize `attr$<hex>` and carries it in the schema it built for that peer, not in the global model.
 */
describe('resolveAttributeId', () => {
    const onOff = OnOffServer;

    it('resolves an attribute the global model knows', () => {
        strictEqual(resolveAttributeId(onOff, 'onOff'), 0);
    });

    it('resolves a vendor attribute that only the peer schema carries', () => {
        const schema = onOff.schema?.clone() as ClusterModel;
        schema.children.push(new AttributeModel({ id: 0x130a000a, name: 'attr$130a000a', type: 'any' }));
        const behavior = onOff.for(onOff.cluster, schema);

        strictEqual(resolveAttributeId(behavior, 'attr$130a000a'), 0x130a000a);
    });

    it('reports nothing for a name neither side knows', () => {
        strictEqual(resolveAttributeId(onOff, 'attr$deadbeef'), undefined);
    });
});
