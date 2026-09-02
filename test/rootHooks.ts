import { closeSharedMdnsService } from './helpers/matterTestEnvironment';

export const mochaHooks = {
    async afterAll(): Promise<void> {
        await closeSharedMdnsService();
    },
};
