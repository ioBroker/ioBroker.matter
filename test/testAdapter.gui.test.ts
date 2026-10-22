import { startIoBrokerAdapters, stopIoBrokerAdapters } from '@iobroker/legacy-testing/engineHelper';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import packageJson from '../package.json';

const adapterName = packageJson.name.replace('iobroker.', '');
const adminUrl = 'http://127.0.0.1:8081';

/** legacy-testing's `startBrowser()` hardcodes a 30 s launch and a 5 s page timeout, and CI runners exceed both. */
const BROWSER_LAUNCH_TIMEOUT_MS = 90_000;
const ADMIN_PAGE_TIMEOUT_MS = 60_000;

let browser: Browser | undefined;
let page: Page;

async function waitForAdmin(timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        try {
            await fetch(adminUrl, { signal: AbortSignal.timeout(2000) });
            return;
        } catch (error) {
            if (Date.now() > deadline) {
                throw new Error(`Admin did not answer on ${adminUrl} within ${timeoutMs} ms`, { cause: error });
            }
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
}

describe('test-admin-gui', () => {
    before(async function () {
        this.timeout(420_000);

        // install js-controller, admin and matter
        await startIoBrokerAdapters();

        browser = await puppeteer.launch({
            headless: process.env.CI === 'true',
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            timeout: BROWSER_LAUNCH_TIMEOUT_MS,
        });
        [page] = await browser.pages();
        page.setDefaultTimeout(ADMIN_PAGE_TIMEOUT_MS);
        await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
        page.on('console', message => console.log(`[BROWSER] ${message.type().toUpperCase()} ${message.text()}`));
        page.on('pageerror', error => console.log(`[BROWSER] ${String(error)}`));

        await waitForAdmin(ADMIN_PAGE_TIMEOUT_MS);
        await page.goto(`${adminUrl}/adapter/${adapterName}/index_m.html?&newReact=true&0&react=dark`, {
            waitUntil: 'domcontentloaded',
        });
    });

    it('Check admin server', async function () {
        this.timeout(30_000);
        await page.waitForSelector('.MuiTabs-root', { timeout: 25_000 });
    });

    after(async function () {
        // Stopping js-controller and the adapters takes well over five seconds on a Windows runner
        this.timeout(60_000);
        await browser?.close();
        console.log('BROWSER stopped');
        await stopIoBrokerAdapters();
        console.log('ioBroker stopped');
    });
});
