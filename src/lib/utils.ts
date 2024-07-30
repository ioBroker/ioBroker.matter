import { createHash } from 'crypto';

/** MD5 hash a string */
export function md5(str: string): string {
    return createHash('md5').update(str).digest('hex');
}
