import { deepStrictEqual, ok, strictEqual } from 'node:assert';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StorageLayout } from '../src/matter/storageLayout';

/** Mirrors production: the target is a sibling of the instance data directory, not a child of it. */
let root: string;
let dataDir: string;
let cacheDir: string;
let customOtaDir: string;

function makeLog(): StorageLayout.Log & { warnings: string[]; errors: string[] } {
    const warnings = new Array<string>();
    const errors = new Array<string>();
    return {
        info: () => {},
        debug: () => {},
        warn: message => {
            warnings.push(message);
        },
        error: message => {
            errors.push(message);
        },
        warnings,
        errors,
    };
}

/** Builds an instance data directory holding the node store plus the directories that must move out. */
function makeDataDir(): string {
    const dir = join(root, 'matter.0');
    mkdirSync(dir);
    dataDir = dir;
    writeFileSync(join(dataDir, 'nodes.peer1.endpoints.0.29.0'), '{}');
    writeFileSync(join(dataDir, 'node-15398113178295236884.0.29.0'), '{}');
    mkdirSync(join(dataDir, 'ns-ota'));
    writeFileSync(join(dataDir, 'ns-ota', 'bin.130a.50.prod.9082'), 'superseded image');
    mkdirSync(join(dataDir, 'ota'));
    writeFileSync(join(dataDir, 'ota', 'bin.130a.50.prod.9082'), 'current image');
    mkdirSync(join(dataDir, 'custom-ota'));
    writeFileSync(join(dataDir, 'custom-ota', 'my-image.ota'), 'hand imported');
    mkdirSync(join(dataDir, 'ns-vendors'));
    writeFileSync(join(dataDir, 'ns-vendors', 'vendors'), '[]');
    return dir;
}

describe('StorageLayout.relocate', () => {
    beforeEach(() => {
        root = mkdtempSync(join(tmpdir(), 'iobroker-matter-layout-'));
        dataDir = makeDataDir();
        cacheDir = join(root, 'matter.0.cache');
        customOtaDir = join(root, 'matter.0.custom-ota');
    });

    afterEach(() => {
        rmSync(root, { recursive: true, force: true });
    });

    it('leaves the controller node store in place', async () => {
        await StorageLayout.relocate(dataDir, { cacheDir, customOtaDir }, makeLog());

        ok(existsSync(join(dataDir, 'nodes.peer1.endpoints.0.29.0')));
        ok(existsSync(join(dataDir, 'node-15398113178295236884.0.29.0')));
    });

    it('moves the namespace directories without touching their content', async () => {
        await StorageLayout.relocate(dataDir, { cacheDir, customOtaDir }, makeLog());

        ok(!existsSync(join(dataDir, 'ota')));
        ok(!existsSync(join(dataDir, 'ns-vendors')));
        strictEqual(readFileSync(join(cacheDir, 'ota', 'bin.130a.50.prod.9082'), 'utf8'), 'current image');
        strictEqual(readFileSync(join(cacheDir, 'ns-vendors', 'vendors'), 'utf8'), '[]');
    });

    it('gives hand-imported OTA images a folder of their own, outside the cache', async () => {
        await StorageLayout.relocate(dataDir, { cacheDir, customOtaDir }, makeLog());

        strictEqual(readFileSync(join(customOtaDir, 'my-image.ota'), 'utf8'), 'hand imported');
        ok(!existsSync(join(cacheDir, 'custom-ota')));
        ok(!existsSync(join(dataDir, 'custom-ota')));
    });

    it('drops the pre-0.17 OTA copy instead of moving it', async () => {
        await StorageLayout.relocate(dataDir, { cacheDir, customOtaDir }, makeLog());

        ok(!existsSync(join(dataDir, 'ns-ota')));
        ok(!existsSync(join(cacheDir, 'ns-ota')));
    });

    it('is a silent no-op on a second run', async () => {
        await StorageLayout.relocate(dataDir, { cacheDir, customOtaDir }, makeLog());
        const log = makeLog();

        await StorageLayout.relocate(dataDir, { cacheDir, customOtaDir }, log);

        deepStrictEqual(log.warnings, []);
        strictEqual(readFileSync(join(cacheDir, 'ota', 'bin.130a.50.prod.9082'), 'utf8'), 'current image');
    });

    it('leaves a target that already holds data untouched, and says so', async () => {
        const target = cacheDir;
        mkdirSync(join(target, 'ota'), { recursive: true });
        writeFileSync(join(target, 'ota', 'bin.fff1.8004.test.1'), 'only at the target');
        const log = makeLog();

        await StorageLayout.relocate(dataDir, { cacheDir: target, customOtaDir }, log);

        // Merging the two would have to decide which copy wins, so both are kept and the user decides
        strictEqual(readFileSync(join(dataDir, 'ota', 'bin.130a.50.prod.9082'), 'utf8'), 'current image');
        strictEqual(readFileSync(join(target, 'ota', 'bin.fff1.8004.test.1'), 'utf8'), 'only at the target');
        ok(!existsSync(join(target, 'ota', 'bin.130a.50.prod.9082')));
        strictEqual(log.errors.length, 1);
        ok(log.errors[0].includes('"ota"'));
    });

    it('does not delete a subdirectory of the source it did not move', async () => {
        const target = customOtaDir;
        mkdirSync(join(dataDir, 'custom-ota', 'vendor'), { recursive: true });
        writeFileSync(join(dataDir, 'custom-ota', 'vendor', 'image.bin'), 'hand imported');
        mkdirSync(join(target, 'vendor'), { recursive: true });

        await StorageLayout.relocate(dataDir, { cacheDir, customOtaDir: target }, makeLog());

        strictEqual(readFileSync(join(dataDir, 'custom-ota', 'vendor', 'image.bin'), 'utf8'), 'hand imported');
    });

    it('preserves a directory it cannot move and says so loudly', async () => {
        const target = cacheDir;
        mkdirSync(target, { recursive: true });
        // A file where the directory should go
        writeFileSync(join(target, 'ota'), 'in the way');
        const log = makeLog();

        await StorageLayout.relocate(dataDir, { cacheDir: target, customOtaDir }, log);

        strictEqual(readFileSync(join(dataDir, 'ota', 'bin.130a.50.prod.9082'), 'utf8'), 'current image');
        strictEqual(log.errors.length, 1);
        ok(log.errors[0].includes('"ota"'));
        ok(log.errors[0].includes(target));
    });
});
