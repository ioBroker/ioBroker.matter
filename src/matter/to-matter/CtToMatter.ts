import { Endpoint } from '@matter/main';
import { ColorTemperatureLightDevice } from '@matter/main/devices';
import type { Ct } from '../../lib/devices/Ct';
import { EventedLightingLevelControlServer } from '../behaviors/EventedLightingLevelControlServer';
import { IoBrokerEvents } from '../behaviors/IoBrokerEvents';
import { EventedColorTemperatureColorControlServer } from '../behaviors/EventedLightingColorControlServer';
import { ColorControl } from '@matter/main/clusters';
import { GenericLightingDeviceToMatter } from './GenericLightingDeviceToMatter';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import { IoBrokerContext } from '../behaviors/IoBrokerContext';
import { IoLightingIdentifyServer } from '../behaviors/IdentifyServer';
import { ColorTemperatureMapping } from './ColorTemperatureMapping';

const IoBrokerColorTemperatureLightDevice = ColorTemperatureLightDevice.with(
    EventedLightingLevelControlServer,
    EventedColorTemperatureColorControlServer,
    IoBrokerEvents,
    IoLightingIdentifyServer,
    IoBrokerContext,
);
type IoBrokerColorTemperatureLightDevice = typeof IoBrokerColorTemperatureLightDevice;

export class CtToMatter extends GenericLightingDeviceToMatter {
    readonly #ioBrokerDevice: Ct;
    readonly #matterEndpoint: Endpoint<IoBrokerColorTemperatureLightDevice>;

    constructor(ioBrokerDevice: Ct, name: string, uuid: string) {
        const matterEndpoint = new Endpoint(IoBrokerColorTemperatureLightDevice, {
            id: uuid,
            ioBrokerContext: {
                device: ioBrokerDevice,
                adapter: ioBrokerDevice.adapter,
            },
            colorControl: {
                remainingTime: 0,
                colorMode: ColorControl.ColorMode.ColorTemperatureMireds,
                enhancedColorMode: ColorControl.EnhancedColorMode.ColorTemperatureMireds,

                // Dummy values, will be better set later
                colorTempPhysicalMinMireds: 1,
                colorTempPhysicalMaxMireds: 65279,
                coupleColorTempToLevelMinMireds: 1,
                startUpColorTemperatureMireds: null,
            },
        });

        super(ioBrokerDevice, matterEndpoint, name, uuid);

        this.#ioBrokerDevice = ioBrokerDevice;
        this.#matterEndpoint = matterEndpoint;
    }

    async registerHandlersAndInitialize(): Promise<void> {
        await super.registerHandlersAndInitialize();

        await this.initializeOnOffAndLevelClusterHandlers();

        const colorTemperature = new ColorTemperatureMapping(this.#ioBrokerDevice);
        await this.#matterEndpoint.set({ colorControl: colorTemperature.state });

        this.matterEvents.on(
            this.#matterEndpoint.eventsOf(IoBrokerEvents).colorTemperatureControlled,
            (mireds, transitionTime) => colorTemperature.writeTemperature(mireds, transitionTime),
        );

        this.#ioBrokerDevice.onChange(async event => {
            switch (event.property) {
                case PropertyType.Temperature:
                    await this.#matterEndpoint.set({
                        colorControl: {
                            colorTemperatureMireds: colorTemperature.asMatterMireds(event.value),
                        },
                    });
                    break;
            }
        });
    }
}
