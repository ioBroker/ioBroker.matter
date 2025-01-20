import { Endpoint } from '@matter/main';
import { ColorTemperatureLightDevice } from '@matter/main/devices';
import type { Ct } from '../../lib/devices/Ct';
import { EventedOnOffLightOnOffServer } from '../behaviors/EventedOnOffLightOnOffServer';
import { EventedLightingLevelControlServer } from '../behaviors/EventedLightingLevelControlServer';
import { IoBrokerEvents } from '../behaviors/IoBrokerEvents';
import { EventedColorTemperatureColorControlServer } from '../behaviors/EventedLightingColorControlServer';
import { ColorControl } from '@matter/main/clusters';
import { kelvinToMireds, miredsToKelvin } from '@matter/main/behaviors';
import { GenericLightingDeviceToMatter } from './GenericLightingDeviceToMatter';
import { PropertyType } from '../../lib/devices/DeviceStateObject';

const IoBrokerColorTemperatureLightDevice = ColorTemperatureLightDevice.with(
    EventedOnOffLightOnOffServer,
    EventedLightingLevelControlServer,
    EventedColorTemperatureColorControlServer,
    IoBrokerEvents,
);
type IoBrokerColorTemperatureLightDevice = typeof IoBrokerColorTemperatureLightDevice;

export class CtToMatter extends GenericLightingDeviceToMatter {
    readonly #ioBrokerDevice: Ct;
    readonly #matterEndpoint: Endpoint<IoBrokerColorTemperatureLightDevice>;

    constructor(ioBrokerDevice: Ct, name: string, uuid: string) {
        const matterEndpoint = new Endpoint(IoBrokerColorTemperatureLightDevice, {
            id: uuid,
            colorControl: {
                remainingTime: 0,
                colorMode: ColorControl.ColorMode.ColorTemperatureMireds,
                enhancedColorMode: ColorControl.EnhancedColorMode.ColorTemperatureMireds,

                // Dummy values, will be better set later
                colorTempPhysicalMinMireds: 0,
                colorTempPhysicalMaxMireds: 65279,
                coupleColorTempToLevelMinMireds: 0,
                startUpColorTemperatureMireds: null,
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

        const { min = 2_000, max = 6_536 } = this.#ioBrokerDevice.getTemperatureMinMax() ?? {}; // 153 till 500 mireds
        const currentTemperature = this.#ioBrokerDevice.cropValue(
            this.#ioBrokerDevice.getTemperature() ?? min,
            min,
            max,
        );
        await this.#matterEndpoint.set({
            colorControl: {
                colorTempPhysicalMinMireds: kelvinToMireds(max),
                colorTempPhysicalMaxMireds: kelvinToMireds(min),
                colorTemperatureMireds: kelvinToMireds(currentTemperature),
                coupleColorTempToLevelMinMireds: kelvinToMireds(max),
            },
        });

        this.matterEvents.on(
            this.#matterEndpoint.eventsOf(IoBrokerEvents).colorTemperatureControlled,
            async (mireds, transitionTime) => {
                if (this.#ioBrokerDevice.hasTransitionTime() && typeof transitionTime === 'number') {
                    await this.#ioBrokerDevice.setTransitionTime(transitionTime * 100);
                }

                const kelvin = miredsToKelvin(mireds);
                await this.#ioBrokerDevice.setTemperature(kelvin);
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
            }
        });
    }
}
