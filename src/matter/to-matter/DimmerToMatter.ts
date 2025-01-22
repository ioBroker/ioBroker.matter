import { Endpoint } from '@matter/main';
import { DimmableLightDevice } from '@matter/main/devices';
import type { Dimmer } from '../../lib/devices/Dimmer';
import { EventedOnOffLightOnOffServer } from '../behaviors/EventedOnOffLightOnOffServer';
import { IoBrokerEvents } from '../behaviors/IoBrokerEvents';
import { EventedLightingLevelControlServer } from '../behaviors/EventedLightingLevelControlServer';
import { GenericLightingDeviceToMatter } from './GenericLightingDeviceToMatter';
import { IoLightingIdentifyServer } from '../behaviors/IdentifyServer';
import { IoBrokerContext } from '../behaviors/IoBrokerContext';

const IoBrokerDimmableLightDevice = DimmableLightDevice.with(
    EventedOnOffLightOnOffServer,
    EventedLightingLevelControlServer,
    IoBrokerEvents,
    IoLightingIdentifyServer,
    IoBrokerContext,
);

export class DimmerToMatter extends GenericLightingDeviceToMatter {
    constructor(ioBrokerDevice: Dimmer, name: string, uuid: string) {
        const matterEndpoint = new Endpoint(IoBrokerDimmableLightDevice, {
            id: uuid,
            ioBrokerContext: {
                device: ioBrokerDevice,
                adapter: ioBrokerDevice.adapter,
            },
        });

        super(ioBrokerDevice, matterEndpoint, name, uuid);
    }

    async registerHandlersAndInitialize(): Promise<void> {
        await super.registerHandlersAndInitialize();

        await this.initializeOnOffClusterHandlers();
        await this.initializeLevelControlClusterHandlers();
    }
}
