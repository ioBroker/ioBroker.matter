import { Endpoint } from '@matter/main';
import { ExtendedColorLightDevice } from '@matter/main/devices';
import type { Cie } from '../../lib/devices/Cie';
import { EventedOnOffLightOnOffServer } from '../behaviors/EventedOnOffLightOnOffServer';
import { EventedLightingLevelControlServer } from '../behaviors/EventedLightingLevelControlServer';
import { IoBrokerEvents } from '../behaviors/IoBrokerEvents';
import { EventedExtendedColorXyColorControlServer } from '../behaviors/EventedLightingColorControlServer';
import { ColorControl } from '@matter/main/clusters';
import { kelvinToMireds, miredsToKelvin } from '@matter/main/behaviors';
import { GenericLightingDeviceToMatter } from './GenericLightingDeviceToMatter';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import { IoLightingIdentifyServer } from '../behaviors/IdentifyServer';
import { IoBrokerContext } from '../behaviors/IoBrokerContext';

const IoBrokerExtendedColorLightDevice = ExtendedColorLightDevice.with(
    EventedOnOffLightOnOffServer,
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

        await this.initializeOnOffClusterHandlers();
        await this.initializeLevelControlClusterHandlers();

        if (!this.#ioBrokerDevice.hasTemperature()) {
            this.#ioBrokerDevice.adapter.log.info(
                `Device ${this.#ioBrokerDevice.uuid} does not support color temperature, so commands will be ignored`,
            );
        }
        const { min = 1_000, max = 20_000 } = this.#ioBrokerDevice.hasTemperature()
            ? (this.#ioBrokerDevice.getTemperatureMinMax() ?? {})
            : {}; // 50 till 1.000 mireds
        const currentTemperature = this.#ioBrokerDevice.cropValue(
            this.#ioBrokerDevice.hasTemperature() ? (this.#ioBrokerDevice.getTemperature() ?? min) : min,
            min,
            max,
        );
        const currentXy = this.#ioBrokerDevice.getXy() ?? { x: 0.381, y: 0.377 };
        await this.#matterEndpoint.set({
            colorControl: {
                colorTempPhysicalMinMireds: kelvinToMireds(max),
                colorTempPhysicalMaxMireds: kelvinToMireds(min),
                colorTemperatureMireds: kelvinToMireds(currentTemperature),
                coupleColorTempToLevelMinMireds: kelvinToMireds(max),
                currentX: this.asMatterXOrY(currentXy.x),
                currentY: this.asMatterXOrY(currentXy.y),
            },
        });

        this.matterEvents.on(
            this.#matterEndpoint.eventsOf(IoBrokerEvents).colorTemperatureControlled,
            async (mireds, transitionTime) => {
                if (!this.#ioBrokerDevice.hasTemperature()) {
                    if (this.#ioBrokerDevice.hasTransitionTime() && typeof transitionTime === 'number') {
                        await this.#ioBrokerDevice.setTransitionTime(transitionTime * 100);
                    }

                    const kelvin = miredsToKelvin(mireds);
                    await this.#ioBrokerDevice.setTemperature(kelvin);
                } else {
                    await this.#matterEndpoint.set({
                        colorControl: {
                            colorTemperatureMireds: kelvinToMireds(min),
                        },
                    });
                }
            },
        );
        this.matterEvents.on(
            this.#matterEndpoint.eventsOf(IoBrokerEvents).colorXyControlled,
            async (x, y, transitionTime) => {
                if (this.#ioBrokerDevice.hasTransitionTime() && typeof transitionTime === 'number') {
                    await this.#ioBrokerDevice.setTransitionTime(transitionTime * 100);
                }

                await this.#ioBrokerDevice.setXy(x, y);
            },
        );

        this.#ioBrokerDevice.onChange(async event => {
            switch (event.property) {
                case PropertyType.Temperature: {
                    const value = this.#ioBrokerDevice.cropValue((event.value as number) ?? min, min, max);
                    await this.#matterEndpoint.set({
                        colorControl: {
                            colorTemperatureMireds: kelvinToMireds(value),
                        },
                    });
                    break;
                }
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
