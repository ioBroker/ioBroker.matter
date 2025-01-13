import ChannelDetector from '@iobroker/type-detector';
import { LevelControl, OnOff, ColorControl } from '@matter/main/clusters';
import type { Endpoint, PairedNode } from '@project-chip/matter.js/device';
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
    #colorTemperatureMinMireds = kelvinToMireds(6_500);
    #colorTemperatureMaxMireds = kelvinToMireds(2_000);

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

        const colorControl = this.appEndpoint.getClusterClient(ColorControl.Complete);
        if (colorControl) {
            this.#colorTemperatureMinMireds =
                (await colorControl.getColorTempPhysicalMinMiredsAttribute()) ?? kelvinToMireds(6_500);
            this.#colorTemperatureMaxMireds =
                (await colorControl.getColorTempPhysicalMaxMiredsAttribute()) ?? kelvinToMireds(2_000);
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

        this.enableDeviceTypeStateForAttribute(PropertyType.Dimmer, {
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

        this.enableDeviceTypeStateForAttribute(PropertyType.Temperature, {
            endpointId: this.appEndpoint.getNumber(),
            clusterId: ColorControl.Cluster.id,
            attributeName: 'colorTemperatureMireds',
            changeHandler: async value => {
                let colorTemperatureMireds = kelvinToMireds(value);
                if (colorTemperatureMireds < this.#colorTemperatureMinMireds) {
                    colorTemperatureMireds = this.#colorTemperatureMinMireds;
                } else if (colorTemperatureMireds > this.#colorTemperatureMaxMireds) {
                    colorTemperatureMireds = this.#colorTemperatureMaxMireds;
                }
                const transitionTime = Math.round((this.ioBrokerDevice.getTransitionTime() ?? 0) / 100);
                await this.appEndpoint.getClusterClient(ColorControl.Complete)?.moveToColorTemperature({
                    colorTemperatureMireds,
                    transitionTime,
                    optionsMask: {},
                    optionsOverride: {},
                });
            },
            convertValue: value => Math.round(miredsToKelvin(value)),
        });
        return super.enableDeviceTypeStates();
    }

    get ioBrokerDevice(): Ct {
        return this.#ioBrokerDevice;
    }
}
