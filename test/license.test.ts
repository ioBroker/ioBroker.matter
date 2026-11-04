import { deepStrictEqual, ok, strictEqual, throws } from 'node:assert';
import { generateKeyPairSync } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { type LicenseRequest, subscriptionValidAt, verifyLicenseOnline } from '../src/lib/license';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const cert = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const otherKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
const now = new Date('2026-10-27T10:00:00Z');

function token(name: string, validTill: string, key = privateKey): string {
    return jwt.sign({ name, valid_till: validTill }, key, { algorithm: 'RS256' });
}

/** Answers each user API path with a body, or throws the given error the way axios does */
function api(responses: { [path: string]: unknown }): LicenseRequest & { calls: string[] } {
    const calls = new Array<string>();
    const request = async (path: string): Promise<unknown> => {
        calls.push(path);
        const response = responses[path];
        if (response instanceof Error) {
            throw response;
        }
        return response;
    };
    return Object.assign(request, { calls });
}

function networkError(): Error {
    return Object.assign(new Error('getaddrinfo EAI_AGAIN iobroker.pro'), { code: 'EAI_AGAIN' });
}

function httpError(status: number): Error {
    return Object.assign(new Error(`Request failed with status code ${status}`), { response: { status } });
}

describe('license', () => {
    describe('subscriptionValidAt', () => {
        it('accepts a remote or assistant subscription until it expires', () => {
            ok(subscriptionValidAt(token('remote.year', '2027-01-01'), cert, now));
            ok(subscriptionValidAt(token('assistant.month', '2026-11-01'), cert, now));
            ok(!subscriptionValidAt(token('remote.year', '2026-10-01'), cert, now));
            ok(!subscriptionValidAt(token('other.year', '2027-01-01'), cert, now));
        });

        it('refuses a subscription signed with another key', () => {
            throws(() => subscriptionValidAt(token('remote.year', '2027-01-01', otherKey), cert, now));
        });
    });

    describe('verifyLicenseOnline', () => {
        it('returns the subscription that unlocks the adapter', async () => {
            const valid = token('remote.year', '2027-01-01');
            const request = api({
                '/api/v1/subscriptions': [{ json: token('remote.year', '2026-01-01') }, { json: valid }],
            });
            deepStrictEqual(await verifyLicenseOnline(request, cert, now, () => {}), { status: 'valid', token: valid });
            deepStrictEqual(request.calls, ['/api/v1/subscriptions']);
        });

        it('reports a server that cannot be reached as unknown, not as no license', async () => {
            for (const error of [networkError(), httpError(502)]) {
                const verdict = await verifyLicenseOnline(api({ '/api/v1/subscriptions': error }), cert, now, () => {});
                strictEqual(verdict.status, 'unknown');
            }
            const verdict = await verifyLicenseOnline(
                api({ '/api/v1/subscriptions': [], '/api/v1/user': networkError() }),
                cert,
                now,
                () => {},
            );
            strictEqual(verdict.status, 'unknown');
        });

        it('reports wrong credentials as invalid', async () => {
            const verdict = await verifyLicenseOnline(
                api({ '/api/v1/subscriptions': httpError(401) }),
                cert,
                now,
                () => {},
            );
            strictEqual(verdict.status, 'invalid');
        });

        it('falls back to the tester flag of the user', async () => {
            const forged = token('remote.year', '2027-01-01', otherKey);
            const warnings = new Array<string>();
            const tester = await verifyLicenseOnline(
                api({ '/api/v1/subscriptions': [{ json: forged }], '/api/v1/user': { tester: true } }),
                cert,
                now,
                message => warnings.push(message),
            );
            deepStrictEqual(tester, { status: 'valid' });
            strictEqual(warnings.length, 1);

            const user = await verifyLicenseOnline(
                api({ '/api/v1/subscriptions': [], '/api/v1/user': {} }),
                cert,
                now,
                () => {},
            );
            strictEqual(user.status, 'invalid');
        });
    });
});
