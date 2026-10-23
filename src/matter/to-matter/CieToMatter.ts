import { Endpoint } from '@matter/main';
import { ExtendedColorLightDevice } from '@matter/main/devices';
import type { Cie } from '../../lib/devices/Cie';
import { EventedLightingLevelControlServer } from '../behaviors/EventedLightingLevelControlServer';
import { IoBrokerEvents } from '../behaviors/IoBrokerEvents';
import { EventedExtendedColorXyColorControlServer } from '../behaviors/EventedLightingColorControlServer';
import { ColorControl } from '@matter/main/clusters';
import { GenericLightingDeviceToMatter } from './GenericLightingDeviceToMatter';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import { IoLightingIdentifyServer } from '../behaviors/IdentifyServer';
import { IoBrokerContext } from '../behaviors/IoBrokerContext';
import { ColorTemperatureMapping } from './ColorTemperatureMapping';

const IoBrokerExtendedColorLightDevice = ExtendedColorLightDevice.with(
    EventedLightingLevelControlServer,
    EventedExtendedColorXyColorControlServer,
    IoBrokerEvents,
    IoLightingIdentifyServer,
    IoBrokerContext,
);
type IoBrokerExtendedColorLightDevice = typeof IoBrokerExtendedColorLightDevice;

export class CieToMatter extends GenericLightingDeviceToMatter {
    readonly #ioBrokerDevice: Cie;
    readonly #matterEndpoint: Endpoint<IoBrokerExtendedColorLightDevice>;

    constructor(ioBrokerDevice: Cie, name: string, uuid: string) {
        const matterEndpoint = new Endpoint(IoBrokerExtendedColorLightDevice, {
            id: uuid,
            ioBrokerContext: {
                device: ioBrokerDevice,
                adapter: ioBrokerDevice.adapter,
            },
            colorControl: {
                remainingTime: 0,
                colorMode: ColorControl.ColorMode.CurrentXAndCurrentY,
                enhancedColorMode: ColorControl.EnhancedColorMode.CurrentXAndCurrentY,

                // Dummy values, will be better set later
                colorTempPhysicalMinMireds: 1,
                colorTempPhysicalMaxMireds: 65279,
                coupleColorTempToLevelMinMireds: 1,
                startUpColorTemperatureMireds: null,
                currentX: 24939,
                currentY: 24701,
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
        const currentXy = this.#ioBrokerDevice.getXy() ?? { x: 0.381, y: 0.377 };
        await this.#matterEndpoint.set({
            colorControl: {
                ...colorTemperature.state,
                currentX: this.asMatterXOrY(currentXy.x),
                currentY: this.asMatterXOrY(currentXy.y),
            },
        });

        this.matterEvents.on(
            this.#matterEndpoint.eventsOf(IoBrokerEvents).colorTemperatureControlled,
            (mireds, transitionTime) =>
                colorTemperature.applyCommand(
                    mireds,
                    transitionTime,
                    ColorControl.ColorMode.CurrentXAndCurrentY,
                    async colorControl => {
                        await this.#matterEndpoint.set({ colorControl });
                    },
                ),
        );
        this.matterEvents.on(
            this.#matterEndpoint.eventsOf(IoBrokerEvents).colorXyControlled,
            async (x, y, transitionTime) => {
                if (this.#ioBrokerDevice.hasTransitionTime() && typeof transitionTime === 'number') {
                    await this.#ioBrokerDevice.setTransitionTime(transitionTime * 100);
                }

                await this.#ioBrokerDevice.setXy(this.asIoBrokerXOrY(x), this.asIoBrokerXOrY(y));
            },
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
                case PropertyType.Cie: {
                    const value = this.#ioBrokerDevice.parseCieValue(event.value as string);
                    if (value !== undefined) {
                        await this.#matterEndpoint.set({
                            colorControl: {
                                currentX: this.asMatterXOrY(value.x),
                                currentY: this.asMatterXOrY(value.y),
                            },
                        });
                    }
                    break;
                }
            }
        });
    }
}
