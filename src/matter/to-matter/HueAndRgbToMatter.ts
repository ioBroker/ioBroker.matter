import { Endpoint, Time, Millis } from '@matter/main';
import { ExtendedColorLightDevice } from '@matter/main/devices';
import { Hue } from '../../lib/devices/Hue';
import { Rgb } from '../../lib/devices/Rgb';
import { RgbSingle } from '../../lib/devices/RgbSingle';
import { RgbwSingle } from '../../lib/devices/RgbwSingle';
import { EventedLightingLevelControlServer } from '../behaviors/EventedLightingLevelControlServer';
import { IoBrokerEvents } from '../behaviors/IoBrokerEvents';
import { EventedExtendedColorHueSaturationColorControlServer } from '../behaviors/EventedLightingColorControlServer';
import { ColorControl } from '@matter/main/clusters';
import { rgbToXy, rgbToHsv, hsvToRgb, xyToRgb } from '@matter/main/behaviors';
import { GenericLightingDeviceToMatter } from './GenericLightingDeviceToMatter';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import { IoLightingIdentifyServer } from '../behaviors/IdentifyServer';
import { IoBrokerContext } from '../behaviors/IoBrokerContext';
import { ColorTemperatureMapping, type NonTemperatureColorMode } from './ColorTemperatureMapping';
import { LightingLevel } from '../ConversionUtils';

const IoBrokerExtendedColorLightDevice = ExtendedColorLightDevice.with(
    EventedLightingLevelControlServer,
    EventedExtendedColorHueSaturationColorControlServer,
    IoBrokerEvents,
    IoLightingIdentifyServer,
    IoBrokerContext,
);
type IoBrokerExtendedColorLightDevice = typeof IoBrokerExtendedColorLightDevice;

/** Mapping Logic to map a ioBroker Hue/RGB device to a Matter ExtendedColorLightDevice. */
export class HueAndRgbToMatter extends GenericLightingDeviceToMatter {
    readonly #ioBrokerDevice: Hue | Rgb | RgbSingle | RgbwSingle;
    readonly #matterEndpoint: Endpoint<IoBrokerExtendedColorLightDevice>;
    #lightColorMode: NonTemperatureColorMode = ColorControl.ColorMode.CurrentHueAndCurrentSaturation;
    readonly #rgbSingleDelayTimer = Time.getTimer('rgbSingleDelayTimer', Millis(100), () =>
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
                colorTempPhysicalMinMireds: 1,
                colorTempPhysicalMaxMireds: 65279,
                coupleColorTempToLevelMinMireds: 1,
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
            const [x, y] = rgbToXy(...this.#rgbwAsRgb(red, green, blue, white));
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
            const [h, s, v] = rgbToHsv(...this.#rgbwAsRgb(red, green, blue, white));
            return { h, s: Math.round(s * 100), v: Math.round(v * 100) };
        }

        const { red, green, blue } = this.#ioBrokerDevice.getRgbComponents();
        const [h, s, v] = rgbToHsv(red / 255, green / 255, blue / 255);
        return { h, s: Math.round(s * 100), v: Math.round(v * 100) };
    }

    /**
     * CurrentLevel as the HSV value (0..1) of an RGB device, whose RGB state carries the brightness. The level is
     * used directly, not through the ioBroker percent, so the RGB value keeps the 254 steps of the level.
     */
    #levelAsColorValue(): number {
        return (this.#matterEndpoint.state.levelControl.currentLevel ?? LightingLevel.MAX) / LightingLevel.MAX;
    }

    /** Mixes the white channel into red, green and blue; the result is in 0..1, as the colour conversions expect. */
    #rgbwAsRgb(red: number, green: number, blue: number, white: number): [number, number, number] {
        const mix = (value: number): number => Math.min((value + white) / 255, 1);
        return [mix(red), mix(green), mix(blue)];
    }

    /**
     * Brightness (HSV value, 0..1) an xy command keeps: that of the current RGB or RGBW state, white mixed in as for
     * the Matter colour. A black state gives full brightness, because a colour command on a light that reports on
     * must show the colour.
     */
    #xyBrightness(device: Rgb | RgbSingle | RgbwSingle): number {
        let brightness: number;
        if (device.isRgbw()) {
            const { red, green, blue, white } = device.getRgbwComponents();
            brightness = Math.max(...this.#rgbwAsRgb(red, green, blue, white));
        } else {
            const { red, green, blue } = device.getRgbComponents();
            brightness = Math.max(red, green, blue) / 255;
        }
        return brightness || 1;
    }

    /** RGB (0..1) of an xy colour, scaled so that its largest channel is the given HSV value. */
    #xyToRgb(x: number, y: number, brightness: number): [number, number, number] {
        const [red, green, blue] = xyToRgb(x, y);
        const scale = brightness / (Math.max(red, green, blue) || 1);
        return [red * scale, green * scale, blue * scale];
    }

    #xyToRgbw(x: number, y: number, brightness: number): { red: number; green: number; blue: number; white: number } {
        let [red, green, blue] = this.#xyToRgb(x, y, brightness);
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

        await this.initializeOnOffAndLevelClusterHandlers();

        const colorTemperature = new ColorTemperatureMapping(this.#ioBrokerDevice);
        const { h, s, v } = this.#colorAsHsv();
        await this.#matterEndpoint.set({
            colorControl: {
                colorMode: ColorControl.ColorMode.CurrentHueAndCurrentSaturation,
                enhancedColorMode: ColorControl.EnhancedColorMode.CurrentHueAndCurrentSaturation,
                ...colorTemperature.state,
                currentHue: this.asMatterHue(h),
                currentSaturation: this.asMatterSaturation(s),
            },
            levelControl: {
                currentLevel: this.asMatterLevel(v),
            },
        });

        this.matterEvents.on(this.#matterEndpoint.events.colorControl.colorMode$Changed, colorMode => {
            if (colorMode !== ColorControl.ColorMode.ColorTemperatureMireds) {
                this.#lightColorMode = colorMode;
            }
        });
        this.matterEvents.on(
            this.#matterEndpoint.eventsOf(IoBrokerEvents).colorTemperatureControlled,
            (mireds, transitionTime) =>
                colorTemperature.applyCommand(mireds, transitionTime, this.#lightColorMode, async colorControl => {
                    await this.#matterEndpoint.set({ colorControl });
                }),
        );

        this.matterEvents.on(
            this.#matterEndpoint.eventsOf(IoBrokerEvents).colorXyControlled,
            async (matterX, matterY, transitionTime) => {
                const x = this.asIoBrokerXOrY(matterX);
                const y = this.asIoBrokerXOrY(matterY);
                if (this.#ioBrokerDevice.hasTransitionTime() && typeof transitionTime === 'number') {
                    await this.#ioBrokerDevice.setTransitionTime(transitionTime * 100);
                }

                if (this.#ioBrokerDevice instanceof Hue) {
                    const [r, g, b] = xyToRgb(x, y);
                    const [h, s] = rgbToHsv(r, g, b);
                    await this.#ioBrokerDevice.setHue(Math.round(h));
                    if (this.#ioBrokerDevice.hasSaturation()) {
                        await this.#ioBrokerDevice.setSaturation(Math.round(s * 100));
                    }
                } else if (
                    (this.#ioBrokerDevice instanceof RgbwSingle || this.#ioBrokerDevice instanceof Rgb) &&
                    this.#ioBrokerDevice.isRgbw()
                ) {
                    const { red, green, blue, white } = this.#xyToRgbw(x, y, this.#xyBrightness(this.#ioBrokerDevice));
                    await this.#ioBrokerDevice.setRgbw(
                        this.#toRgbString(
                            Math.round(red * 255),
                            Math.round(green * 255),
                            Math.round(blue * 255),
                            Math.round(white * 255),
                        ),
                    );
                } else if (this.#ioBrokerDevice instanceof RgbSingle || this.#ioBrokerDevice instanceof Rgb) {
                    const [red, green, blue] = this.#xyToRgb(x, y, this.#xyBrightness(this.#ioBrokerDevice));
                    await this.#ioBrokerDevice.setRgb(
                        this.#toRgbString(Math.round(red * 255), Math.round(green * 255), Math.round(blue * 255)),
                    );
                }
            },
        );

        this.matterEvents.on(
            this.#matterEndpoint.eventsOf(IoBrokerEvents).colorHueControlled,
            async (hue, transitionTime) => {
                hue = (hue / 254) * 360;
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
                        this.#levelAsColorValue(),
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
                        this.#levelAsColorValue(),
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
                saturation /= 254;
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
                        this.#levelAsColorValue(),
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
                        this.#levelAsColorValue(),
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
                // Convert from Matter to required range
                saturation /= 254;
                hue = (hue / 254) * 360;

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
                    const { red, green, blue, white } = this.#hsvToRgbw(hue, saturation, this.#levelAsColorValue());
                    await this.#ioBrokerDevice.setRgbw(
                        this.#toRgbString(
                            Math.round(red * 255),
                            Math.round(green * 255),
                            Math.round(blue * 255),
                            Math.round(white * 255),
                        ),
                    );
                } else if (this.#ioBrokerDevice instanceof RgbSingle || this.#ioBrokerDevice instanceof Rgb) {
                    const [red, green, blue] = hsvToRgb(hue, saturation, this.#levelAsColorValue());
                    await this.#ioBrokerDevice.setRgb(
                        this.#toRgbString(Math.round(red * 255), Math.round(green * 255), Math.round(blue * 255)),
                    );
                }
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
