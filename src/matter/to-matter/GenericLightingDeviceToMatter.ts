import { Dimmer } from '../../lib/devices/Dimmer';
import { Light } from '../../lib/devices/Light';
import { Ct } from '../../lib/devices/Ct';
import type { Cie } from '../../lib/devices/Cie';
import type { Rgb } from '../../lib/devices/Rgb';
import type { RgbSingle } from '../../lib/devices/RgbSingle';
import type { RgbwSingle } from '../../lib/devices/RgbwSingle';
import { GenericElectricityDataDeviceToMatter } from './GenericElectricityDataDeviceToMatter';
import type { Endpoint } from '@matter/main';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import { IoBrokerEvents } from '../behaviors/IoBrokerEvents';
import { EventedLightingLevelControlServer } from '../behaviors/EventedLightingLevelControlServer';
import { LightingLevel } from '../ConversionUtils';
import { OnOffLevelMapping } from './OnOffLevelMapping';
import { MatterOnOffAttribute } from './MatterOnOffAttribute';

const MIN_CIE_XY_VALUE = 0;
const MAX_CIE_XY_VALUE = 0xfeff; // this value comes directly from the ZCL specification table 5.3
const MIN_HUE_VALUE = 0;
const MAX_HUE_VALUE = 0xfe;
const MIN_SATURATION_VALUE = 0;
const MAX_SATURATION_VALUE = 0xfe;

export abstract class GenericLightingDeviceToMatter extends GenericElectricityDataDeviceToMatter {
    readonly #ioBrokerDevice: Light | Dimmer | Ct | Cie | Rgb | RgbSingle | RgbwSingle;
    readonly #matterEndpoint: Endpoint<any>;

    constructor(
        ioBrokerDevice: Light | Dimmer | Ct | Cie | Rgb | RgbSingle | RgbwSingle,
        matterEndpoint: Endpoint<any>,
        name: string,
        uuid: string,
    ) {
        super(name, uuid);
        this.#matterEndpoint = matterEndpoint;
        this.#ioBrokerDevice = ioBrokerDevice;

        this.addElectricityDataClusters(this.#matterEndpoint, this.#ioBrokerDevice);
    }

    async registerHandlersAndInitialize(): Promise<void> {
        super.registerHandlersAndInitialize();

        await this.initializeElectricityStateHandlers(this.#matterEndpoint, this.#ioBrokerDevice);
    }

    get matterEndpoints(): Endpoint[] {
        return [this.#matterEndpoint];
    }

    get ioBrokerDevice(): Light | Dimmer | Ct | Cie | Rgb | RgbSingle | RgbwSingle {
        return this.#ioBrokerDevice;
    }

    /**
     * Maps the ioBroker power and dimmer states to OnOff and, for a dimmable light, LevelControl, see
     * {@link OnOffLevelMapping}.
     */
    protected async initializeOnOffAndLevelClusterHandlers(): Promise<void> {
        const ioBrokerDevice = this.#ioBrokerDevice;
        const dimmable = ioBrokerDevice instanceof Light ? undefined : ioBrokerDevice;
        const hasPower = ioBrokerDevice.hasPower() || ioBrokerDevice.hasPowerActual();
        const onOff = new MatterOnOffAttribute(this.#matterEndpoint);
        const mapping = new OnOffLevelMapping(
            {
                power: hasPower
                    ? {
                          get: () => !!ioBrokerDevice.getPower(),
                          set: ioBrokerDevice.hasPower() ? on => ioBrokerDevice.setPower(on) : undefined,
                      }
                    : undefined,
                level: dimmable?.hasDimmer()
                    ? { get: () => dimmable.getDimmer(), set: percent => dimmable.setDimmer(percent) }
                    : undefined,
            },
            {
                setOnOff: value => onOff.write(value),
                currentLevel: () => this.#matterEndpoint.stateOf(EventedLightingLevelControlServer).currentLevel,
                setCurrentLevel: currentLevel =>
                    this.#matterEndpoint.setStateOf(EventedLightingLevelControlServer, { currentLevel }),
            },
            LightingLevel,
        );
        await mapping.initialize();

        if (!hasPower) {
            ioBrokerDevice.adapter.log.info(
                `Device ${ioBrokerDevice.deviceType} (${ioBrokerDevice.uuid}) has no mapped power state`,
            );
        }
        onOff.observe(this.matterEvents, on => mapping.matterOnOffChanged(on));
        ioBrokerDevice.onChange(async event => {
            switch (event.property) {
                case PropertyType.Power:
                case PropertyType.PowerActual:
                    await mapping.ioBrokerPowerChanged(!!event.value);
                    break;
                case PropertyType.Level:
                    if (ioBrokerDevice instanceof Dimmer && ioBrokerDevice.hasLevelActual()) {
                        break;
                    }
                    await mapping.ioBrokerLevelChanged(event.value);
                    break;
                case PropertyType.LevelActual:
                case PropertyType.Dimmer:
                    await mapping.ioBrokerLevelChanged(event.value);
                    break;
                case PropertyType.Brightness:
                    if (ioBrokerDevice instanceof Ct && ioBrokerDevice.dimmerIsBrightness()) {
                        await mapping.ioBrokerLevelChanged(event.value);
                    }
                    break;
            }
        });

        if (dimmable === undefined) {
            return;
        }
        if (!dimmable.hasDimmer()) {
            // Report always 100% when no Dimmer is supported
            await this.#matterEndpoint.setStateOf(EventedLightingLevelControlServer, {
                currentLevel: LightingLevel.MAX,
            });
            dimmable.adapter.log.info(`Device ${dimmable.deviceType} (${dimmable.uuid}) has no mapped dimmer state`);
        }
        this.matterEvents.on(
            this.#matterEndpoint.eventsOf(IoBrokerEvents).dimmerLevelControlled,
            async (level, transitionTime) => {
                if (!dimmable.hasDimmer()) {
                    await this.#matterEndpoint.setStateOf(EventedLightingLevelControlServer, {
                        currentLevel: LightingLevel.MAX,
                    });
                    return;
                }
                await mapping.matterLevelControlled(level, async () => {
                    if (dimmable.hasTransitionTime() && transitionTime !== null && transitionTime !== undefined) {
                        await dimmable.setTransitionTime(transitionTime * 100);
                    }
                });
            },
        );
    }

    /** Converts the given value in 0..1 range to a valid CIE XY Matter value. */
    asMatterXOrY(value: number): number {
        return this.#ioBrokerDevice.cropValue(Math.round(value * 65536), MIN_CIE_XY_VALUE, MAX_CIE_XY_VALUE);
    }

    /** Converts a CIE XY Matter value (CurrentX/CurrentY, value x 65536) to the 0..1 range. */
    asIoBrokerXOrY(value: number): number {
        return value / 65536;
    }

    /** Converts the given value in 0..360 range to a valid Hue Matter value. */
    asMatterHue(value: number): number {
        return this.#ioBrokerDevice.cropValue(Math.round((value * 254) / 360), MIN_HUE_VALUE, MAX_HUE_VALUE);
    }

    /** Converts the given value in 0..100 range to a valid Saturation Matter value. */
    asMatterSaturation(value: number): number {
        return this.#ioBrokerDevice.cropValue(
            Math.round((value / 100) * 254),
            MIN_SATURATION_VALUE,
            MAX_SATURATION_VALUE,
        );
    }

    /**
     * Converts a percent to a valid Level Matter value, see {@link LightingLevel.fromPercent}. NaN, which an ioBroker
     * state without a value gives, becomes the minimum level.
     */
    asMatterLevel(value: number): number {
        return LightingLevel.fromPercent(this.#ioBrokerDevice.cropValue(value, 0, 100));
    }
}
