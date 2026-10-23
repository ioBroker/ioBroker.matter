import ChannelDetector from '@iobroker/type-detector';
import { LevelControl, OnOff } from '@matter/main/clusters';
import { LevelControlClient } from '@matter/main/behaviors';
import type { Endpoint, ClientNode } from '@matter/main';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { DetectedDevice, DeviceOptions } from '../../lib/devices/GenericDevice';
import { GenericElectricityDataDeviceToIoBroker } from './GenericElectricityDataDeviceToIoBroker';
import { Volume } from '../../lib/devices/Volume';
import type { MatterAdapter } from '../../main';
import { LightingLevel } from '../ConversionUtils';
import { OnOffLevelCommands } from './OnOffLevelCommands';

export class SpeakerToIoBroker extends GenericElectricityDataDeviceToIoBroker {
    readonly #ioBrokerDevice: Volume;
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
            this.#onOffLevel.levelRange = {
                min: levelControl.minLevel ?? 0,
                max: levelControl.maxLevel ?? LightingLevel.MAX,
            };
        }
    }

    protected enableDeviceTypeStates(): DeviceOptions {
        this.enableDeviceTypeStateForAttribute(PropertyType.Mute, {
            endpointId: this.appEndpoint.number,
            clusterId: OnOff.id,
            attributeName: 'onOff',
            // Speaker device type: OnOff TRUE is the unmuted state
            changeHandler: (muted: boolean) => this.#onOffLevel.setPower(!muted),
            convertValue: (onOff: boolean) => !onOff,
        });

        this.enableDeviceTypeStateForAttribute(PropertyType.Level, {
            endpointId: this.appEndpoint.number,
            clusterId: LevelControl.id,
            attributeName: 'currentLevel',
            changeHandler: value => this.#onOffLevel.setLevel(value),
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
