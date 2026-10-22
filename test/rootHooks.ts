import { Environment } from '@matter/main';
import { closeSharedMdnsService } from './helpers/matterTestEnvironment';

export const mochaHooks = {
    beforeAll(): void {
        // Every node a test builds must conform to its device types; a violation fails the construction.
        // MATTER_ENDPOINT_VALIDATION=warn logs all violations of a run instead of stopping at the first.
        Environment.default.vars.set('endpoint.validation', process.env.MATTER_ENDPOINT_VALIDATION ?? 'strict');
    },
    async afterAll(): Promise<void> {
        await closeSharedMdnsService();
    },
};
