import { expect } from 'chai';
import { ProgressHeartbeat, type HeartbeatScheduler } from '../src/lib/ProgressHeartbeat';

/** Fakes `MatterAdapter.setTimeout`/`clearTimeout` with real Node timers, at test-scale intervals. */
class RealScheduler implements HeartbeatScheduler<NodeJS.Timeout> {
    setTimeout(cb: () => void, timeoutMs: number): NodeJS.Timeout {
        return setTimeout(cb, timeoutMs);
    }

    clearTimeout(timer: NodeJS.Timeout): void {
        clearTimeout(timer);
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!predicate() && Date.now() < deadline) {
        await sleep(5);
    }
}

describe('ProgressHeartbeat', () => {
    it('ticks periodically while running', async () => {
        let tickCount = 0;
        const heartbeat = new ProgressHeartbeat(new RealScheduler(), 15, async () => {
            tickCount++;
        });
        heartbeat.start();

        await waitFor(() => tickCount >= 3);
        await heartbeat.stop();
        expect(tickCount).to.be.at.least(3);
    });

    it('never runs two ticks concurrently', async () => {
        let inFlight = false;
        let overlapDetected = false;
        let tickCount = 0;
        const heartbeat = new ProgressHeartbeat(new RealScheduler(), 10, async () => {
            if (inFlight) {
                overlapDetected = true;
            }
            inFlight = true;
            // Slower than the interval, so a naive fixed-rate scheduler would overlap here.
            await sleep(25);
            inFlight = false;
            tickCount++;
        });
        heartbeat.start();

        await waitFor(() => tickCount >= 3);
        await heartbeat.stop();
        expect(overlapDetected, 'no tick may start while a previous one is still in flight').to.equal(false);
    });

    it('does not tick again once stop() has resolved', async () => {
        let tickCount = 0;
        const heartbeat = new ProgressHeartbeat(new RealScheduler(), 15, async () => {
            tickCount++;
        });
        heartbeat.start();

        await waitFor(() => tickCount >= 1);
        await heartbeat.stop();
        const countAtStop = tickCount;
        await sleep(60);
        expect(tickCount, 'stop() must permanently disarm the schedule, not just skip one tick').to.equal(countAtStop);
    });

    it('stop() waits for an in-flight tick to settle before resolving', async () => {
        let resolveTick: (() => void) | undefined;
        let tickStarted = false;
        const heartbeat = new ProgressHeartbeat(
            new RealScheduler(),
            10,
            () =>
                new Promise<void>(resolve => {
                    tickStarted = true;
                    resolveTick = resolve;
                }),
        );
        heartbeat.start();
        await waitFor(() => tickStarted);

        let stopped = false;
        const stopPromise = heartbeat.stop().then(() => {
            stopped = true;
        });
        await sleep(50);
        expect(stopped, 'stop() must not resolve while its in-flight tick is still pending').to.equal(false);

        resolveTick?.();
        await stopPromise;
        expect(stopped).to.equal(true);
    });

    it('keeps ticking after a tick throws, without the error escaping', async () => {
        let tickCount = 0;
        const heartbeat = new ProgressHeartbeat(new RealScheduler(), 10, async () => {
            tickCount++;
            throw new Error('boom');
        });
        heartbeat.start();

        // mocha.setup.js rethrows any unhandled rejection, so this would crash the suite if the
        // heartbeat let a tick's error escape instead of swallowing it.
        await waitFor(() => tickCount >= 3);
        await heartbeat.stop();
        expect(tickCount).to.be.at.least(3);
    });

    it('start() is idempotent: a second call does not arm an untracked second timer chain', async () => {
        let tickCount = 0;
        const heartbeat = new ProgressHeartbeat(new RealScheduler(), 15, async () => {
            tickCount++;
        });
        heartbeat.start();
        heartbeat.start();

        await waitFor(() => tickCount >= 1);
        await heartbeat.stop();
        const countAtStop = tickCount;
        await sleep(60);
        expect(tickCount, 'a second start() must not leave an orphaned timer chain that stop() cannot reach').to.equal(
            countAtStop,
        );
    });

    it('start() after stop() does not resume ticking', async () => {
        let tickCount = 0;
        const heartbeat = new ProgressHeartbeat(new RealScheduler(), 10, async () => {
            tickCount++;
        });
        heartbeat.start();
        await waitFor(() => tickCount >= 1);
        await heartbeat.stop();
        const countAtStop = tickCount;

        heartbeat.start();
        await sleep(40);
        expect(tickCount, 'start() after stop() must stay a no-op').to.equal(countAtStop);
    });

    describe('run()', () => {
        it('stops the heartbeat and calls onSettle before close on success', async () => {
            const events: string[] = [];
            let tickCount = 0;
            const heartbeat = new ProgressHeartbeat(new RealScheduler(), 15, async () => {
                tickCount++;
                events.push('tick');
            });

            const result = await heartbeat.run(
                async () => {
                    await waitFor(() => tickCount >= 2);
                },
                () => events.push('settle'),
                async () => {
                    events.push('close');
                },
            );

            expect(result).to.deep.equal({ failed: false, error: undefined });
            expect(events, 'onSettle must have run').to.include('settle');
            expect(events[events.length - 1], 'close must be the last event').to.equal('close');
            expect(events.indexOf('settle')).to.be.lessThan(events.indexOf('close'));

            const tickCountAtClose = tickCount;
            await sleep(30);
            expect(tickCount, 'no tick may occur after close() has run').to.equal(tickCountAtClose);
        });

        it('closes even when the action throws, and reports the failure', async () => {
            const events: string[] = [];
            const heartbeat = new ProgressHeartbeat(new RealScheduler(), 15, async () => {
                events.push('tick');
            });
            const boom = new Error('boom');

            const result = await heartbeat.run(
                async () => {
                    throw boom;
                },
                () => events.push('settle'),
                async () => {
                    events.push('close');
                },
            );

            expect(result.failed).to.equal(true);
            expect(result.error).to.equal(boom);
            expect(events, 'onSettle must have run').to.include('settle');
            expect(events).to.include('close');
            expect(events.indexOf('settle')).to.be.lessThan(events.indexOf('close'));
        });

        it('does not reach close while stopping a stuck heartbeat, but still runs onSettle', async () => {
            let resolveTick: (() => void) | undefined;
            let settleCalled = false;
            let closeCalled = false;
            const heartbeat = new ProgressHeartbeat(
                new RealScheduler(),
                10,
                () =>
                    new Promise<void>(resolve => {
                        resolveTick = resolve;
                    }),
            );

            const runPromise = heartbeat.run(
                async () => {
                    await waitFor(() => resolveTick !== undefined);
                },
                () => {
                    settleCalled = true;
                },
                async () => {
                    closeCalled = true;
                },
            );

            await waitFor(() => resolveTick !== undefined);
            await sleep(80);
            expect(settleCalled, 'pending must still be cleared even though the heartbeat is stuck').to.equal(true);
            expect(closeCalled, 'close must not run while the heartbeat is still stuck stopping').to.equal(false);

            resolveTick?.();
            await runPromise;
            expect(closeCalled, 'close must run once the stuck tick finally settles').to.equal(true);
        });

        it('still stops the heartbeat when onSettle itself throws', async () => {
            let tickCount = 0;
            const heartbeat = new ProgressHeartbeat(new RealScheduler(), 10, async () => {
                tickCount++;
            });
            const settleError = new Error('settle boom');

            const result = await heartbeat.run(
                async () => {
                    await waitFor(() => tickCount >= 1);
                },
                () => {
                    throw settleError;
                },
                async () => {},
            );

            expect(result.failed).to.equal(true);
            expect(result.error).to.equal(settleError);

            const countAfterRun = tickCount;
            await sleep(40);
            expect(tickCount, 'the heartbeat must be fully stopped even though onSettle threw').to.equal(countAfterRun);
        });

        it('reports a failing close() when the action itself succeeded', async () => {
            const heartbeat = new ProgressHeartbeat(new RealScheduler(), 15, async () => {});
            const closeError = new Error('close boom');

            const result = await heartbeat.run(
                async () => {},
                () => {},
                async () => {
                    throw closeError;
                },
            );

            expect(result.failed).to.equal(true);
            expect(result.error).to.equal(closeError);
        });

        it('does not let a failing close() overwrite an action failure already captured', async () => {
            const heartbeat = new ProgressHeartbeat(new RealScheduler(), 15, async () => {});
            const actionError = new Error('action boom');

            const result = await heartbeat.run(
                async () => {
                    throw actionError;
                },
                () => {},
                async () => {
                    throw new Error('close boom');
                },
            );

            expect(result.failed).to.equal(true);
            expect(result.error).to.equal(actionError);
        });
    });
});
