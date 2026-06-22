import { type Endpoint, LogFormat } from '@matter/main';

export function logServerEndpoint(endpoint: Endpoint): string {
    return LogFormat('plain')(endpoint);
}
