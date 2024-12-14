import { Endpoint } from '@matter/main';
import { ColorTemperatureLightDevice } from '@matter/main/devices';
import type { GenericDevice } from '../../lib';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { IdentifyOptions } from './GenericDeviceToMatter';
import { GenericElectricityDataDeviceToMatter } from './GenericElectricityDataDeviceToMatter';
import { initializeMaintenanceStateHandlers } from './SharedStateHandlers';
import type Ct from '../../lib/devices/Ct';
import { kelvinToMireds as kToM, miredsToKelvin } from '@matter/main/behaviors';
import { EventedOnOffLightOnOffServer } from '../behaviors/EventedOnOffLightOnOffServer';
import { EventedLightingLevelControlServer } from '../behaviors/EventedLightingLevelControlServer';
import { IoBrokerEvents } from '../behaviors/IoBrokerEvents';
import { EventedColorTemperatureColorControlServer } from '../behaviors/EventedLightingColorControlServer';
import { ColorControl } from '@matter/main/clusters';

// Remove with matter.js > 0.11.5
function kelvinToMireds(kelvin: number): number {
    return Math.round(kToM(kelvin));
}

const IoBrokerColorTemperatureLightDevice = ColorTemperatureLightDevice.with(
    EventedOnOffLightOnOffServer,
    EventedLightingLevelControlServer,
    EventedColorTemperatureColorControlServer,
    IoBrokerEvents,
);
type IoBrokerColorTemperatureLightDevice = typeof IoBrokerColorTemperatureLightDevice;

/** Mapping Logic to map a ioBroker Dimmer device to a Matter DimmableLightDevice. */
export class CtToMatter extends GenericElectricityDataDeviceToMatter {
    readonly #ioBrokerDevice: Ct;
    readonly #matterEndpoint: Endpoint<IoBrokerColorTemperatureLightDevice>;

    constructor(ioBrokerDevice: GenericDevice, name: string, uuid: string) {
        super(name, uuid);
        this.#matterEndpoint = new Endpoint(IoBrokerColorTemperatureLightDevice, {
            id: uuid,
            colorControl: {
                remainingTime: 0,

                // Dummy values, will be better set later
                colorMode: ColorControl.ColorMode.ColorTemperatureMireds,
                colorTempPhysicalMinMireds: 0,
                colorTempPhysicalMaxMireds: 65279,
                coupleColorTempToLevelMinMireds: 0,
                startUpColorTemperatureMireds: null,
            },
        });
        this.#ioBrokerDevice = ioBrokerDevice as Ct;
        this.addElectricityDataClusters(this.#matterEndpoint, this.#ioBrokerDevice);
    }

    // Just change the power state every second
    doIdentify(identifyOptions: IdentifyOptions): Promise<void> {
        identifyOptions.currentState = !identifyOptions.currentState;
        return this.#ioBrokerDevice.setPower(identifyOptions.currentState as boolean);
    }

    // Restore the given initial state after the identity process is over
    resetIdentify(identifyOptions: IdentifyOptions): Promise<void> {
        return this.#ioBrokerDevice.setPower(identifyOptions.initialState as boolean);
    }

    get matterEndpoints(): Endpoint[] {
        return [this.#matterEndpoint];
    }

    get ioBrokerDevice(): Ct {
        return this.#ioBrokerDevice;
    }

    registerMatterHandlers(): void {
        if (this.ioBrokerDevice.hasPower()) {
            this.#matterEndpoint.events.ioBrokerEvents.onOffControlled.on(async on => {
                const currentValue = !!this.#ioBrokerDevice.getPower();
                if (on !== currentValue) {
                    await this.#ioBrokerDevice.setPower(on);
                }
            });
        } else {
            this.#ioBrokerDevice.adapter.log.info(
                `Device ${this.#ioBrokerDevice.deviceType} (${this.ioBrokerDevice.uuid}) has no mapped power state`,
            );
        }

        if (this.ioBrokerDevice.hasDimmer()) {
            this.#matterEndpoint.events.ioBrokerEvents.dimmerLevelControlled.on(async level => {
                const currentValue = this.#ioBrokerDevice.getDimmer();
                if (level !== currentValue && level !== null) {
                    await this.#ioBrokerDevice.setDimmer(Math.round((level / 254) * 100));
                }
            });
        } else {
            this.#ioBrokerDevice.adapter.log.info(
                `Device ${this.#ioBrokerDevice.deviceType} (${this.ioBrokerDevice.uuid}) has no mapped dimmer state`,
            );
        }

        this.#matterEndpoint.events.ioBrokerEvents.colorTemperatureControlled.on(async (mireds: number) => {
            const currentValue = this.#ioBrokerDevice.getTemperature();

            const kelvin = miredsToKelvin(mireds);
            if (kelvin !== currentValue) {
                await this.#ioBrokerDevice.setTemperature(kelvin);
            }
        });

        if (this.ioBrokerDevice.hasPower()) {
            let isIdentifying = false;
            const identifyOptions: IdentifyOptions = {};
            this.matterEvents.on(this.#matterEndpoint.events.identify.identifyTime$Changed, async value => {
                // identifyTime is set when an identify command is called and then decreased every second while indentify logic runs.
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
    }

    async registerIoBrokerHandlersAndInitialize(): Promise<void> {
        const { min = 2_000, max = 6_536 } = this.#ioBrokerDevice.getTemperatureMinMax() ?? {}; // 153 till 500 mireds

        this.#ioBrokerDevice.onChange(async event => {
            switch (event.property) {
                case PropertyType.Power:
                    await this.#matterEndpoint.set({
                        onOff: {
                            onOff: !!event.value,
                        },
                    });
                    break;
                case PropertyType.Dimmer: {
                    const value = this.#ioBrokerDevice.cropValue((event.value as number) ?? 0, 0, 100);

                    await this.#matterEndpoint.set({
                        levelControl: {
                            currentLevel: Math.round((value / 100) * 254),
                        },
                    });
                    break;
                }
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

        const currentLevel = this.ioBrokerDevice.hasDimmer()
            ? this.#ioBrokerDevice.cropValue(this.#ioBrokerDevice.getDimmer() ?? 0, 0, 100)
            : 100;
        const currentTemperature = this.#ioBrokerDevice.cropValue(
            this.#ioBrokerDevice.getTemperature() ?? min,
            min,
            max,
        );

        // init current state from ioBroker side
        await this.#matterEndpoint.set({
            onOff: {
                onOff: this.ioBrokerDevice.hasPower() ? !!this.#ioBrokerDevice.getPower() : true,
            },
            levelControl: {
                currentLevel: Math.round((currentLevel / 100) * 254) || 1,
            },
            colorControl: {
                colorTempPhysicalMinMireds: kelvinToMireds(max),
                colorTempPhysicalMaxMireds: kelvinToMireds(min),
                colorTemperatureMireds: kelvinToMireds(currentTemperature),
                coupleColorTempToLevelMinMireds: kelvinToMireds(max),
            },
        });

        await initializeMaintenanceStateHandlers(this.#matterEndpoint, this.#ioBrokerDevice);
        await this.initializeElectricityStateHandlers(this.#matterEndpoint, this.#ioBrokerDevice);
    }
}
