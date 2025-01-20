import ChannelDetector from '@iobroker/type-detector';
import { LevelControl, OnOff } from '@matter/main/clusters';
import type { Endpoint, PairedNode } from '@project-chip/matter.js/device';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import { Dimmer } from '../../lib/devices/Dimmer';
import type { DetectedDevice, DeviceOptions } from '../../lib/devices/GenericDevice';
import { GenericElectricityDataDeviceToIoBroker } from './GenericElectricityDataDeviceToIoBroker';

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
        this.enableDeviceTypeStateForAttribute(PropertyType.TransitionTime);

        this.enableDeviceTypeStateForAttribute(PropertyType.Power, {
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
        this.enableDeviceTypeStateForAttribute(PropertyType.PowerActual, {
            endpointId: this.appEndpoint.getNumber(),
            clusterId: OnOff.Cluster.id,
            attributeName: 'onOff',
        });
        this.enableDeviceTypeStateForAttribute(PropertyType.Level, {
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
                const transitionTime = this.ioBrokerDevice.getTransitionTime() ?? null;
                await this.appEndpoint.getClusterClient(LevelControl.Complete)?.moveToLevel({
                    level,
                    transitionTime: transitionTime !== null ? Math.round(transitionTime / 100) : null,
                    optionsMask: {},
                    optionsOverride: {},
                });
            },
            convertValue: value => Math.round((value / 254) * 100),
        });
        this.enableDeviceTypeStateForAttribute(PropertyType.LevelActual, {
            endpointId: this.appEndpoint.getNumber(),
            clusterId: LevelControl.Cluster.id,
            attributeName: 'currentLevel',
            convertValue: value => Math.round((value / 254) * 100),
        });
        return super.enableDeviceTypeStates();
    }

    get ioBrokerDevice(): Dimmer {
        return this.#ioBrokerDevice;
    }
}
