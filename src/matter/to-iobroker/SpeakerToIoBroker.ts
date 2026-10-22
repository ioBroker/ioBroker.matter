import ChannelDetector from '@iobroker/type-detector';
import { LevelControl, OnOff } from '@matter/main/clusters';
import { LevelControlClient, OnOffClient } from '@matter/main/behaviors';
import type { Endpoint, ClientNode } from '@matter/main';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { DetectedDevice, DeviceOptions } from '../../lib/devices/GenericDevice';
import { GenericElectricityDataDeviceToIoBroker } from './GenericElectricityDataDeviceToIoBroker';
import { Volume } from '../../lib/devices/Volume';
import type { MatterAdapter } from '../../main';
import { LightingLevel } from '../ConversionUtils';

export class SpeakerToIoBroker extends GenericElectricityDataDeviceToIoBroker {
    readonly #ioBrokerDevice: Volume;
    #minLevel = 0;
    #maxLevel = LightingLevel.MAX;

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
        );

        this.#ioBrokerDevice = new Volume(
            { ...ChannelDetector.getPatterns().volume, isIoBrokerDevice: false } as DetectedDevice,
            adapter,
            this.enableDeviceTypeStates(),
        );
    }

    override async init(): Promise<void> {
        await super.init();

        const levelControl = this.appEndpoint.maybeStateOf(LevelControlClient);
        if (levelControl) {
            this.#minLevel = levelControl.minLevel ?? 0;
            this.#maxLevel = levelControl.maxLevel ?? LightingLevel.MAX;
        }
    }

    protected enableDeviceTypeStates(): DeviceOptions {
        this.enableDeviceTypeStateForAttribute(PropertyType.Mute, {
            endpointId: this.appEndpoint.number,
            clusterId: OnOff.id,
            attributeName: 'onOff',
            // Speaker device type: OnOff TRUE is the unmuted state
            changeHandler: async muted => {
                if (muted) {
                    await this.appEndpoint.commandsOf(OnOffClient)?.off();
                } else {
                    await this.appEndpoint.commandsOf(OnOffClient)?.on();
                }
            },
            convertValue: (onOff: boolean) => !onOff,
        });

        this.enableDeviceTypeStateForAttribute(PropertyType.Level, {
            endpointId: this.appEndpoint.number,
            clusterId: LevelControl.id,
            attributeName: 'currentLevel',
            changeHandler: async value => {
                // Speaker LevelControl has no Lighting feature, so level 0 is valid and fromPercent would floor it to 1
                let level = value === 0 ? 0 : LightingLevel.fromPercent(value);
                if (level < this.#minLevel) {
                    level = this.#minLevel;
                } else if (level > this.#maxLevel) {
                    level = this.#maxLevel;
                }
                await this.appEndpoint.commandsOf(LevelControlClient)?.moveToLevel({
                    level,
                    transitionTime: null,
                    optionsMask: { executeIfOff: true },
                    optionsOverride: { executeIfOff: true },
                });
            },
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

    get ioBrokerDevice(): Volume {
        return this.#ioBrokerDevice;
    }
}
