import { PasscodeMismatchError } from '@matter/main/protocol';

/** A commissioning that failed because the pairing code is wrong. The message doubles as the admin i18n key. */
export class WrongPairingCodeError extends Error {
    constructor(cause: unknown) {
        super('The pairing code is wrong', { cause });
        this.name = 'WrongPairingCodeError';
    }
}

/**
 * Whether a commissioning failure means the pairing code is wrong.
 *
 * Commissioning without a known address tries every discovered device that matches the discriminator in
 * parallel and fails with an aggregate of all attempts. A manual code carries only a 4-bit discriminator, so
 * another device can be among them and reject the code while the intended one failed for a different reason.
 * An aggregate therefore counts only when every attempt rejected the code.
 */
export function isWrongPasscode(error: unknown): boolean {
    if (error instanceof AggregateError) {
        return error.errors.length > 0 && error.errors.every(isWrongPasscode);
    }
    if (error instanceof PasscodeMismatchError) {
        return true;
    }
    return error instanceof Error && error.cause !== undefined && isWrongPasscode(error.cause);
}
