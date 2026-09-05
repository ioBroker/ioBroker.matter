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
     * Move `from` onto `to`.
     *
     * A target that already exists is left alone: it holds the newer data, and the source is reported rather
     * than merged into it, so nothing of the user's can be overwritten or deleted here.
     */
    async function moveDirectory(from: string, to: string): Promise<boolean> {
        if (await exists(to)) {
            return false;
        }
        await fs.rename(from, to);
        return true;
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
                if (await moveDirectory(from, to)) {
                    log.info(`Moved storage directory "${name}" to ${to}`);
                } else {
                    stranded.push(`"${name}" to ${to}`);
                }
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
