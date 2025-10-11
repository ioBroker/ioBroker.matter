import engineHelper = require('@iobroker/legacy-testing/engineHelper');
import guiHelper = require('@iobroker/legacy-testing/guiHelper');
import packageJson = require('../package.json');

const adapterName = packageJson.name.replace('iobroker.', '');
let gPage: any;
const rootDir = `${__dirname}/../`;

describe('test-admin-gui', () => {
    before(async function () {
        this.timeout(240_000);

        // install js-controller, admin and matter
        await engineHelper.startIoBrokerAdapters();
        const { page } = await guiHelper.startBrowser(adapterName, rootDir, process.env.CI === 'true');
        gPage = page;
    });

    it('Check admin server', async function () {
        this.timeout(15_000);
        return new Promise<void>(resolve =>
            setTimeout(async () => {
                await gPage.waitForSelector('.MuiTabs-root', { timeout: 15_000 });
                resolve();
            }, 5000),
        );
    });

    after(async function () {
        this.timeout(5000);
        await guiHelper.stopBrowser();
        console.log('BROWSER stopped');
        await engineHelper.stopIoBrokerAdapters();
        console.log('ioBroker stopped');
    });
});
