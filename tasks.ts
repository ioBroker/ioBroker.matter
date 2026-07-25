import { existsSync, copyFileSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { deleteFoldersRecursive, copyFiles, npmInstall, buildReact, patchHtmlFile } from '@iobroker/build-tools';

// ts-node appends its own bootstrap arguments (including the relative "--project tsconfig.tasks.json")
// to process.execArgv, and child_process.fork() inherits them. The children started by
// @iobroker/build-tools run with cwd=src-admin, where that relative tsconfig does not exist,
// so they would die with "TS5083: Cannot read file .../src-admin/tsconfig.tasks.json".
// The children are plain JS (vite) and do not need ts-node at all.
process.execArgv = [];

function clean(): void {
    deleteFoldersRecursive(`${__dirname}/admin`, ['matter.png', 'matter.svg']);
    deleteFoldersRecursive(`${__dirname}/src-admin/build`);
}

function copyAllFiles(): void {
    copyFiles(['src-admin/build/**/*', '!src-admin/build/index.html'], 'admin/');
}

function copyI18n(): void {
    copyFiles(['src/lib/i18n/**/*'], 'build/lib/i18n');
}

function sync2files(src: string, dst: string): void {
    const srcTxt = readFileSync(src).toString('utf8');
    const destTxt = readFileSync(dst).toString('utf8');
    if (srcTxt !== destTxt) {
        const srcs = statSync(src);
        const dest = statSync(dst);
        if (srcs.mtime > dest.mtime) {
            writeFileSync(dst, srcTxt);
        } else {
            writeFileSync(src, destTxt);
        }
    }
}

async function patch(): Promise<void> {
    await patchHtmlFile(`${__dirname}/src-admin/build/index.html`, '../..');
    if (!existsSync(`${__dirname}/src-admin/build/index.html`)) {
        console.error('Index.html not found!');
        process.exit(2);
    }
    copyFileSync(`${__dirname}/src-admin/build/index.html`, `${__dirname}/admin/index_m.html`);
    copyFileSync(`${__dirname}/src-admin/build/index.html`, `${__dirname}/admin/tab_m.html`);
}

if (process.argv.includes('--0-clean')) {
    clean();
} else if (process.argv.includes('--1-npm')) {
    npmInstall(`${__dirname}/src-admin`).catch((e: unknown) => {
        console.error(`Cannot install npm: ${e as string}`);
        process.exit(1);
    });
} else if (process.argv.includes('--2-build')) {
    buildReact(`${__dirname}/src-admin/`, {
        rootDir: __dirname,
        vite: true,
    }).catch((e: unknown) => {
        console.error(`Cannot build react: ${e as string}`);
        process.exit(1);
    });
} else if (process.argv.includes('--3-copy')) {
    copyAllFiles();
} else if (process.argv.includes('--4-patch')) {
    patch().catch((e: unknown) => {
        console.error(`Cannot patch: ${e as string}`);
        process.exit(1);
    });
} else if (process.argv.includes('--build')) {
    clean();
    sync2files(`${__dirname}/src/lib/vendorIDs.ts`, `${__dirname}/src-admin/src/utils/vendorIDs.ts`);
    npmInstall(`${__dirname}/src-admin`)
        .then(() =>
            buildReact(`${__dirname}/src-admin/`, {
                rootDir: __dirname,
                vite: true,
            }),
        )
        .then(() => copyAllFiles())
        .then(() => patch())
        .catch((e: unknown) => {
            console.error(`Cannot build: ${e as string}`);
            process.exit(1);
        });
} else if (process.argv.includes('--copy-i18n')) {
    copyI18n();
} else {
    clean();
    sync2files(`${__dirname}/src/lib/vendorIDs.ts`, `${__dirname}/src-admin/src/utils/vendorIDs.ts`);

    npmInstall(`${__dirname}/src-admin`)
        .then(() =>
            buildReact(`${__dirname}/src-admin/`, {
                rootDir: __dirname,
                vite: true,
            }),
        )
        .then(() => copyAllFiles())
        .then(() => patch())
        .catch((e: unknown) => {
            console.error(`Cannot build admin controls: ${e as string}`);
            process.exit(1);
        });
}
