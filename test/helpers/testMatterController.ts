/**
 * The only place in the integration test that touches the matter.js controller API directly. Everything
 * else works against `Endpoint` and the adapter's own factory.
 */

import { ControllerBehavior, Environment, ServerNode, type ClientNode } from '@matter/main';
import { FabricAuthority } from '@matter/main/protocol';

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, what: string): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
        return await Promise.race([
            promise,
            new Promise<never>((_resolve, reject) => {
                timer = setTimeout(() => reject(new Error(`${what} did not finish within ${timeoutMs}ms`)), timeoutMs);
            }),
        ]);
    } finally {
        if (timer !== undefined) {
            clearTimeout(timer);
        }
    }
}

export interface CommissionedFixture {
    node: ClientNode;
    close: () => Promise<void>;
}

export async function commissionFixture(options: {
    storagePath: string;
    passcode: number;
    discriminator: number;
    fabricLabel: string;
    timeoutMs?: number;
}): Promise<CommissionedFixture> {
    const { storagePath, passcode, discriminator, fabricLabel, timeoutMs = 60_000 } = options;

    await import('@matter/nodejs');
    const environment = new Environment('integration-test-controller', Environment.default);
    environment.vars.set('storage.path', storagePath);
    const mdnsInterface = process.env.MATTER_MDNS_NETWORK_INTERFACE;
    if (mdnsInterface) {
        environment.vars.set('mdns.networkInterface', mdnsInterface);
    }

    const serverNode = await ServerNode.create(ServerNode.RootEndpoint.with(ControllerBehavior), {
        environment,
        id: 'controller',
        // A controller is not commissionable itself, and the fixture is short lived
        commissioning: { enabled: false },
        subscriptions: { persistenceEnabled: false },
        controller: { adminFabricLabel: fabricLabel },
    });

    let node: ClientNode;
    try {
        const fabricAuthority = await serverNode.env.load(FabricAuthority);
        await fabricAuthority.defaultFabric({ adminFabricLabel: fabricLabel });
        await serverNode.start();

        node = await withTimeout(
            serverNode.peers.commission({ passcode, longDiscriminator: discriminator }),
            timeoutMs,
            'commission',
        );
        // The structure is read once the peer is seeded, and the mapping needs it
        if (!node.lifecycle.isSeeded) {
            const seeded = new Promise<void>(resolve => node.lifecycle.seeded.once(() => resolve()));
            await withTimeout(seeded, timeoutMs, 'node initialization');
        }
    } catch (error) {
        // The caller retries with a fresh fixture, so this attempt's mDNS and storage must not outlive it
        await serverNode.close().catch(() => undefined);
        environment[Symbol.dispose]();
        throw error;
    }

    return {
        node,
        close: async () => {
            await serverNode.close();
            environment[Symbol.dispose]();
        },
    };
}
