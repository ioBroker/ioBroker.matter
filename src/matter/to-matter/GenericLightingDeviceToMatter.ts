import type { Dimmer } from '../../lib/devices/Dimmer';
import { Light } from '../../lib/devices/Light';
import type { Ct } from '../../lib/devices/Ct';
import type { Cie } from '../../lib/devices/Cie';
import type { Rgb } from '../../lib/devices/Rgb';
import type { RgbSingle } from '../../lib/devices/RgbSingle';
import type { RgbwSingle } from '../../lib/devices/RgbwSingle';
import { GenericElectricityDataDeviceToMatter } from './GenericElectricityDataDeviceToMatter';
import type { Endpoint } from '@matter/main';
import { IdentifyServer } from '@matter/main/behaviors';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import { IoBrokerEvents } from '../behaviors/IoBrokerEvents';
import type { IdentifyOptions } from './GenericDeviceToMatter';
import { EventedLightingLevelControlServer } from '../behaviors/EventedLightingLevelControlServer';
import { EventedOnOffLightOnOffServer } from '../behaviors/EventedOnOffLightOnOffServer';

const MIN_CIE_XY_VALUE = 0;
const MAX_CIE_XY_VALUE = 0xfeff; // this value comes directly from the ZCL specification table 5.3
const MIN_HUE_VALUE = 0;
const MAX_HUE_VALUE = 0xfe;
const MIN_SATURATION_VALUE = 0;
const MAX_SATURATION_VALUE = 0xfe;
const MIN_LEVEL_VALUE = 1;
const MAX_LEVEL_VALUE = 0xfe;

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

        let isIdentifying = false;
        const identifyOptions: IdentifyOptions = {};
        this.matterEvents.on(this.#matterEndpoint.eventsOf(IdentifyServer).identifyTime$Changed, async value => {
            if (!this.#ioBrokerDevice.hasPower()) {
                return; // TODO
            }

            // identifyTime is set when an identify command is called and then decreased every second while identify logic runs.
            if (value > 0 && !isIdentifying) {
                isIdentifying = true;
                const identifyInitialState = !!this.#ioBrokerDevice.getPower();

                identifyOptions.currentState = identifyInitialState;
                identifyOptions.initialState = identifyInitialState;

                this.handleIdentify(identifyOptions);
            } else if (value === 0) {
                isIdentifying = false;
                await this.stopIdentify(identifyOptions);
            }
        });
    }

    get matterEndpoints(): Endpoint[] {
        return [this.#matterEndpoint];
    }

    get ioBrokerDevice(): Light | Dimmer | Ct | Cie | Rgb | RgbSingle | RgbwSingle {
        return this.#ioBrokerDevice;
    }

    // Just change the power state every second
    async doIdentify(identifyOptions: IdentifyOptions): Promise<void> {
        if (!this.#ioBrokerDevice.hasPower()) {
            return;
        }

        identifyOptions.currentState = !identifyOptions.currentState;
        await this.#ioBrokerDevice.setPower(identifyOptions.currentState as boolean);
    }

    // Restore the given initial state after the identity process is over
    async resetIdentify(identifyOptions: IdentifyOptions): Promise<void> {
        if (!this.#ioBrokerDevice.hasPower()) {
            return;
        }

        await this.#ioBrokerDevice.setPower(identifyOptions.initialState as boolean);
    }

    protected async initializeOnOffClusterHandlers(): Promise<void> {
        await this.#matterEndpoint.setStateOf(EventedOnOffLightOnOffServer, {
            onOff: this.#ioBrokerDevice.hasPower() ? !!this.#ioBrokerDevice.getPower() : true,
        });

        this.matterEvents.on(this.#matterEndpoint.eventsOf(IoBrokerEvents).onOffControlled, async on => {
            if (this.#ioBrokerDevice.hasPower()) {
                await this.#ioBrokerDevice.setPower(on);
            } else {
                // Report always on when no Power is supported
                await this.#matterEndpoint.setStateOf(EventedOnOffLightOnOffServer, {
                    onOff: true,
                });
            }
        });
        if (!this.#ioBrokerDevice.hasPower()) {
            this.#ioBrokerDevice.adapter.log.info(
                `Device ${this.#ioBrokerDevice.deviceType} (${this.#ioBrokerDevice.uuid}) has no mapped power state`,
            );
        }

        this.#ioBrokerDevice.onChange(async event => {
            switch (event.property) {
                case PropertyType.Power:
                case PropertyType.PowerActual:
                    await this.#matterEndpoint.setStateOf(EventedOnOffLightOnOffServer, {
                        onOff: !!event.value,
                    });
                    break;
            }
        });
    }

    protected async initializeLevelControlClusterHandlers(): Promise<void> {
        if (this.#ioBrokerDevice instanceof Light) {
            throw new Error('Device is not a Dimmable light');
        }
        const ioBrokerDevice = this.#ioBrokerDevice; // Pin limited type for the scope of this function

        const currentLevel = ioBrokerDevice.hasDimmer()
            ? ioBrokerDevice.cropValue(ioBrokerDevice.getLevel() ?? 100, 1, 100)
            : 100;
        await this.#matterEndpoint.setStateOf(EventedLightingLevelControlServer, {
            currentLevel: this.asMatterLevel(currentLevel),
        });

        this.matterEvents.on(
            this.#matterEndpoint.eventsOf(IoBrokerEvents).dimmerLevelControlled,
            async (level, transitionTime) => {
                if (ioBrokerDevice.hasDimmer()) {
                    if (ioBrokerDevice.hasTransitionTime() && transitionTime !== null && transitionTime !== undefined) {
                        await ioBrokerDevice.setTransitionTime(transitionTime * 100);
                    }

                    if (level !== null) {
                        await ioBrokerDevice.setLevel(Math.round((level / 254) * 100));
                    }
                } else {
                    // Report always 100% when no Dimmer is supported
                    await this.#matterEndpoint.setStateOf(EventedLightingLevelControlServer, {
                        currentLevel: 254,
                    });
                }
            },
        );
        if (!ioBrokerDevice.hasDimmer()) {
            ioBrokerDevice.adapter.log.info(
                `Device ${ioBrokerDevice.deviceType} (${ioBrokerDevice.uuid}) has no mapped dimmer state`,
            );
        }

        ioBrokerDevice.onChange(async event => {
            switch (event.property) {
                case PropertyType.Level:
                case PropertyType.LevelActual:
                case PropertyType.Dimmer: {
                    const value = ioBrokerDevice.cropValue((event.value as number) ?? 100, 1, 100);

                    await this.#matterEndpoint.setStateOf(EventedLightingLevelControlServer, {
                        currentLevel: this.asMatterLevel(value),
                    });
                    break;
                }
            }
        });
    }

    /** Converts the given value in 0..1 range to a valid CIE XY Matter value. */
    asMatterXOrY(value: number): number {
        return this.#ioBrokerDevice.cropValue(Math.round(value * 65536), MIN_CIE_XY_VALUE, MAX_CIE_XY_VALUE);
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

    /** Converts the given value in 0..100 range to a valid Level Matter value. */
    asMatterLevel(value: number): number {
        return this.#ioBrokerDevice.cropValue(Math.round((value / 100) * 254), MIN_LEVEL_VALUE, MAX_LEVEL_VALUE);
    }
}
