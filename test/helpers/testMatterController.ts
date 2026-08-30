/**
 * The only place in the integration test that touches the matter.js 0.17 controller API
 * (`CommissioningController` / `PairedNode` from `@project-chip/matter.js`). Everything else works against
 * `Endpoint` and the adapter's own factory, so the 0.18 `ClientNode` rewrite only has to replace this file.
 */

import { Environment } from '@matter/main';
import { CommissioningController } from '@project-chip/matter.js';
import type { PairedNode } from '@project-chip/matter.js/device';

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
    node: PairedNode;
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

    const controller = new CommissioningController({
        autoConnect: false,
        environment: { environment, id: 'controller' },
        adminFabricLabel: fabricLabel,
    });
    await controller.start();

    let node: PairedNode;
    try {
        const nodeId = await withTimeout(
            controller.commissionNode({
                subscribeMinIntervalFloorSeconds: 1,
                subscribeMaxIntervalCeilingSeconds: undefined,
                discovery: { identifierData: { longDiscriminator: discriminator } },
                passcode,
            }),
            timeoutMs,
            'commissionNode',
        );
        node = await withTimeout(controller.getNode(nodeId), timeoutMs, 'getNode');
        // Awaiting the observable never resolves once it has already fired, so only wait when it still has to.
        if (!node.initialized) {
            await withTimeout(node.events.initialized, timeoutMs, 'node initialization');
        }
    } catch (error) {
        await controller.close().catch(() => undefined);
        throw error;
    }

    return {
        node,
        close: async () => {
            await controller.close();
            await environment.close?.();
        },
    };
}
