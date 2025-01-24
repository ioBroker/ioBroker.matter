import ChannelDetector from '@iobroker/type-detector';
import { LevelControl, OnOff, ColorControl } from '@matter/main/clusters';
import type { Endpoint, PairedNode } from '@project-chip/matter.js/device';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import { Cie } from '../../lib/devices/Cie';
import { Hue } from '../../lib/devices/Hue';
import type { DetectedDevice, DeviceOptions } from '../../lib/devices/GenericDevice';
import { GenericElectricityDataDeviceToIoBroker } from './GenericElectricityDataDeviceToIoBroker';
import { kelvinToMireds, miredsToKelvin } from '@matter/main/behaviors';

export class ExtendedColorLightToIoBroker extends GenericElectricityDataDeviceToIoBroker {
    readonly #ioBrokerDevice: Hue | Cie;
    #hueSaturationTimeout?: ioBroker.Timeout;
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

        if (this.appEndpoint.getClusterClient(ColorControl.Complete)?.supportedFeatures.hueSaturation) {
            this.#ioBrokerDevice = new Hue(
                { ...ChannelDetector.getPatterns().hue, isIoBrokerDevice: false } as DetectedDevice,
                adapter,
                this.enableHueDeviceTypeStates(),
            );
        } else {
            this.#ioBrokerDevice = new Cie(
                { ...ChannelDetector.getPatterns().cie, isIoBrokerDevice: false } as DetectedDevice,
                adapter,
                this.enableCieDeviceTypeStates(),
            );
        }
    }

    override async init(): Promise<void> {
        await super.init();

        const levelControl = this.appEndpoint.getClusterClient(LevelControl.Complete);
        if (levelControl) {
            const minLevel = levelControl.isAttributeSupportedByName('minLevel')
                ? await levelControl.getMinLevelAttribute()
                : undefined;
            this.#minLevel = minLevel ?? 1;
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

            if (this.#ioBrokerDevice instanceof Cie) {
                const currentX = await colorControl.getCurrentXAttribute();
                const currentY = await colorControl.getCurrentYAttribute();
                if (currentX !== undefined && currentY !== undefined) {
                    await this.#ioBrokerDevice.updateXy(currentX / 65536, currentY / 65536);
                }
            }
        }
    }

    enableHueDeviceTypeStates(): DeviceOptions {
        this.enableDeviceTypeStateForAttribute(PropertyType.Hue, {
            endpointId: this.appEndpoint.getNumber(),
            clusterId: ColorControl.Cluster.id,
            attributeName: 'currentHue',
            changeHandler: () => this.handleHueAndSaturationTimeout(),
            convertValue: value => (value * 360) / 254,
        });
        this.enableDeviceTypeStateForAttribute(PropertyType.Saturation, {
            endpointId: this.appEndpoint.getNumber(),
            clusterId: ColorControl.Cluster.id,
            attributeName: 'currentSaturation',
            changeHandler: () => this.handleHueAndSaturationTimeout(),
            convertValue: value => Math.round((value / 254) * 100),
        });

        return this.enableDeviceTypeStates();
    }

    /** Waits 100ms if any other change comes in, at second value change it triggers the change. */
    async handleHueAndSaturationTimeout(): Promise<void> {
        if (this.#hueSaturationTimeout) {
            clearTimeout(this.#hueSaturationTimeout);
            this.#hueSaturationTimeout = undefined;
            await this.changeHueAndSaturation();
        } else {
            this.#hueSaturationTimeout = this.#ioBrokerDevice.adapter.setTimeout(() => {
                this.#hueSaturationTimeout = undefined;
                this.changeHueAndSaturation().catch(e =>
                    this.ioBrokerDevice.adapter.log.error(`Failed to set Hue and Saturation: ${e.message}`),
                );
            }, 100);
        }
    }

    async changeHueAndSaturation(): Promise<void> {
        if (!(this.#ioBrokerDevice instanceof Hue)) {
            return;
        }
        const isOn = this.#ioBrokerDevice.getPower() ?? false;
        const transitionTime = isOn ? Math.round((this.ioBrokerDevice.getTransitionTime() ?? 0) / 100) : 0;

        const ioHue = this.#ioBrokerDevice.getHue() ?? 0;
        const matterHue = this.ioBrokerDevice.cropValue(Math.round((ioHue / 360) * 254), 0, 254);

        const ioSaturation = this.#ioBrokerDevice.getSaturation() ?? 0;
        const matterSaturation = this.ioBrokerDevice.cropValue(
            ioSaturation > 0 && ioSaturation <= 1
                ? Math.round(ioSaturation * 254)
                : Math.round((ioSaturation / 100) * 254),
            0,
            254,
        );

        await this.appEndpoint.getClusterClient(ColorControl.Complete)?.moveToHueAndSaturation({
            hue: matterHue,
            saturation: matterSaturation,
            transitionTime,
            optionsMask: { executeIfOff: true },
            optionsOverride: { executeIfOff: true },
        });
    }

    enableCieDeviceTypeStates(): DeviceOptions {
        // Xy is splitted into two attributes onnMatter side but only one in ioBroker
        this.enableDeviceTypeStateForAttribute(PropertyType.Cie, {
            changeHandler: async () => {
                if (!(this.#ioBrokerDevice instanceof Cie)) {
                    return;
                }
                const isOn = this.#ioBrokerDevice.getPower() ?? false;
                const transitionTime = isOn ? Math.round((this.ioBrokerDevice.getTransitionTime() ?? 0) / 100) : 0;

                const ioXy = this.#ioBrokerDevice.getXy() ?? { x: 0, y: 0 };
                const matterX = this.ioBrokerDevice.cropValue(Math.round(ioXy.x * 65536), 0, 65279);
                const matterY = this.ioBrokerDevice.cropValue(Math.round(ioXy.y * 65536), 0, 65279);

                await this.appEndpoint.getClusterClient(ColorControl.Complete)?.moveToColor({
                    colorX: matterX,
                    colorY: matterY,
                    transitionTime,
                    optionsMask: { executeIfOff: true },
                    optionsOverride: { executeIfOff: true },
                });
            },
        });
        this.registerStateChangeHandlerForAttribute({
            endpointId: this.appEndpoint.getNumber(),
            clusterId: ColorControl.Cluster.id,
            attributeName: 'currentX',
            matterValueChanged: async value => {
                if (!(this.#ioBrokerDevice instanceof Cie)) {
                    return;
                }
                await this.#ioBrokerDevice.updateXy(value / 65536, this.#ioBrokerDevice.getXy()?.y ?? 0);
            },
        });
        this.registerStateChangeHandlerForAttribute({
            endpointId: this.appEndpoint.getNumber(),
            clusterId: ColorControl.Cluster.id,
            attributeName: 'currentY',
            matterValueChanged: async value => {
                if (!(this.#ioBrokerDevice instanceof Cie)) {
                    return;
                }
                await this.#ioBrokerDevice.updateXy(this.#ioBrokerDevice.getXy()?.x ?? 0, value / 65536);
            },
        });

        return this.enableDeviceTypeStates();
    }

    protected enableDeviceTypeStates(): DeviceOptions {
        this.enableDeviceTypeStateForAttribute(PropertyType.TransitionTime);

        this.enableDeviceTypeStateForAttribute(PropertyType.Power, {
            endpointId: this.appEndpoint.getNumber(),
            clusterId: OnOff.Cluster.id,
            attributeName: 'onOff',
            changeHandler: async value => {
                if (value) {
                    if (this.#ioBrokerDevice.hasDimmer()) {
                        // Check if the Dimmer in ioBroker still matches the Device Dimmer and correct if needed
                        const currentLevel = await this.appEndpoint
                            .getClusterClient(LevelControl.Cluster)
                            ?.getCurrentLevelAttribute();
                        if (typeof currentLevel === 'number' && currentLevel <= 1) {
                            const ioLevel = Math.round((currentLevel / 100) * 254);
                            if (ioLevel !== this.#ioBrokerDevice.getDimmer()) {
                                await this.#ioBrokerDevice.updateDimmer(ioLevel);
                            }
                        }
                    }
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
                if (value === 0) {
                    // ioBroker users expect that it turns off when level is set to 0
                    await this.#ioBrokerDevice.updateDimmer(0);
                    await this.appEndpoint.getClusterClient(OnOff.Complete)?.off();
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

                await this.appEndpoint.getClusterClient(LevelControl.Complete)?.moveToLevel({
                    level,
                    transitionTime: transitionTime !== null ? Math.round(transitionTime / 100) : null,
                    optionsMask: { executeIfOff: true },
                    optionsOverride: { executeIfOff: true },
                });

                if (!isOn) {
                    await this.appEndpoint.getClusterClient(OnOff.Complete)?.on();
                }
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

                const isOn = this.#ioBrokerDevice.getPower() ?? false;
                const transitionTime = isOn ? Math.round((this.ioBrokerDevice.getTransitionTime() ?? 0) / 100) : 0;

                await this.appEndpoint.getClusterClient(ColorControl.Complete)?.moveToColorTemperature({
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

    get ioBrokerDevice(): Hue | Cie {
        return this.#ioBrokerDevice;
    }
}
