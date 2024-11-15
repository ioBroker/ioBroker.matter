const { existsSync, copyFileSync } = require('node:fs');
const { deleteFoldersRecursive, copyFiles, npmInstall, buildReact, patchHtmlFile } = require('@iobroker/build-tools');

function clean() {
    deleteFoldersRecursive(`${__dirname}/admin`, ['matter.png']);
    deleteFoldersRecursive(`${__dirname}/src-admin/build`);
}

function copyAllFiles() {
    copyFiles(['src-admin/build/**/*', '!src-admin/build/index.html'], 'admin/');
}

async function patch() {
    await patchHtmlFile(`${__dirname}/src-admin/build/index.html`);
    if (!existsSync(`${__dirname}/src-admin/build/index.html`)) {
        console.error('Index.html not found!');
        process.exit(2);
    }
    copyFileSync(`${__dirname}/src-admin/build/index.html`, `${__dirname}/admin/index_m.html`);
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
} else {
    clean();

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
