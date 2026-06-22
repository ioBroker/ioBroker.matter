import type { Endpoint } from '@matter/main';
import { LogFormat } from '@matter/main';

export function logControllerEndpoint(endpoint: Endpoint): string {
    return LogFormat('plain')(endpoint);
}
