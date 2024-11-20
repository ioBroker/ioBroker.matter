import ChannelDetector from '@iobroker/type-detector';
import { LevelControl, OnOff, ColorControl } from '@matter/main/clusters';
import type { Endpoint, PairedNode } from '@project-chip/matter.js/device';
import type { GenericDevice } from '../../lib';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import Ct from '../../lib/devices/Ct';
import type { DetectedDevice, DeviceOptions } from '../../lib/devices/GenericDevice';
import { GenericElectricityDataDeviceToIoBroker } from './GenericElectricityDataDeviceToIoBroker';
import { kelvinToMireds, miredsToKelvin } from '@matter/main/behaviors';

/** Mapping Logic to map a ioBroker Light device to a Matter OnOffLightDevice. */
export class ColorTemperatureLightToIoBroker extends GenericElectricityDataDeviceToIoBroker {
    readonly #ioBrokerDevice: Ct;
    #isLighting = false;
    #minLevel = 1;
    #maxLevel = 254;

    constructor(
        node: PairedNode,
        endpoint: Endpoint,
        rootEndpoint: Endpoint,
        adapter: ioBroker.Adapter,
        endpointDeviceBaseId: string,
        deviceTypeName: string,
        defaultConnectionStateId: string,
    ) {
        super(adapter, node, endpoint, rootEndpoint, endpointDeviceBaseId, deviceTypeName, defaultConnectionStateId);

        this.#ioBrokerDevice = new Ct(
            { ...ChannelDetector.getPatterns().ct, isIoBrokerDevice: false } as DetectedDevice,
            adapter,
            this.enableDeviceTypeStates(),
        );
    }

    override async init(): Promise<void> {
        await super.init();

        const levelControl = this.appEndpoint.getClusterClient(LevelControl.Complete);
        if (levelControl) {
            this.#isLighting = !!levelControl.supportedFeatures.lighting; // Should always be the case
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

        this.enableDeviceTypeState(PropertyType.Dimmer, {
            endpointId: this.appEndpoint.getNumber(),
            clusterId: LevelControl.Cluster.id,
            attributeName: 'currentLevel',
            changeHandler: async value => {
                let level = Math.round((value / 100) * 254);
                if (level < this.#minLevel) {
                    level = this.#minLevel;
                }
                if (level > this.#maxLevel) {
                    level = this.#maxLevel;
                }
                await this.appEndpoint
                    .getClusterClient(LevelControl.Complete)
                    ?.moveToLevel({ level, transitionTime: null, optionsMask: {}, optionsOverride: {} });
            },
            convertValue: value => Math.round((value / 254) * 100),
        });

        this.enableDeviceTypeState(PropertyType.Temperature, {
            endpointId: this.appEndpoint.getNumber(),
            clusterId: ColorControl.Cluster.id,
            attributeName: 'colorTemperatureMireds',
            changeHandler: async value => {
                const colorTemperatureMireds = kelvinToMireds(value);
                await this.appEndpoint.getClusterClient(ColorControl.Complete)?.moveToColorTemperature({
                    colorTemperatureMireds,
                    transitionTime: 0,
                    optionsMask: {},
                    optionsOverride: {},
                });
            },
            convertValue: value => Math.round(miredsToKelvin(value)),
        });
        return super.enableDeviceTypeStates();
    }

    get ioBrokerDevice(): GenericDevice {
        return this.#ioBrokerDevice;
    }
}
