import { startIoBrokerAdapters, stopIoBrokerAdapters } from '@iobroker/legacy-testing/engineHelper';
import { startBrowser, stopBrowser } from '@iobroker/legacy-testing/guiHelper';
import packageJson from '../package.json';

const adapterName = packageJson.name.replace('iobroker.', '');
let gPage: any;
const rootDir = `${__dirname}/../`;

describe('test-admin-gui', () => {
    before(async function () {
        this.timeout(240_000);

        // install js-controller, admin and matter
        await startIoBrokerAdapters();
        const { page } = await startBrowser(adapterName, rootDir, process.env.CI === 'true');
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
        // Stopping js-controller and the adapters takes well over five seconds on a Windows runner
        this.timeout(60_000);
        await stopBrowser();
        console.log('BROWSER stopped');
        await stopIoBrokerAdapters();
        console.log('ioBroker stopped');
    });
});
