import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Layout of the files matter.js and we keep on disk.
 *
 * The instance data directory belongs to the controller node store alone: its file storage driver indexes
 * every entry it finds there, directories included, as one of its own. Everything else — the namespaces
 * matter.js resolves itself plus our own transient files — lives beside it instead.
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace StorageLayout {
    /**
     * matter.js up to 0.16 kept OTA images in the KV namespace we mapped to "ns-ota"; since 0.17 they live
     * in the "ota" blob namespace, so this copy has been superseded rather than relocated.
     */
    const SUPERSEDED_DIRS = ['ns-ota'];

    const relocations = (targets: Targets): { name: string; to: string }[] => [
        { name: 'ota', to: path.join(targets.cacheDir, 'ota') },
        { name: 'ns-certificates', to: path.join(targets.cacheDir, 'ns-certificates') },
        { name: 'ns-vendors', to: path.join(targets.cacheDir, 'ns-vendors') },
        { name: 'custom-ota', to: targets.customOtaDir },
    ];

    /**
     * Whether a controller storage entry holds cluster data of a paired node.
     *
     * Those attributes change with every report, so they stay in the instance data directory instead of
     * becoming ioBroker states. The rest of what a peer stores — its commissioning and network state —
     * is small, changes rarely, and belongs in the objects database with everything else.
     */
    export function isClusterData(contexts: string[]): boolean {
        // Peer data of matter.js 0.17 and earlier, kept where it was written
        if (contexts[0]?.startsWith('node-')) {
            return true;
        }
        return (
            contexts[0] === 'nodes' &&
            contexts[1]?.startsWith('peer') === true &&
            contexts[2] === 'endpoints' &&
            /^\d+$/.test(contexts[4] ?? '')
        );
    }

    export interface Targets {
        /** Root for the files matter.js downloads and can fetch again. */
        cacheDir: string;
        /** Folder the user drops OTA images into, so it stands on its own rather than inside our storage. */
        customOtaDir: string;
    }

    export interface Log {
        info: (message: string) => void;
        warn: (message: string) => void;
        error: (message: string) => void;
        debug: (message: string) => void;
    }

    async function exists(entry: string): Promise<boolean> {
        try {
            await fs.stat(entry);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Move `from` onto `to`, merging when `to` already exists. Entries already present at the target are the
     * newer ones and win; what remains at the source afterwards is retired with it. A failure leaves the
     * source untouched, so it defers the move to the next start rather than losing data.
     */
    async function moveDirectory(from: string, to: string): Promise<void> {
        // Renaming onto an existing target fails with a different code per platform - ENOTEMPTY, EEXIST or,
        // on Windows, EPERM - so the target is looked at rather than the error.
        if (!(await exists(to))) {
            await fs.rename(from, to);
            return;
        }

        for (const entry of await fs.readdir(from)) {
            const target = path.join(to, entry);
            if (!(await exists(target))) {
                await fs.rename(path.join(from, entry), target);
            }
        }
        await fs.rm(from, { recursive: true, force: true });
    }

    /**
     * Move everything that used to share the instance data directory to where it belongs now.
     *
     * Idempotent — once moved, the sources are gone and every step becomes a no-op.
     */
    export async function relocate(dataDir: string, targets: Targets, log: Log): Promise<void> {
        for (const name of SUPERSEDED_DIRS) {
            const superseded = path.join(dataDir, name);
            try {
                await fs.rm(superseded, { recursive: true, force: true });
            } catch (error) {
                log.debug(`Can not remove superseded storage directory ${superseded}: ${error.message}`);
            }
        }

        const stranded = new Array<string>();
        for (const { name, to } of relocations(targets)) {
            const from = path.join(dataDir, name);
            if (!(await exists(from))) {
                continue;
            }
            try {
                await fs.mkdir(path.dirname(to), { recursive: true });
                await moveDirectory(from, to);
                log.info(`Moved storage directory "${name}" to ${to}`);
            } catch (error) {
                log.warn(`Can not move storage directory ${from} to ${to}: ${error.message}`);
                stranded.push(`"${name}" to ${to}`);
            }
        }

        if (stranded.length) {
            // These are read from their new locations from now on, so anything left behind is invisible.
            log.error(
                `Could not move ${stranded.join(', ')} out of ${dataDir}, so ` +
                    `${stranded.length === 1 ? 'it' : 'they'} will not be used. Move ` +
                    `${stranded.length === 1 ? 'it' : 'them'} by hand, or delete ` +
                    `${stranded.length === 1 ? 'it' : 'them'} to start over.`,
            );
        }
    }
}
