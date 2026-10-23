import ChannelDetector from '@iobroker/type-detector';
import { LevelControl, OnOff } from '@matter/main/clusters';
import { LevelControlClient, OnOffClient } from '@matter/main/behaviors';
import type { Endpoint, ClientNode } from '@matter/main';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import { Dimmer } from '../../lib/devices/Dimmer';
import type { DetectedDevice, DeviceOptions } from '../../lib/devices/GenericDevice';
import { GenericElectricityDataDeviceToIoBroker } from './GenericElectricityDataDeviceToIoBroker';
import type { MatterAdapter } from '../../main';
import { LightingLevel } from '../ConversionUtils';
import { DimmableCustomStates, type DimmableCustomStatesType } from './custom-states';
import { OnOffLevelCommands } from './OnOffLevelCommands';

export class DimmableToIoBroker extends GenericElectricityDataDeviceToIoBroker<DimmableCustomStatesType> {
    readonly #ioBrokerDevice: Dimmer;
    readonly #onOffLevel = new OnOffLevelCommands(
        this.onOffLevelTarget,
        LightingLevel,
        percent => this.#ioBrokerDevice.updateLevel(percent),
        { min: 0, max: LightingLevel.MAX },
    );

    constructor(
        node: ClientNode,
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
            this.#onOffLevel.levelRange = {
                min: levelControl.minLevel ?? (lc.features.lighting ? 1 : 0),
                max: levelControl.maxLevel ?? LightingLevel.MAX,
            };
        }
    }

    protected enableDeviceTypeStates(): DeviceOptions {
        this.#enableCustomStates();

        this.enableDeviceTypeStateForAttribute(PropertyType.TransitionTime);

        this.enableDeviceTypeStateForAttribute(PropertyType.Power, {
            endpointId: this.appEndpoint.number,
            clusterId: OnOff.id,
            attributeName: 'onOff',
            changeHandler: value => this.#onOffLevel.setPower(value),
        });
        this.enableDeviceTypeStateForAttribute(PropertyType.PowerActual, {
            endpointId: this.appEndpoint.number,
            clusterId: OnOff.id,
            attributeName: 'onOff',
        });
        this.enableDeviceTypeStateForAttribute(PropertyType.Level, {
            endpointId: this.appEndpoint.number,
            clusterId: LevelControl.id,
            attributeName: 'currentLevel',
            changeHandler: value => this.#onOffLevel.setLevel(value, this.#ioBrokerDevice.getTransitionTime()),
            convertValue: value => LightingLevel.toPercent(value),
        });
        this.enableDeviceTypeStateForAttribute(PropertyType.LevelActual, {
            endpointId: this.appEndpoint.number,
            clusterId: LevelControl.id,
            attributeName: 'currentLevel',
            convertValue: value => LightingLevel.toPercent(value),
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
                await this.appEndpoint.setStateOf(LevelControlClient, {
                    startUpCurrentLevel: LightingLevel.startUpFromPercent(value),
                });
            },
            convertValue: value => LightingLevel.startUpToPercent(value),
        });
    }

    get ioBrokerDevice(): Dimmer {
        return this.#ioBrokerDevice;
    }
}
