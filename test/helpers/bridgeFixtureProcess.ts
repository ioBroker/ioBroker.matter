import { type ChildProcess, spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import nodeProcess from 'node:process';
import { BRIDGE_PORT_BASE, READY_MARKER } from '../fixtures/bridgeConstants';

export interface FixtureHandle {
    process: ChildProcess;
    storagePath: string;
}

export async function createTempStorage(prefix: string): Promise<string> {
    return mkdtemp(join(tmpdir(), prefix));
}

export async function removeTempStorage(path: string | undefined): Promise<void> {
    if (path === undefined) {
        return;
    }
    await rm(path, { recursive: true, force: true }).catch(() => undefined);
}

/** The fixture is detached, so mocha dying does not take it down; this is the last-resort net for that. */
const liveFixtures = new Set<ChildProcess>();
let exitHandlersInstalled = false;

function killGroup(child: ChildProcess, signal: NodeJS.Signals): void {
    try {
        if (child.pid) {
            nodeProcess.kill(-child.pid, signal);
        } else {
            child.kill(signal);
        }
    } catch {
        child.kill(signal);
    }
}

function installExitHandlers(): void {
    if (exitHandlersInstalled) {
        return;
    }
    exitHandlersInstalled = true;
    const reap = (): void => {
        for (const child of liveFixtures) {
            killGroup(child, 'SIGKILL');
        }
        liveFixtures.clear();
    };
    nodeProcess.once('exit', reap);
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
        nodeProcess.once(signal, () => {
            reap();
            nodeProcess.exit(130);
        });
    }
}

/** A port per run, so a fixture whose grandchild outlived a previous attempt cannot block the next one. */
export function pickBridgePort(): number {
    return BRIDGE_PORT_BASE + Math.floor(Math.random() * 100);
}

export function startBridgeFixture(storagePath: string, port: number, verbose = false): ChildProcess {
    const child = spawn(
        'npx',
        [
            'ts-node',
            '--project',
            'tsconfig.test.json',
            'test/fixtures/TestBridgeDevice.ts',
            `--storage-path=${storagePath}`,
            `--port=${port}`,
        ],
        {
            cwd: process.cwd(),
            // Own process group so the npx/ts-node/node chain can be killed as a unit.
            detached: true,
            stdio: ['pipe', 'pipe', 'pipe'],
        },
    );

    if (verbose) {
        child.stdout?.on('data', (data: Buffer) => console.log('[bridge]', data.toString().trim()));
        child.stderr?.on('data', (data: Buffer) => console.log('[bridge:err]', data.toString().trim()));
    }

    installExitHandlers();
    liveFixtures.add(child);
    child.once('exit', () => liveFixtures.delete(child));

    return child;
}

/**
 * Resolves once the fixture reports itself online, plus a settle delay: the first mDNS announcements can carry only
 * a subset of the host's interfaces, and a controller that commissions against those alone cannot reach the node.
 */
export function waitForBridgeReady(child: ChildProcess, timeoutMs = 90_000, settleMs = 15_000): Promise<void> {
    return new Promise((resolve, reject) => {
        let buffer = '';
        let stderr = '';
        let settleTimer: NodeJS.Timeout | undefined;

        const finish = (error?: Error): void => {
            clearTimeout(timeout);
            if (settleTimer !== undefined) {
                clearTimeout(settleTimer);
            }
            child.stdout?.off('data', onStdout);
            child.stderr?.off('data', onStderr);
            child.off('exit', onExit);
            if (error) {
                reject(error);
            } else {
                resolve();
            }
        };

        const timeout = setTimeout(
            () => finish(new Error(`Timeout waiting for bridge fixture readiness. stderr so far:\n${stderr}`)),
            timeoutMs,
        );

        const onStdout = (data: Buffer): void => {
            buffer += data.toString();
            if (buffer.includes(READY_MARKER)) {
                child.stdout?.off('data', onStdout);
                // The readiness deadline is met; only the settle delay is still outstanding.
                clearTimeout(timeout);
                settleTimer = setTimeout(() => finish(), settleMs);
            }
        };
        const onStderr = (data: Buffer): void => {
            stderr += data.toString();
        };
        const onExit = (code: number | null): void =>
            finish(new Error(`Bridge fixture exited with code ${code} before becoming ready:\n${stderr}`));

        child.stdout?.on('data', onStdout);
        child.stderr?.on('data', onStderr);
        child.once('exit', onExit);
    });
}

/** Kills the fixture's whole process group so the npx/ts-node children cannot outlive the test run. */
export async function stopBridgeFixture(child: ChildProcess | undefined, timeoutMs = 5_000): Promise<void> {
    if (!child) {
        return;
    }
    if (child.exitCode !== null || child.signalCode !== null) {
        child.removeAllListeners();
        child.stdout?.removeAllListeners();
        child.stderr?.removeAllListeners();
        return;
    }

    await new Promise<void>(resolve => {
        const sendSignal = (signal: 'SIGINT' | 'SIGKILL'): void => killGroup(child, signal);

        const done = (): void => {
            clearTimeout(timeout);
            liveFixtures.delete(child);
            child.removeAllListeners();
            child.stdout?.removeAllListeners();
            child.stderr?.removeAllListeners();
            resolve();
        };

        const timeout = setTimeout(() => {
            sendSignal('SIGKILL');
            done();
        }, timeoutMs);

        child.once('exit', done);
        sendSignal('SIGINT');
    });
}
