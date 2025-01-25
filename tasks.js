const { existsSync, copyFileSync, readFileSync, statSync, writeFileSync } = require('node:fs');
const { deleteFoldersRecursive, copyFiles, npmInstall, buildReact, patchHtmlFile } = require('@iobroker/build-tools');

function clean() {
    deleteFoldersRecursive(`${__dirname}/admin`, ['matter.png', 'matter.svg']);
    deleteFoldersRecursive(`${__dirname}/src-admin/build`);
}

function copyAllFiles() {
    copyFiles(['src-admin/build/**/*', '!src-admin/build/index.html'], 'admin/');
}

function copyI18n() {
    copyFiles(['src/lib/i18n/**/*'], 'build/lib/i18n');
}

function sync2files(src, dst) {
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

async function patch() {
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
    npmInstall(`${__dirname}/src-admin`).catch(e => {
        console.error(`Cannot install npm: ${e}`);
        process.exit(1);
    });
} else if (process.argv.includes('--2-build')) {
    buildReact(`${__dirname}/src-admin/`, {
        rootDir: __dirname,
        vite: true,
    }).catch(e => {
        console.error(`Cannot build react: ${e}`);
        process.exit(1);
    });
} else if (process.argv.includes('--3-copy')) {
    copyAllFiles();
} else if (process.argv.includes('--4-patch')) {
    patch().catch(e => {
        console.error(`Cannot patch: ${e}`);
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
        .catch(e => {
            console.error(`Cannot build: ${e}`);
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
        .catch(e => {
            console.error(`Cannot build admin controls: ${e}`);
            process.exit(1);
        });
}
