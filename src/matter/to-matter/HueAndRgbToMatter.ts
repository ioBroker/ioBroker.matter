import { Endpoint, Time } from '@matter/main';
import { ExtendedColorLightDevice } from '@matter/main/devices';
import { Hue } from '../../lib/devices/Hue';
import { Rgb } from '../../lib/devices/Rgb';
import { RgbSingle } from '../../lib/devices/RgbSingle';
import { RgbwSingle } from '../../lib/devices/RgbwSingle';
import { EventedOnOffLightOnOffServer } from '../behaviors/EventedOnOffLightOnOffServer';
import { EventedLightingLevelControlServer } from '../behaviors/EventedLightingLevelControlServer';
import { IoBrokerEvents } from '../behaviors/IoBrokerEvents';
import { EventedExtendedColorHueSaturationColorControlServer } from '../behaviors/EventedLightingColorControlServer';
import { ColorControl } from '@matter/main/clusters';
import { rgbToXy, rgbToHsv, hsvToRgb, xyToRgb, kelvinToMireds, miredsToKelvin } from '@matter/main/behaviors';
import { GenericLightingDeviceToMatter } from './GenericLightingDeviceToMatter';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import { IoLightingIdentifyServer } from '../behaviors/IdentifyServer';
import { IoBrokerContext } from '../behaviors/IoBrokerContext';

const IoBrokerExtendedColorLightDevice = ExtendedColorLightDevice.with(
    EventedOnOffLightOnOffServer,
    EventedLightingLevelControlServer,
    EventedExtendedColorHueSaturationColorControlServer,
    IoBrokerEvents,
    IoLightingIdentifyServer,
    IoBrokerContext,
);
type IoBrokerExtendedColorLightDevice = typeof IoBrokerExtendedColorLightDevice;

/** Mapping Logic to map a ioBroker Dimmer device to a Matter DimmableLightDevice. */
export class HueAndRgbToMatter extends GenericLightingDeviceToMatter {
    readonly #ioBrokerDevice: Hue | Rgb | RgbSingle | RgbwSingle;
    readonly #matterEndpoint: Endpoint<IoBrokerExtendedColorLightDevice>;
    readonly #rgbSingleDelayTimer = Time.getTimer('rgbSingleDelayTimer', 100, () =>
        this.#setRgbValue().catch(error =>
            this.#ioBrokerDevice.adapter.log.warn(`Failed to set RGB value: ${error.message}`),
        ),
    );
    constructor(ioBrokerDevice: Hue | Rgb | RgbSingle | RgbwSingle, name: string, uuid: string) {
        const matterEndpoint = new Endpoint(IoBrokerExtendedColorLightDevice, {
            id: uuid,
            ioBrokerContext: {
                device: ioBrokerDevice,
                adapter: ioBrokerDevice.adapter,
            },
            colorControl: {
                remainingTime: 0,
                colorMode: ColorControl.ColorMode.CurrentHueAndCurrentSaturation,
                enhancedColorMode: ColorControl.EnhancedColorMode.CurrentHueAndCurrentSaturation,

                // Dummy values, will be better set later
                colorTempPhysicalMinMireds: 0,
                colorTempPhysicalMaxMireds: 65279,
                coupleColorTempToLevelMinMireds: 0,
                startUpColorTemperatureMireds: null,
                currentX: 24939,
                currentY: 24701,
                currentHue: 0,
                currentSaturation: 100,
            },
        });

        super(ioBrokerDevice, matterEndpoint, name, uuid);
        this.#ioBrokerDevice = ioBrokerDevice;
        this.#matterEndpoint = matterEndpoint;
    }

    #colorAsXy(): { x: number; y: number } {
        if (this.#ioBrokerDevice instanceof Hue) {
            const h = this.#ioBrokerDevice.getHue() ?? 0;
            const s =
                (this.#ioBrokerDevice.hasSaturation() ? (this.#ioBrokerDevice.getSaturation() ?? 100) : 100) / 100;
            const v = this.#ioBrokerDevice.hasDimmer() ? (this.#ioBrokerDevice.getDimmer() ?? 100) / 100 : 1;
            const [r, g, b] = hsvToRgb(h, s, v);
            const [x, y] = rgbToXy(r, g, b);
            return {
                x: this.#ioBrokerDevice.cropValue(x, 0, 1, false),
                y: this.#ioBrokerDevice.cropValue(y, 0, 1, false),
            };
        }
        if (this.#ioBrokerDevice.isRgbw()) {
            const { red, green, blue, white } = this.#ioBrokerDevice.getRgbwComponents();
            const w = white / 255;
            const [x, y] = rgbToXy(red / 255 + w, green / 255 + w, blue / 255 + w);
            return { x, y };
        }

        const { red, green, blue } = this.#ioBrokerDevice.getRgbComponents();
        const [x, y] = rgbToXy(red / 255, green / 255, blue / 255);
        return { x, y };
    }

    #colorAsHsv(): { h: number; s: number; v: number } {
        if (this.#ioBrokerDevice instanceof Hue) {
            const h = this.#ioBrokerDevice.getHue() ?? 0;
            const s = this.#ioBrokerDevice.hasSaturation() ? (this.#ioBrokerDevice.getSaturation() ?? 100) : 100;
            const v = this.#ioBrokerDevice.hasDimmer() ? (this.#ioBrokerDevice.getDimmer() ?? 100) : 100;
            return { h, s, v };
        }

        if (this.#ioBrokerDevice.isRgbw()) {
            const { red, green, blue, white } = this.#ioBrokerDevice.getRgbwComponents();
            const w = white / 255;
            const [h, s, v] = rgbToHsv(
                Math.min(red / 255 + w, 255),
                Math.min(green / 255 + w, 255),
                Math.min(blue / 255 + w, 255),
            );
            return { h, s: Math.round(s * 100), v: Math.round(v * 100) };
        }

        const { red, green, blue } = this.#ioBrokerDevice.getRgbComponents();
        const [h, s, v] = rgbToHsv(red / 255, green / 255, blue / 255);
        return { h, s: Math.round(s * 100), v: Math.round(v * 100) };
    }

    #xyToRgbw(x: number, y: number): { red: number; green: number; blue: number; white: number } {
        let [red, green, blue] = xyToRgb(x, y);
        const white = Math.min(red, green, blue); // White component
        red -= white;
        green -= white;
        blue -= white;
        return {
            red,
            green,
            blue,
            white,
        };
    }

    #hsvToRgbw(h: number, s: number, v: number): { red: number; green: number; blue: number; white: number } {
        let [red, green, blue] = hsvToRgb(h, s, v);
        const white = Math.min(red, green, blue); // White component
        red -= white;
        green -= white;
        blue -= white;
        return {
            red,
            green,
            blue,
            white,
        };
    }

    #toRgbString(...values: number[]): string {
        return `#${values.map(value => this.#ioBrokerDevice.cropValue(value, 0, 255, false).toString(16).padStart(2, '0')).join('')}`;
    }

    async #setRgbValue(delayed = false): Promise<void> {
        this.#rgbSingleDelayTimer.stop();
        if (delayed) {
            this.#rgbSingleDelayTimer.start();
            return;
        }
        if (this.#matterEndpoint.state.colorControl.colorMode === ColorControl.ColorMode.CurrentXAndCurrentY) {
            const { x, y } = this.#colorAsXy();
            await this.#matterEndpoint.set({
                colorControl: {
                    currentX: this.asMatterXOrY(x),
                    currentY: this.asMatterXOrY(y),
                },
            });
        } else {
            const { h, s, v } = this.#colorAsHsv();
            await this.#matterEndpoint.set({
                colorControl: {
                    colorMode: ColorControl.ColorMode.CurrentHueAndCurrentSaturation,
                    enhancedColorMode: ColorControl.EnhancedColorMode.CurrentHueAndCurrentSaturation,
                    currentHue: this.asMatterHue(h),
                    currentSaturation: this.asMatterSaturation(s),
                },
                levelControl: {
                    currentLevel: this.asMatterLevel(v),
                },
            });
        }
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
        const { min = 2_000, max = 6_536 } = this.#ioBrokerDevice.hasTemperature()
            ? (this.#ioBrokerDevice.getTemperatureMinMax() ?? {})
            : {}; // 153 till 500 mireds
        const currentTemperature = this.#ioBrokerDevice.cropValue(
            this.#ioBrokerDevice.hasTemperature() ? (this.#ioBrokerDevice.getTemperature() ?? min) : min,
            min,
            max,
        );
        const { h, s, v } = this.#colorAsHsv();
        await this.#matterEndpoint.set({
            colorControl: {
                colorMode: ColorControl.ColorMode.CurrentHueAndCurrentSaturation,
                enhancedColorMode: ColorControl.EnhancedColorMode.CurrentHueAndCurrentSaturation,
                colorTempPhysicalMinMireds: kelvinToMireds(max),
                colorTempPhysicalMaxMireds: kelvinToMireds(min),
                colorTemperatureMireds: kelvinToMireds(currentTemperature),
                coupleColorTempToLevelMinMireds: kelvinToMireds(max),
                currentHue: this.asMatterHue(h),
                currentSaturation: this.asMatterSaturation(s),
            },
            levelControl: {
                currentLevel: this.asMatterLevel(v),
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
                            colorMode: ColorControl.ColorMode.CurrentHueAndCurrentSaturation,
                            enhancedColorMode: ColorControl.EnhancedColorMode.CurrentHueAndCurrentSaturation,
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

                if (this.#ioBrokerDevice instanceof Hue) {
                    const [r, g, b] = xyToRgb(x, y);
                    const [h, s, v] = rgbToHsv(r, g, b);
                    await this.#ioBrokerDevice.setHue(h);
                    if (this.#ioBrokerDevice.hasSaturation()) {
                        await this.#ioBrokerDevice.setSaturation(Math.round(s * 100));
                    }
                    if (this.#ioBrokerDevice.hasDimmer()) {
                        await this.#ioBrokerDevice.setDimmer(Math.round(v * 100));
                    }
                } else if (
                    (this.#ioBrokerDevice instanceof RgbwSingle || this.#ioBrokerDevice instanceof Rgb) &&
                    this.#ioBrokerDevice.isRgbw()
                ) {
                    const { red, green, blue, white } = this.#xyToRgbw(x, y);
                    await this.#ioBrokerDevice.setRgbw(
                        this.#toRgbString(
                            Math.round(red * 255),
                            Math.round(green * 255),
                            Math.round(blue * 255),
                            Math.round(white * 255),
                        ),
                    );
                } else if (this.#ioBrokerDevice instanceof RgbSingle || this.#ioBrokerDevice instanceof Rgb) {
                    const [red, green, blue] = xyToRgb(x, y);
                    await this.#ioBrokerDevice.setRgb(
                        this.#toRgbString(Math.round(red * 255), Math.round(green * 255), Math.round(blue * 255)),
                    );
                }
            },
        );

        this.matterEvents.on(
            this.#matterEndpoint.eventsOf(IoBrokerEvents).colorHueControlled,
            async (hue, transitionTime) => {
                if (this.#ioBrokerDevice.hasTransitionTime() && typeof transitionTime === 'number') {
                    await this.#ioBrokerDevice.setTransitionTime(transitionTime * 100);
                }

                if (this.#ioBrokerDevice instanceof Hue) {
                    await this.#ioBrokerDevice.setHue(Math.round(hue));
                } else if (
                    (this.#ioBrokerDevice instanceof RgbwSingle || this.#ioBrokerDevice instanceof Rgb) &&
                    this.#ioBrokerDevice.isRgbw()
                ) {
                    const { red, green, blue, white } = this.#hsvToRgbw(
                        hue,
                        this.#matterEndpoint.state.colorControl.currentSaturation / 254,
                        (this.#matterEndpoint.state.levelControl.currentLevel ?? 254) / 254,
                    );
                    await this.#ioBrokerDevice.setRgbw(
                        this.#toRgbString(
                            Math.round(red * 255),
                            Math.round(green * 255),
                            Math.round(blue * 255),
                            Math.round(white * 255),
                        ),
                    );
                } else if (this.#ioBrokerDevice instanceof RgbSingle || this.#ioBrokerDevice instanceof Rgb) {
                    const [red, green, blue] = hsvToRgb(
                        hue,
                        this.#matterEndpoint.state.colorControl.currentSaturation / 254,
                        (this.#matterEndpoint.state.levelControl.currentLevel ?? 254) / 254,
                    );
                    await this.#ioBrokerDevice.setRgb(
                        this.#toRgbString(Math.round(red * 255), Math.round(green * 255), Math.round(blue * 255)),
                    );
                }
            },
        );

        this.matterEvents.on(
            this.#matterEndpoint.eventsOf(IoBrokerEvents).colorSaturationControlled,
            async (saturation, transitionTime) => {
                if (this.#ioBrokerDevice.hasTransitionTime() && typeof transitionTime === 'number') {
                    await this.#ioBrokerDevice.setTransitionTime(transitionTime * 100);
                }

                if (this.#ioBrokerDevice instanceof Hue) {
                    if (this.#ioBrokerDevice.hasSaturation()) {
                        await this.#ioBrokerDevice.setSaturation(Math.round(saturation * 100));
                    } else {
                        await this.#matterEndpoint.set({
                            colorControl: {
                                currentSaturation: 254,
                            },
                        });
                    }
                } else if (
                    (this.#ioBrokerDevice instanceof RgbwSingle || this.#ioBrokerDevice instanceof Rgb) &&
                    this.#ioBrokerDevice.isRgbw()
                ) {
                    const { red, green, blue, white } = this.#hsvToRgbw(
                        (this.#matterEndpoint.state.colorControl.currentHue / 254) * 360,
                        saturation,
                        (this.#matterEndpoint.state.levelControl.currentLevel ?? 254) / 254,
                    );
                    await this.#ioBrokerDevice.setRgbw(
                        this.#toRgbString(
                            Math.round(red * 255),
                            Math.round(green * 255),
                            Math.round(blue * 255),
                            Math.round(white * 255),
                        ),
                    );
                } else if (this.#ioBrokerDevice instanceof RgbSingle || this.#ioBrokerDevice instanceof Rgb) {
                    const [red, green, blue] = hsvToRgb(
                        (this.#matterEndpoint.state.colorControl.currentHue / 254) * 360,
                        saturation,
                        (this.#matterEndpoint.state.levelControl.currentLevel ?? 254) / 254,
                    );
                    await this.#ioBrokerDevice.setRgb(
                        this.#toRgbString(Math.round(red * 255), Math.round(green * 255), Math.round(blue * 255)),
                    );
                }
            },
        );

        this.matterEvents.on(
            this.#matterEndpoint.eventsOf(IoBrokerEvents).colorHueSaturationControlled,
            async (hue, saturation, transitionTime) => {
                if (this.#ioBrokerDevice.hasTransitionTime() && typeof transitionTime === 'number') {
                    await this.#ioBrokerDevice.setTransitionTime(transitionTime * 100);
                }

                if (this.#ioBrokerDevice instanceof Hue) {
                    await this.#ioBrokerDevice.setHue(Math.round(hue));
                    if (this.#ioBrokerDevice.hasSaturation()) {
                        await this.#ioBrokerDevice.setSaturation(Math.round(saturation * 100));
                    } else {
                        await this.#matterEndpoint.set({
                            colorControl: {
                                currentSaturation: 254,
                            },
                        });
                    }
                } else if (
                    (this.#ioBrokerDevice instanceof RgbwSingle || this.#ioBrokerDevice instanceof Rgb) &&
                    this.#ioBrokerDevice.isRgbw()
                ) {
                    const { red, green, blue, white } = this.#hsvToRgbw(
                        hue,
                        saturation,
                        (this.#matterEndpoint.state.levelControl.currentLevel ?? 254) / 254,
                    );
                    await this.#ioBrokerDevice.setRgbw(
                        this.#toRgbString(
                            Math.round(red * 255),
                            Math.round(green * 255),
                            Math.round(blue * 255),
                            Math.round(white * 255),
                        ),
                    );
                } else if (this.#ioBrokerDevice instanceof RgbSingle || this.#ioBrokerDevice instanceof Rgb) {
                    const [red, green, blue] = hsvToRgb(
                        hue,
                        saturation,
                        (this.#matterEndpoint.state.levelControl.currentLevel ?? 254) / 254,
                    );
                    await this.#ioBrokerDevice.setRgb(
                        this.#toRgbString(Math.round(red * 255), Math.round(green * 255), Math.round(blue * 255)),
                    );
                }
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
                case PropertyType.Hue:
                    await this.#matterEndpoint.set({
                        colorControl: {
                            currentHue: this.asMatterHue(event.value as number),
                        },
                    });
                    break;
                case PropertyType.Saturation:
                    await this.#matterEndpoint.set({
                        colorControl: {
                            currentSaturation: this.asMatterSaturation(event.value as number),
                        },
                    });
                    break;
                case PropertyType.Rgbw:
                case PropertyType.Rgb:
                    await this.#setRgbValue();
                    break;
                case PropertyType.Red:
                case PropertyType.Green:
                case PropertyType.Blue:
                case PropertyType.White:
                    await this.#setRgbValue(true);
                    break;
            }
        });
    }

    destroy(): Promise<void> {
        this.#rgbSingleDelayTimer.stop();
        return super.destroy();
    }
}
