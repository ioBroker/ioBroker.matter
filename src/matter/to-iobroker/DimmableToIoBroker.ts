import ChannelDetector from '@iobroker/type-detector';
import { LevelControl, OnOff } from '@matter/main/clusters';
import { LevelControlClient, OnOffClient } from '@matter/main/behaviors';
import type { Endpoint } from '@matter/main';
import type { PairedNode } from '@project-chip/matter.js/device';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import { Dimmer } from '../../lib/devices/Dimmer';
import type { DetectedDevice, DeviceOptions } from '../../lib/devices/GenericDevice';
import { GenericElectricityDataDeviceToIoBroker } from './GenericElectricityDataDeviceToIoBroker';
import type { MatterAdapter } from '../../main';
import { DimmableCustomStates, type DimmableCustomStatesType } from './custom-states';

export class DimmableToIoBroker extends GenericElectricityDataDeviceToIoBroker<DimmableCustomStatesType> {
    readonly #ioBrokerDevice: Dimmer;
    #isLighting = false;
    #minLevel = 0;
    #maxLevel = 254;

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
            DimmableCustomStates,
        );

        this.#ioBrokerDevice = new Dimmer(
            { ...ChannelDetector.getPatterns().dimmer, isIoBrokerDevice: false } as DetectedDevice,
            adapter,
            this.enableDeviceTypeStates(),
            DimmableCustomStates,
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
                    await this.appEndpoint.commandsOf(OnOffClient)?.on();
                } else {
                    await this.appEndpoint.commandsOf(OnOffClient)?.off();
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
        this.enableDeviceTypeStateForAttribute(PropertyType.Level, {
            endpointId: this.appEndpoint.number,
            clusterId: LevelControl.id,
            attributeName: 'currentLevel',
            changeHandler: async value => {
                if (value === 0) {
                    // ioBroker users expect that it turns off when level is set to 0
                    await this.#ioBrokerDevice.updateDimmer(0);
                    await this.appEndpoint.commandsOf(OnOffClient)?.off();
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
                    await this.appEndpoint.commandsOf(OnOffClient)?.on();
                }
            },
            convertValue: value => Math.round((value / 254) * 100),
        });
        this.enableDeviceTypeStateForAttribute(PropertyType.LevelActual, {
            endpointId: this.appEndpoint.number,
            clusterId: LevelControl.id,
            attributeName: 'currentLevel',
            convertValue: value => Math.round((value / 254) * 100),
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
    }

    get ioBrokerDevice(): Dimmer {
        return this.#ioBrokerDevice;
    }
}
