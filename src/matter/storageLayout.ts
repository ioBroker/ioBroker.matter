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

    /**
     * Whether a file in the instance data directory belongs to the controller node store.
     *
     * A relocation that found its target occupied leaves the source behind, so the directory can also hold
     * the user's own OTA images, which a reset must not take with it.
     */
    export function isNodeDataEntry(name: string): boolean {
        return name.startsWith('nodes.') || name.startsWith('node-');
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
     * The part of `target` below `base`, or `undefined` when `target` is not `base` or inside it. Windows paths are
     * case-insensitive, so a setting typed with other casing still names the same folder.
     */
    function pathBelow(target: string, base: string): string | undefined {
        const [resolvedTarget, resolvedBase] = [path.resolve(target), path.resolve(base)];
        const fold = (entry: string): string => (process.platform === 'win32' ? entry.toLowerCase() : entry);
        if (fold(resolvedTarget) === fold(resolvedBase)) {
            return '';
        }
        return fold(resolvedTarget).startsWith(`${fold(resolvedBase)}${path.sep}`)
            ? resolvedTarget.slice(resolvedBase.length + 1)
            : undefined;
    }

    /**
     * The folder to import custom OTA images from.
     *
     * Before the relocation the default folder was `custom-ota` inside the instance data directory, and a user may
     * have entered that path, or a folder inside it, as the setting. Once the start moved that folder, the setting
     * would point at a folder that is recreated empty, so it then means the same place below the new default. While
     * the old folder still exists, because it could not be moved, it holds the images and stays in use.
     *
     * @param configured the `customUpdatesPath` setting, empty for the default
     * @param legacyDir the former default folder inside the instance data directory
     * @param defaultDir the current default folder
     * @param legacyDirExists whether the former default folder still exists
     */
    export function customOtaPath(
        configured: string | undefined,
        legacyDir: string,
        defaultDir: string,
        legacyDirExists: boolean,
    ): string {
        if (!configured) {
            return defaultDir;
        }
        const below = legacyDirExists ? undefined : pathBelow(configured, legacyDir);
        if (below !== undefined) {
            return path.join(defaultDir, below);
        }
        return configured;
    }

    /**
     * Move everything that used to share the instance data directory to where it belongs now.
     *
     * Safe to run at every start: once a directory is moved, its source is gone and its step does nothing. A
     * directory that could not be moved stays where it is and is reported again at the next start.
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
            // The new locations are read from now on. Only the custom OTA folder stays in use where the
            // customUpdatesPath setting points into it (see customOtaPath).
            log.error(
                `Could not move ${stranded.join(', ')} out of ${dataDir}. ` +
                    `${stranded.length === 1 ? 'It is' : 'They are'} not read from there any more, except a custom OTA ` +
                    `folder that the custom updates path setting points to. Move ` +
                    `${stranded.length === 1 ? 'it' : 'them'} by hand, or delete ` +
                    `${stranded.length === 1 ? 'it' : 'them'} to start over. This is reported at every start until then.`,
            );
        }
    }
}
