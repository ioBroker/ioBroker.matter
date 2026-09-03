import { Environment, MockStorageService, StorageService } from '@matter/main';
import { MdnsService } from '@matter/main/protocol';

/**
 * Builds a Matter environment for a test suite: real nodejs platform bindings, but storage in memory so
 * nothing is written to disk.
 *
 * The MdnsService is shared with `Environment.default`, so a suite must not close it - closing it breaks
 * every later suite in the same mocha run. `closeSharedMdnsService` does it once from a root hook.
 *
 * @param name identifies the environment in matter.js logs
 */
export async function createMatterTestEnvironment(name: string): Promise<Environment> {
    await import('@matter/nodejs');
    const environment = new Environment(name, Environment.default);
    environment.set(StorageService, new MockStorageService(environment));
    return environment;
}

/** Closes the MdnsService shared by all test environments, if any suite opened it. */
export async function closeSharedMdnsService(): Promise<void> {
    if (Environment.default.has(MdnsService)) {
        await Environment.default.get(MdnsService).close();
    }
}
