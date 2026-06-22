import type { Endpoint as LegacyEndpoint } from '@project-chip/matter.js/device';
import { LogFormat } from '@matter/main';

export function logControllerEndpoint(endpoint: LegacyEndpoint): string {
    return LogFormat('plain')(endpoint.endpoint);
}
