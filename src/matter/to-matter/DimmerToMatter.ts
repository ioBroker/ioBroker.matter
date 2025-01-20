import { Endpoint } from '@matter/main';
import { DimmableLightDevice } from '@matter/main/devices';
import type { Dimmer } from '../../lib/devices/Dimmer';
import { EventedOnOffLightOnOffServer } from '../behaviors/EventedOnOffLightOnOffServer';
import { IoBrokerEvents } from '../behaviors/IoBrokerEvents';
import { EventedLightingLevelControlServer } from '../behaviors/EventedLightingLevelControlServer';
import { GenericLightingDeviceToMatter } from './GenericLightingDeviceToMatter';

const IoBrokerDimmableLightDevice = DimmableLightDevice.with(
    EventedOnOffLightOnOffServer,
    EventedLightingLevelControlServer,
    IoBrokerEvents,
);

export class DimmerToMatter extends GenericLightingDeviceToMatter {
    constructor(ioBrokerDevice: Dimmer, name: string, uuid: string) {
        const matterEndpoint = new Endpoint(IoBrokerDimmableLightDevice, { id: uuid });

        super(ioBrokerDevice, matterEndpoint, name, uuid);
    }

    async registerHandlersAndInitialize(): Promise<void> {
        await super.registerHandlersAndInitialize();

        await this.initializeOnOffClusterHandlers();
        await this.initializeLevelControlClusterHandlers();
    }
}
