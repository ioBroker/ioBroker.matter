import ChannelDetector from '@iobroker/type-detector';
import { LevelControl, OnOff } from '@matter/main/clusters';
import type { Endpoint, PairedNode } from '@project-chip/matter.js/device';
import type { GenericDevice } from '../../lib';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import Dimmer from '../../lib/devices/Dimmer';
import type { DetectedDevice, DeviceOptions } from '../../lib/devices/GenericDevice';
import { GenericElectricityDataDeviceToIoBroker } from './GenericElectricityDataDeviceToIoBroker';

/** Mapping Logic to map a ioBroker Light device to a Matter OnOffLightDevice. */
export class DimmableToIoBroker extends GenericElectricityDataDeviceToIoBroker {
    readonly #ioBrokerDevice: Dimmer;
    #isLighting = false;
    #minLevel = 0;
    #maxLevel = 254;

    constructor(
        node: PairedNode,
        endpoint: Endpoint,
        rootEndpoint: Endpoint,
        adapter: ioBroker.Adapter,
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

        this.#ioBrokerDevice = new Dimmer(
            { ...ChannelDetector.getPatterns().dimmer, isIoBrokerDevice: false } as DetectedDevice,
            adapter,
            this.enableDeviceTypeStates(),
        );
    }

    override async init(): Promise<void> {
        await super.init();

        const levelControl = this.appEndpoint.getClusterClient(LevelControl.Complete);
        if (levelControl) {
            this.#isLighting = !!levelControl.supportedFeatures.lighting;
            const minLevel = levelControl.isAttributeSupportedByName('minLevel')
                ? await levelControl.getMinLevelAttribute()
                : undefined;
            this.#minLevel = minLevel ?? (this.#isLighting ? 1 : 0);
            const maxLevel = levelControl.isAttributeSupportedByName('maxLevel')
                ? await levelControl.getMaxLevelAttribute()
                : undefined;
            this.#maxLevel = maxLevel ?? 254;
        }
    }

    protected enableDeviceTypeStates(): DeviceOptions {
        this.enableDeviceTypeState(PropertyType.Power, {
            endpointId: this.appEndpoint.getNumber(),
            clusterId: OnOff.Cluster.id,
            attributeName: 'onOff',
            changeHandler: async value => {
                if (value) {
                    await this.appEndpoint.getClusterClient(OnOff.Complete)?.on();
                } else {
                    await this.appEndpoint.getClusterClient(OnOff.Complete)?.off();
                }
            },
        });
        this.enableDeviceTypeState(PropertyType.PowerActual, {
            endpointId: this.appEndpoint.getNumber(),
            clusterId: OnOff.Cluster.id,
            attributeName: 'onOff',
        });
        this.enableDeviceTypeState(PropertyType.Level, {
            endpointId: this.appEndpoint.getNumber(),
            clusterId: LevelControl.Cluster.id,
            attributeName: 'currentLevel',
            changeHandler: async value => {
                let level = Math.round((value / 100) * 254);
                if (level < this.#minLevel) {
                    level = this.#minLevel;
                } else if (level > this.#maxLevel) {
                    level = this.#maxLevel;
                }
                await this.appEndpoint
                    .getClusterClient(LevelControl.Complete)
                    ?.moveToLevel({ level, transitionTime: null, optionsMask: {}, optionsOverride: {} });
            },
            convertValue: value => Math.round((value / 254) * 100),
        });
        this.enableDeviceTypeState(PropertyType.LevelActual, {
            endpointId: this.appEndpoint.getNumber(),
            clusterId: LevelControl.Cluster.id,
            attributeName: 'currentLevel',
            convertValue: value => Math.round((value / 254) * 100),
        });
        return super.enableDeviceTypeStates();
    }

    get ioBrokerDevice(): GenericDevice {
        return this.#ioBrokerDevice;
    }
}
