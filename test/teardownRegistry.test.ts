import { expect } from 'chai';
import { TeardownRegistry } from '../src/lib/TeardownRegistry';

describe('TeardownRegistry', () => {
    function registry(): { instance: TeardownRegistry; errors: Error[] } {
        const errors = new Array<Error>();
        return { instance: new TeardownRegistry(error => errors.push(error)), errors };
    }

    it('runs every registered action on close', async () => {
        const { instance, errors } = registry();
        let count = 0;
        instance.add(() => count++);
        instance.add(() => count++);
        expect(instance.size).to.equal(2);

        await instance.close();

        expect(count).to.equal(2);
        expect(instance.size).to.equal(0);
        expect(errors).to.be.empty;
    });

    it('runs actions most recently registered first', async () => {
        const { instance } = registry();
        const order = new Array<string>();
        instance.add(() => order.push('first'));
        instance.add(() => order.push('second'));

        await instance.close();

        expect(order).to.deep.equal(['second', 'first']);
    });

    it('awaits an action that returns a promise', async () => {
        const { instance } = registry();
        let resolved = false;
        instance.add(async () => {
            await new Promise(resolve => setTimeout(resolve, 5));
            resolved = true;
        });

        await instance.close();

        expect(resolved).to.be.true;
    });

    it('runs the remaining actions when one throws, and reports it', async () => {
        const { instance, errors } = registry();
        const ran = new Array<string>();
        instance.add(() => ran.push('registered first'));
        instance.add(() => {
            throw new Error('boom');
        });
        instance.add(() => ran.push('registered last'));

        await instance.close();

        expect(ran).to.deep.equal(['registered last', 'registered first']);
        expect(errors.map(error => error.message)).to.deep.equal(['boom']);
    });

    it('runs the remaining actions when one rejects', async () => {
        const { instance, errors } = registry();
        const ran = new Array<string>();
        instance.add(() => ran.push('registered first'));
        instance.add(() => Promise.reject(new Error('async boom')));
        instance.add(() => ran.push('registered last'));

        await instance.close();

        expect(ran).to.deep.equal(['registered last', 'registered first']);
        expect(errors.map(error => error.message)).to.deep.equal(['async boom']);
    });

    it('reports a non-Error rejection as an Error', async () => {
        const { instance, errors } = registry();
        instance.add(() => {
            // eslint-disable-next-line @typescript-eslint/only-throw-error
            throw 'plain string';
        });

        await instance.close();

        expect(errors).to.have.lengthOf(1);
        expect(errors[0]).to.be.instanceOf(Error);
        expect(errors[0].message).to.equal('plain string');
    });

    it('runs an action registered after close immediately instead of retaining it', async () => {
        const { instance } = registry();
        await instance.close();
        expect(instance.closed).to.be.true;

        let ran = false;
        instance.add(() => (ran = true));

        expect(ran).to.be.true;
        expect(instance.size).to.equal(0);
    });

    it('reports a failure from an action registered after close', async () => {
        const { instance, errors } = registry();
        await instance.close();

        instance.add(() => Promise.reject(new Error('late boom')));
        await new Promise(resolve => setImmediate(resolve));

        expect(errors.map(error => error.message)).to.deep.equal(['late boom']);
    });

    it('makes concurrent close calls await the same completed drain', async () => {
        const { instance } = registry();
        const order = new Array<string>();
        let released: () => void = () => {};
        const gate = new Promise<void>(resolve => (released = resolve));

        instance.add(() => order.push('second'));
        instance.add(async () => {
            await gate;
            order.push('first');
        });

        const a = instance.close();
        const b = instance.close();
        // The second caller must not be able to drain past the action the first one is still awaiting
        expect(order).to.be.empty;

        released();
        await Promise.all([a, b]);

        expect(order).to.deep.equal(['first', 'second']);
    });

    it('runs each action exactly once across repeated close calls', async () => {
        const { instance } = registry();
        let count = 0;
        instance.add(() => count++);

        await instance.close();
        await instance.close();

        expect(count).to.equal(1);
    });
});
