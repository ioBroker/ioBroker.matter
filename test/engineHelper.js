const fs = require('fs');
const setup = require('@iobroker/legacy-testing');

let rootDir = `${__dirname}/../../../`;
let objects = null;
let states  = null;
let onStateChanged = null;

function deleteFoldersRecursive(path) {
    if (path.endsWith('/')) {
        path = path.substring(0, path.length - 1);
    }
    if (fs.existsSync(path)) {
        const files = fs.readdirSync(path);
        for (const file of files) {
            const curPath = `${path}/${file}`;
            const stat = fs.statSync(curPath);
            if (stat.isDirectory()) {
                deleteFoldersRecursive(curPath);
                fs.rmdirSync(curPath);
            } else {
                fs.unlinkSync(curPath);
            }
        }
    }
}

function startIoBrokerAdmin(options) {
    options = options || {};
    if (options.rootDir) {
        rootDir = options.rootDir;
    }

    return new Promise(async resolve => {
        // delete the old project
        deleteFoldersRecursive(`${rootDir}tmp/screenshots`);

        await setup.setOfflineState(`system.adapter.admin.0.alive`, { val: false });

        setup.setupController(['admin'], async systemConfig => {
            // disable statistics and set license accepted
            systemConfig.common.licenseConfirmed = true;
            systemConfig.common.diag = 'none';
            await setup.setObject('system.config', systemConfig);

            // start admin
            const adminConfig = await setup.getAdapterConfig(0, 'admin');
            if (adminConfig && adminConfig.common) {
                adminConfig.common.enabled = true;
                await setup.setAdapterConfig(adminConfig.common, adminConfig.native, 0, 'admin');
            }

            setup.startController(
                false, // do not start widgets
                (/* id, obj */) => {},
                (id, state) => onStateChanged && onStateChanged(id, state),
                async (_objects, _states) => {
                    objects = _objects;
                    states = _states;
                    setup.startCustomAdapter('admin', 0);
                    await checkIsWelcomeStartedAsync('admin', states);
                    resolve({ objects, states });
                });
        });
    });
}

async function stopIoBrokerAdmin() {
    await setup.stopCustomAdapter('admin', 0);

    await new Promise(resolve =>
        setup.stopController(normalTerminated => {
            console.log(`Adapter normal terminated: ${normalTerminated}`);
            resolve();
        }));
}

function checkIsWelcomeStarted(adapterName, states, cb, counter) {
    counter = counter === undefined ? 20 : counter;
    if (counter === 0) {
        return cb && cb(`Cannot check value Of State system.adapter.${adapterName}.0.alive`);
    }

    states.getState(`system.adapter.${adapterName}.0.alive`, (err, state) => {
        console.log(`[${counter}]Check if ${adapterName} is started "system.adapter.${adapterName}.0.alive" = ${JSON.stringify(state)}`);
        err && console.error(err);
        if (state && state.val) {
            cb && cb();
        } else {
            setTimeout(() =>
                checkIsWelcomeStarted(adapterName, states, cb, counter - 1), 500);
        }
    });
}

function checkIsWelcomeStartedAsync(adapterName, states, counter) {
    return new Promise(resolve => checkIsWelcomeStarted(adapterName, states, resolve, counter));
}

module.exports = {
    startIoBrokerAdmin,
    stopIoBrokerAdmin,
    setOnStateChanged: cb => onStateChanged = cb
};