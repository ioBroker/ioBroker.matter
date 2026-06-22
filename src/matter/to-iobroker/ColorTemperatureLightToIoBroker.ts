import ChannelDetector from '@iobroker/type-detector';
import { LevelControl, OnOff, ColorControl } from '@matter/main/clusters';
import type { Endpoint } from '@matter/main';
import type { PairedNode } from '@project-chip/matter.js/device';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import { Ct } from '../../lib/devices/Ct';
import type { DetectedDevice, DeviceOptions } from '../../lib/devices/GenericDevice';
import { GenericElectricityDataDeviceToIoBroker } from './GenericElectricityDataDeviceToIoBroker';
import {
    kelvinToMireds,
    miredsToKelvin,
    LevelControlClient,
    OnOffClient,
    ColorControlClient,
} from '@matter/main/behaviors';
import type { MatterAdapter } from '../../main';
import { ColorLightCustomStates, type ColorLightCustomStatesType } from './custom-states';

/**
 * This lass is currently unused and can be removed if the remapping of CT to Extended Color Light works as expected
 * after 0.4.12
 */

export class ColorTemperatureLightToIoBroker extends GenericElectricityDataDeviceToIoBroker<ColorLightCustomStatesType> {
    readonly #ioBrokerDevice: Ct;
    #isLighting = false;
    #minLevel = 1;
    #maxLevel = 254;
    #colorTemperatureMinMireds = kelvinToMireds(20_000);
    #colorTemperatureMaxMireds = kelvinToMireds(1_000);

    constructor(
        node: PairedNode,
        endpoint: Endpoint,
        rootEndpoint: Endpoint,
        adapter: MatterAdapter,
        endpointDeviceBaseId: string,
        deviceTypeName: string,
        defaultConnectionStateId: string,
        defaultName: string,
    ) {
        super(
            adapter,
            node,
            endpoint,
            rootEndpoint,
            endpointDeviceBaseId,
            deviceTypeName,
            defaultConnectionStateId,
            defaultName,
            ColorLightCustomStates,
        );

        this.#ioBrokerDevice = new Ct(
            { ...ChannelDetector.getPatterns().ct, isIoBrokerDevice: false } as DetectedDevice,
            adapter,
            this.enableDeviceTypeStates(),
            ColorLightCustomStates,
        );
    }

    override async init(): Promise<void> {
        await super.init();

        const lc = this.appEndpoint.behaviors.typeFor(LevelControlClient);
        const levelControl = this.appEndpoint.stateOf(LevelControlClient);
        if (levelControl && lc) {
            this.#isLighting = lc.features.lighting; // Should always be the case
            this.#minLevel = levelControl.minLevel ?? (this.#isLighting ? 1 : 0);
            this.#maxLevel = levelControl.maxLevel ?? 254;
        }

        const colorControl = this.appEndpoint.stateOf(ColorControlClient);
        if (colorControl) {
            this.#colorTemperatureMinMireds = colorControl.colorTempPhysicalMinMireds ?? kelvinToMireds(20_000);
            this.#colorTemperatureMaxMireds = colorControl.colorTempPhysicalMaxMireds ?? kelvinToMireds(1_000);
        }
    }

    protected enableDeviceTypeStates(): DeviceOptions {
        this.#enableCustomStates();

        this.enableDeviceTypeStateForAttribute(PropertyType.TransitionTime);

        this.enableDeviceTypeStateForAttribute(PropertyType.Power, {
            endpointId: this.appEndpoint.number,
            clusterId: OnOff.id,
            attributeName: 'onOff',
            changeHandler: async value => {
                if (value) {
                    if (this.#ioBrokerDevice.hasDimmer()) {
                        // Check if the Dimmer in ioBroker still matches the Device Dimmer and correct if needed
                        const currentLevel = this.appEndpoint.maybeStateOf(LevelControlClient)?.currentLevel;
                        if (typeof currentLevel === 'number' && currentLevel <= 1) {
                            const ioLevel = Math.round((currentLevel / 100) * 254);
                            if (ioLevel !== this.#ioBrokerDevice.getDimmer()) {
                                await this.#ioBrokerDevice.updateDimmer(ioLevel);
                            }
                        }
                    }
                    await this.appEndpoint.commandsOf(OnOffClient).on();
                } else {
                    await this.appEndpoint.commandsOf(OnOffClient).off();
                }
            },
        });
        this.enableDeviceTypeStateForAttribute(PropertyType.PowerActual, {
            endpointId: this.appEndpoint.number,
            clusterId: OnOff.id,
            attributeName: 'onOff',
            convertValue: async value => {
                await this.#ioBrokerDevice.updatePower(value); // Also Ack Power Set State
                return value;
            },
        });

        this.enableDeviceTypeStateForAttribute(PropertyType.Dimmer, {
            endpointId: this.appEndpoint.number,
            clusterId: LevelControl.id,
            attributeName: 'currentLevel',
            changeHandler: async value => {
                if (value === 0) {
                    // ioBroker users expect that it turns off when level is set to 0
                    await this.#ioBrokerDevice.updateDimmer(0);
                    await this.appEndpoint.commandsOf(OnOffClient).off();
                    return;
                }
                let level = Math.round((value / 100) * 254);
                if (level < this.#minLevel) {
                    level = this.#minLevel;
                } else if (level > this.#maxLevel) {
                    level = this.#maxLevel;
                }
                const isOn = this.#ioBrokerDevice.getPower() ?? false;
                const transitionTime = isOn ? (this.ioBrokerDevice.getTransitionTime() ?? null) : null;

                await this.appEndpoint.commandsOf(LevelControlClient).moveToLevel({
                    level,
                    transitionTime: transitionTime !== null ? Math.round(transitionTime / 100) : null,
                    optionsMask: { executeIfOff: true },
                    optionsOverride: { executeIfOff: true },
                });

                if (!isOn) {
                    await this.appEndpoint.commandsOf(OnOffClient).on();
                }
            },
            convertValue: value => Math.round((value / 254) * 100),
        });

        this.enableDeviceTypeStateForAttribute(PropertyType.Temperature, {
            endpointId: this.appEndpoint.number,
            clusterId: ColorControl.id,
            attributeName: 'colorTemperatureMireds',
            changeHandler: async value => {
                let colorTemperatureMireds = kelvinToMireds(value);
                if (colorTemperatureMireds < this.#colorTemperatureMinMireds) {
                    colorTemperatureMireds = this.#colorTemperatureMinMireds;
                } else if (colorTemperatureMireds > this.#colorTemperatureMaxMireds) {
                    colorTemperatureMireds = this.#colorTemperatureMaxMireds;
                }

                const isOn = this.#ioBrokerDevice.getPower() ?? false;
                const transitionTime = isOn ? Math.round((this.ioBrokerDevice.getTransitionTime() ?? 0) / 100) : 0;

                await this.appEndpoint.commandsOf(ColorControlClient).moveToColorTemperature({
                    colorTemperatureMireds,
                    transitionTime,
                    optionsMask: { executeIfOff: true },
                    optionsOverride: { executeIfOff: true },
                });
            },
            convertValue: value => Math.round(miredsToKelvin(value)),
        });
        return super.enableDeviceTypeStates();
    }

    #enableCustomStates(): void {
        const endpointId = this.appEndpoint.number;

        // StartUp On/Off - defines device behavior on power-up
        this.enableCustomStateForAttribute('startUpOnOff', {
            endpointId,
            clusterId: OnOff.id,
            attributeName: 'startUpOnOff',
            changeHandler: async (startUpOnOff: number | null) => {
                await this.appEndpoint.setStateOf(OnOffClient, {
                    startUpOnOff,
                });
            },
        });

        // StartUp Current Level - defines the brightness level on power-up (0-100% in ioBroker, 0-254 in Matter)
        this.enableCustomStateForAttribute('startUpCurrentLevel', {
            endpointId,
            clusterId: LevelControl.id,
            attributeName: 'startUpCurrentLevel',
            changeHandler: async (value: number | null) => {
                const startUpCurrentLevel = value !== null ? Math.round((value / 100) * 254) : null;
                await this.appEndpoint.setStateOf(LevelControlClient, {
                    startUpCurrentLevel,
                });
            },
            convertValue: value => (value !== null ? Math.round((value / 254) * 100) : null),
        });

        // StartUp Color Temperature - defines the color temperature on power-up (Kelvin in ioBroker, Mireds in Matter)
        this.enableCustomStateForAttribute('startUpColorTemperatureMireds', {
            endpointId,
            clusterId: ColorControl.id,
            attributeName: 'startUpColorTemperatureMireds',
            changeHandler: async (value: number | null) => {
                const startUpColorTemperatureMireds = value !== null ? kelvinToMireds(value) : null;
                await this.appEndpoint.setStateOf(ColorControlClient, {
                    startUpColorTemperatureMireds,
                });
            },
            convertValue: value => (value !== null ? Math.round(miredsToKelvin(value)) : null),
        });
    }

    get ioBrokerDevice(): Ct {
        return this.#ioBrokerDevice;
    }
}
