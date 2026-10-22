import { expect } from 'chai';
import { contained, runShutdownSteps } from '../src/matter/containment';

describe('contained', () => {
    it('passes the arguments to the handler', () => {
        const received = new Array<unknown>();
        contained(
            (a: number, b: string) => received.push(a, b),
            () => undefined,
        )(1, 'x');
        expect(received).to.deep.equal([1, 'x']);
    });

    it('reports a synchronous throw instead of letting it escape', () => {
        const failure = new Error('boom');
        const reported = new Array<unknown>();
        const wrapped = contained(
            () => {
                throw failure;
            },
            error => reported.push(error),
        );
        expect(() => wrapped()).to.not.throw();
        expect(reported).to.deep.equal([failure]);
    });
});

describe('runShutdownSteps', () => {
    it('runs the steps in order', async () => {
        const order = new Array<string>();
        await runShutdownSteps(
            [
                { what: 'a', run: async () => order.push('a') },
                { what: 'b', run: () => order.push('b') },
            ],
            () => undefined,
        );
        expect(order).to.deep.equal(['a', 'b']);
    });

    it('runs every later step when one fails, and reports each failure once', async () => {
        const order = new Array<string>();
        const reported = new Array<string>();
        await runShutdownSteps(
            [
                {
                    what: 'first',
                    run: () => {
                        throw new Error('sync');
                    },
                },
                { what: 'second', run: async () => order.push('second') },
                { what: 'third', run: () => Promise.reject(new Error('async')) },
                { what: 'fourth', run: () => order.push('fourth') },
            ],
            (what, error) => reported.push(`${what}: ${error instanceof Error ? error.message : String(error)}`),
        );
        expect(order).to.deep.equal(['second', 'fourth']);
        expect(reported).to.deep.equal(['first: sync', 'third: async']);
    });

    it('waits for a step before starting the next one', async () => {
        const order = new Array<string>();
        await runShutdownSteps(
            [
                {
                    what: 'slow',
                    run: async () => {
                        await new Promise(resolve => setTimeout(resolve, 20));
                        order.push('slow');
                    },
                },
                { what: 'next', run: () => order.push('next') },
            ],
            () => undefined,
        );
        expect(order).to.deep.equal(['slow', 'next']);
    });
});
