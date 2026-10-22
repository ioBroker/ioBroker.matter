import { kelvinToMireds, miredsToKelvin } from '@matter/main/behaviors';
import { ColorControl } from '@matter/main/clusters';
import type { Ct } from '../../lib/devices/Ct';

const MIN_KELVIN = 1_000;
const MAX_KELVIN = 20_000;

/** Colour modes in which the colour of a light is not given by its colour temperature. */
export type NonTemperatureColorMode =
    ColorControl.ColorMode.CurrentHueAndCurrentSaturation | ColorControl.ColorMode.CurrentXAndCurrentY;

const ENHANCED_COLOR_MODES: Record<NonTemperatureColorMode, ColorControl.EnhancedColorMode> = {
    [ColorControl.ColorMode.CurrentHueAndCurrentSaturation]:
        ColorControl.EnhancedColorMode.CurrentHueAndCurrentSaturation,
    [ColorControl.ColorMode.CurrentXAndCurrentY]: ColorControl.EnhancedColorMode.CurrentXAndCurrentY,
};

/** Color Control attributes that describe the colour temperature range and the current colour temperature. */
export interface ColorTemperatureState {
    colorTempPhysicalMinMireds: number;
    colorTempPhysicalMaxMireds: number;
    coupleColorTempToLevelMinMireds: number;
    colorTemperatureMireds: number;
}

/** Color Control attributes that undo a colour temperature command the light cannot execute. */
export interface IgnoredColorTemperatureState {
    colorMode: ColorControl.ColorMode;
    enhancedColorMode: ColorControl.EnhancedColorMode;
    colorTemperatureMireds: number;
}

/**
 * Maps the colour temperature of an ioBroker light to the ColorTemperature feature of the Matter Color Control
 * cluster (Matter 1.6.1 Application Clusters 3.2), in both directions. All colour light converters use it, so a
 * controller command and an ioBroker update are handled the same way for every light type.
 *
 * The kelvin range is the min/max of the TEMPERATURE state, limited to 1000..20000 K. A device without a
 * TEMPERATURE state uses 1000..20000 K and stays at 1000 K (1000 mireds) on the Matter side.
 */
export class ColorTemperatureMapping {
    readonly #device: Ct;
    readonly #minKelvin: number;
    readonly #maxKelvin: number;

    constructor(device: Ct) {
        this.#device = device;
        if (!device.hasTemperature()) {
            device.adapter.log.info(
                `Device ${device.uuid} does not support color temperature, so commands will be ignored`,
            );
        }
        const { min = MIN_KELVIN, max = MAX_KELVIN } = device.hasTemperature()
            ? (device.getTemperatureMinMax() ?? {})
            : {};
        this.#minKelvin = device.cropValue(min, MIN_KELVIN, MAX_KELVIN);
        this.#maxKelvin = device.cropValue(max, MIN_KELVIN, MAX_KELVIN);
    }

    /**
     * Range attributes and the colour temperature of the ioBroker device. The highest kelvin value is the lowest
     * mireds value (3.2.7.20, 3.2.7.21); the coupling lower bound is set to the physical minimum (3.2.7.22).
     */
    get state(): ColorTemperatureState {
        return {
            colorTempPhysicalMinMireds: kelvinToMireds(this.#maxKelvin),
            colorTempPhysicalMaxMireds: kelvinToMireds(this.#minKelvin),
            coupleColorTempToLevelMinMireds: kelvinToMireds(this.#maxKelvin),
            colorTemperatureMireds: this.asMatterMireds(
                this.#device.hasTemperature() ? this.#device.getTemperature() : undefined,
            ),
        };
    }

    /**
     * Converts an ioBroker colour temperature in kelvin to ColorTemperatureMireds inside the declared range. A value
     * that is not a number maps to the lowest kelvin value.
     */
    asMatterMireds(kelvin: unknown): number {
        const value = typeof kelvin === 'number' ? kelvin : this.#minKelvin;
        return kelvinToMireds(this.#device.cropValue(value, this.#minKelvin, this.#maxKelvin));
    }

    /**
     * Writes a colour temperature that a controller sent (MoveToColorTemperature, MoveColorTemperature,
     * StepColorTemperature) to a device with a TEMPERATURE state: first the transition time (1/10 s to ms) when the
     * device has a TRANSITION_TIME state, then the colour temperature in kelvin, limited to the declared range. The
     * kelvin limit is needed because the mireds round trip can end 1 K outside the range of the state.
     *
     * Throws when the device has no TEMPERATURE state; a light that may lack one uses {@link applyCommand}.
     */
    async writeTemperature(mireds: number, transitionTime: number | null | undefined): Promise<void> {
        if (this.#device.hasTransitionTime() && typeof transitionTime === 'number') {
            await this.#device.setTransitionTime(transitionTime * 100);
        }
        await this.#device.setTemperature(
            this.#device.cropValue(miredsToKelvin(mireds), this.#minKelvin, this.#maxKelvin),
        );
    }

    /**
     * Applies a colour temperature that a controller sent to a light that also has a hue/saturation or xy colour
     * mode.
     *
     * With a TEMPERATURE state: see {@link writeTemperature}.
     *
     * Without a TEMPERATURE state: no ioBroker state is written. matter.js has already set ColorMode to
     * ColorTemperatureMireds (3.2.8.14.2), but the light keeps its colour, and 3.2.7.10 requires: "This attribute
     * SHALL indicate which attributes are currently determining the color of the device." So `setMatterState`
     * receives `lightColorMode`, the colour mode the light was in before the command, for ColorMode and
     * EnhancedColorMode (3.2.7.13), and ColorTemperatureMireds is set back to the value from {@link state}, which it
     * held before the command.
     */
    async applyCommand(
        mireds: number,
        transitionTime: number | null | undefined,
        lightColorMode: NonTemperatureColorMode,
        setMatterState: (state: IgnoredColorTemperatureState) => Promise<void>,
    ): Promise<void> {
        if (!this.#device.hasTemperature()) {
            await setMatterState({
                colorMode: lightColorMode,
                enhancedColorMode: ENHANCED_COLOR_MODES[lightColorMode],
                colorTemperatureMireds: this.asMatterMireds(undefined),
            });
            return;
        }
        await this.writeTemperature(mireds, transitionTime);
    }
}
