import { Endpoint } from '@matter/main';
import { OnOffLightDevice } from '@matter/main/devices';
import { GenericLightingDeviceToMatter } from './GenericLightingDeviceToMatter';
import { EventedOnOffLightOnOffServer } from '../behaviors/EventedOnOffLightOnOffServer';
import { IoBrokerEvents } from '../behaviors/IoBrokerEvents';
import type { Light } from '../../lib/devices/Light';
import { IoLightingIdentifyServer } from '../behaviors/IdentifyServer';
import { IoBrokerContext } from '../behaviors/IoBrokerContext';

const IoBrokerOnOffLightDevice = OnOffLightDevice.with(
    EventedOnOffLightOnOffServer,
    IoBrokerEvents,
    IoLightingIdentifyServer,
    IoBrokerContext,
);

/** Mapping Logic to map a ioBroker Light device to a Matter OnOffLightDevice. */
export class LightToMatter extends GenericLightingDeviceToMatter {
    constructor(ioBrokerDevice: Light, name: string, uuid: string) {
        const matterEndpoint = new Endpoint(IoBrokerOnOffLightDevice, {
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
    }
}
