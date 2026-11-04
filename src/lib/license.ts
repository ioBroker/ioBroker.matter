import { createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';

/**
 * Outcome of asking iobroker.pro for the subscriptions of a user.
 *
 * `unknown` means the server could not answer (no network, DNS not ready, server error). That says nothing about
 * the subscription, so it must not be handled like `invalid`: a start before the router is up would otherwise
 * drop every device above the free limit from the bridges.
 */
export type LicenseVerdict =
    | {
          status: 'valid';
          /** The signed subscription that unlocked the adapter, kept to verify it offline later; absent for testers */
          token?: string;
      }
    | { status: 'invalid'; reason: string }
    | { status: 'unknown'; error: string };

/** Fetches `path` of the iobroker.pro user API and returns the response body; throws like axios */
export type LicenseRequest = (path: string) => Promise<unknown>;

/** The last subscription verified online, so a start without internet can verify it with the certificate alone */
export interface StoredSubscription {
    /** {@link loginHash} of the account it belongs to */
    login: string;
    token: string;
}

interface SubscriptionPayload {
    name?: string;
    valid_till?: string; // ISO 8601 date string
}

/** Identifies an account in the stored subscription without keeping its login in plain text */
export function loginHash(login: string): string {
    return createHash('sha256').update(login).digest('hex');
}

/**
 * Whether a signed subscription unlocks the adapter at `now`: a remote or assistant subscription that is not expired.
 *
 * @throws {jwt.JsonWebTokenError} when the signature does not verify against `cert`
 */
export function subscriptionValidAt(token: string, cert: string, now: Date): boolean {
    const decoded = jwt.verify(token, cert) as SubscriptionPayload;
    return (
        !!decoded.name &&
        (decoded.name.startsWith('remote.') || decoded.name.startsWith('assistant.')) &&
        !!decoded.valid_till &&
        new Date(decoded.valid_till) > now
    );
}

function failure(error: any): LicenseVerdict {
    if (error?.response?.status === 401) {
        return { status: 'invalid', reason: 'User login or password is wrong' };
    }
    return { status: 'unknown', error: `${error}` };
}

/**
 * Ask iobroker.pro whether the user has a subscription that unlocks the adapter.
 *
 * @param request fetches a path of the user API with the user's credentials
 * @param cert the certificate the subscriptions are signed with
 * @param now the time the subscriptions must be valid at
 * @param warn receives subscriptions whose signature does not verify
 */
export async function verifyLicenseOnline(
    request: LicenseRequest,
    cert: string,
    now: Date,
    warn: (message: string) => void,
): Promise<LicenseVerdict> {
    let subscriptions: { json: string }[];
    try {
        subscriptions = (await request('/api/v1/subscriptions')) as { json: string }[];
    } catch (error) {
        return failure(error);
    }
    for (const subscription of Array.isArray(subscriptions) ? subscriptions : []) {
        try {
            if (subscriptionValidAt(subscription.json, cert, now)) {
                return { status: 'valid', token: subscription.json };
            }
        } catch (error) {
            warn(`Cannot verify license: ${error}`);
        }
    }

    let user: { tester?: boolean } | undefined;
    try {
        user = (await request('/api/v1/user')) as { tester?: boolean } | undefined;
    } catch (error) {
        return failure(error);
    }
    if (user?.tester) {
        return { status: 'valid' };
    }
    return { status: 'invalid', reason: 'No valid ioBroker.pro subscription found' };
}
