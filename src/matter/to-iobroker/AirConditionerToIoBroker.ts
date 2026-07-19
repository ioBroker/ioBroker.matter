import ChannelDetector from '@iobroker/type-detector';
import {
    FanControl as MatterFanControl,
    OnOff as MatterOnOff,
    RelativeHumidityMeasurement,
    TemperatureMeasurement,
    Thermostat as MatterThermostat,
} from '@matter/main/clusters';
import { FanControlClient, OnOffClient, ThermostatClient } from '@matter/main/behaviors';
import type { Endpoint } from '@matter/main';
import type { PairedNode } from '@project-chip/matter.js/device';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { DetectedDevice, DeviceOptions } from '../../lib/devices/GenericDevice';
import {
    AirCondition,
    AirConditionerMode,
    AirConditionerModeNumbers,
    AirConditionerSpeed,
    AirConditionerSpeedNumbers,
    AirConditionerSwing,
    AirConditionerSwingNumbers,
} from '../../lib/devices/AirCondition';
import { GenericElectricityDataDeviceToIoBroker } from './GenericElectricityDataDeviceToIoBroker';
import type { MatterAdapter } from '../../main';
import { MatterConverters } from '../ConversionUtils';

export class AirConditionerToIoBroker extends GenericElectricityDataDeviceToIoBroker {
    readonly #ioBrokerDevice: AirCondition;

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
        );

        this.#ioBrokerDevice = new AirCondition(
            { ...ChannelDetector.getPatterns().airCondition, isIoBrokerDevice: false } as DetectedDevice,
            adapter,
            this.enableDeviceTypeStates(),
        );
    }

    async #handleUpdatedMatterSetpoint(forMode: AirConditionerMode, value: number): Promise<void> {
        const currentMode = this.#ioBrokerDevice.getMode();
        if (
            currentMode === AirConditionerMode.Auto ||
            (currentMode === AirConditionerMode.Heat && forMode === AirConditionerMode.Heat) ||
            (currentMode === AirConditionerMode.Cool && forMode === AirConditionerMode.Cool)
        ) {
            await this.#ioBrokerDevice.updateLevel(MatterConverters.fromMatterHundredths(value));
        }
    }

    #matterFanModeToSpeed(value: MatterFanControl.FanMode): AirConditionerSpeed | undefined {
        switch (value) {
            case MatterFanControl.FanMode.Auto:
            case MatterFanControl.FanMode.Smart:
                return AirConditionerSpeed.Auto;
            case MatterFanControl.FanMode.Low:
                return AirConditionerSpeed.Low;
            case MatterFanControl.FanMode.Medium:
                return AirConditionerSpeed.Medium;
            case MatterFanControl.FanMode.High:
            case MatterFanControl.FanMode.On:
                return AirConditionerSpeed.High;
            case MatterFanControl.FanMode.Off:
                return undefined;
        }
    }

    #speedToMatterFanMode(value: AirConditionerSpeed): MatterFanControl.FanMode | undefined {
        switch (value) {
            case AirConditionerSpeed.Auto:
                return MatterFanControl.FanMode.Auto;
            case AirConditionerSpeed.Low:
            case AirConditionerSpeed.Quiet:
                return MatterFanControl.FanMode.Low;
            case AirConditionerSpeed.Medium:
                return MatterFanControl.FanMode.Medium;
            case AirConditionerSpeed.High:
            case AirConditionerSpeed.Turbo:
                return MatterFanControl.FanMode.High;
        }
    }

    protected enableDeviceTypeStates(): DeviceOptions {
        this.enableDeviceTypeStateForAttribute(PropertyType.Temperature, {
            endpointId: this.appEndpoint.number,
            clusterId: MatterThermostat.id,
            attributeName: 'localTemperature',
            convertValue: value => MatterConverters.fromMatterHundredths(value),
        });
        // Fall back to a dedicated TemperatureMeasurement cluster when the Thermostat does not expose localTemperature
        this.enableDeviceTypeStateForAttribute(PropertyType.Temperature, {
            endpointId: this.appEndpoint.number,
            clusterId: TemperatureMeasurement.id,
            attributeName: 'measuredValue',
            convertValue: value => MatterConverters.fromMatterHundredths(value),
        });

        this.enableDeviceTypeStateForAttribute(PropertyType.Level, {
            changeHandler: async value => {
                const mode = this.#ioBrokerDevice.getMode();
                if (mode === AirConditionerMode.Heat || mode === AirConditionerMode.Auto) {
                    await this.appEndpoint.setStateOf(ThermostatClient, {
                        occupiedHeatingSetpoint: MatterConverters.toMatterHundredthsRounded(value),
                    });
                }
                if (mode === AirConditionerMode.Cool || mode === AirConditionerMode.Auto) {
                    await this.appEndpoint.setStateOf(ThermostatClient, {
                        occupiedCoolingSetpoint: MatterConverters.toMatterHundredthsRounded(value),
                    });
                }
            },
        });

        let modes: { [key: number]: AirConditionerMode } | undefined = undefined;
        const features = this.appEndpoint.behaviors.typeFor(ThermostatClient)?.features;
        if (features !== undefined) {
            modes = {};
            // OFF is always available on the Matter Thermostat cluster
            modes[AirConditionerModeNumbers.OFF] = AirConditionerMode.Off;
            if (features.heating) {
                modes[AirConditionerModeNumbers.HEAT] = AirConditionerMode.Heat;
            }
            if (features.cooling) {
                modes[AirConditionerModeNumbers.COOL] = AirConditionerMode.Cool;
            }
            if (features.autoMode) {
                modes[AirConditionerModeNumbers.AUTO] = AirConditionerMode.Auto;
            }
        }

        this.enableDeviceTypeStateForAttribute(PropertyType.Mode, {
            endpointId: this.appEndpoint.number,
            clusterId: MatterThermostat.id,
            attributeName: 'systemMode',
            modes,
            convertValue: async (value: MatterThermostat.SystemMode) => {
                let ioMode: AirConditionerMode | undefined = undefined;
                switch (value) {
                    case MatterThermostat.SystemMode.Off:
                        if (this.#ioBrokerDevice.hasPower() && this.#ioBrokerDevice.getPower()) {
                            await this.#ioBrokerDevice.updatePower(false);
                        }
                        return AirConditionerMode.Off;
                    case MatterThermostat.SystemMode.Auto:
                        ioMode = AirConditionerMode.Auto;
                        break;
                    case MatterThermostat.SystemMode.Cool:
                    case MatterThermostat.SystemMode.Precooling:
                        ioMode = AirConditionerMode.Cool;
                        break;
                    case MatterThermostat.SystemMode.Heat:
                    case MatterThermostat.SystemMode.EmergencyHeat:
                        ioMode = AirConditionerMode.Heat;
                        break;
                    case MatterThermostat.SystemMode.FanOnly:
                        ioMode = AirConditionerMode.FanOnly;
                        break;
                    case MatterThermostat.SystemMode.Dry:
                        ioMode = AirConditionerMode.Dry;
                        break;
                }
                if (ioMode === undefined) {
                    return;
                }
                if (this.#ioBrokerDevice.hasPower() && !this.#ioBrokerDevice.getPower()) {
                    await this.#ioBrokerDevice.updatePower(true);
                }
                if (ioMode === AirConditionerMode.Heat) {
                    const heatSetpoint = this.appEndpoint.maybeStateOf(ThermostatClient)?.occupiedHeatingSetpoint;
                    if (heatSetpoint !== undefined && heatSetpoint !== null) {
                        await this.#ioBrokerDevice.updateLevel(MatterConverters.fromMatterHundredths(heatSetpoint));
                    }
                } else if (ioMode === AirConditionerMode.Cool) {
                    const coolSetpoint = this.appEndpoint.maybeStateOf(ThermostatClient)?.occupiedCoolingSetpoint;
                    if (coolSetpoint !== undefined && coolSetpoint !== null) {
                        await this.#ioBrokerDevice.updateLevel(MatterConverters.fromMatterHundredths(coolSetpoint));
                    }
                }
                return ioMode;
            },
            changeHandler: async value => {
                let mode: MatterThermostat.SystemMode | undefined = undefined;
                switch (value) {
                    case AirConditionerMode.Off:
                        mode = MatterThermostat.SystemMode.Off;
                        break;
                    case AirConditionerMode.Auto:
                        mode = MatterThermostat.SystemMode.Auto;
                        break;
                    case AirConditionerMode.Cool:
                        mode = MatterThermostat.SystemMode.Cool;
                        break;
                    case AirConditionerMode.Heat:
                        mode = MatterThermostat.SystemMode.Heat;
                        break;
                    case AirConditionerMode.FanOnly:
                        mode = MatterThermostat.SystemMode.FanOnly;
                        break;
                    case AirConditionerMode.Dry:
                        mode = MatterThermostat.SystemMode.Dry;
                        break;
                    case AirConditionerMode.Eco:
                        mode = MatterThermostat.SystemMode.Auto;
                        this.#ioBrokerDevice.adapter.log.info(
                            `${this.baseId}: Matter has no Eco mode, controlling as Auto`,
                        );
                        break;
                }
                if (mode === undefined) {
                    this.#ioBrokerDevice.adapter.log.warn(`Unsupported air conditioner mode: ${value}`);
                    return;
                }
                await this.appEndpoint.setStateOf(ThermostatClient, { systemMode: mode });
            },
        });
        this.registerStateChangeHandlerForAttribute({
            endpointId: this.appEndpoint.number,
            clusterId: MatterThermostat.id,
            attributeName: 'occupiedHeatingSetpoint',
            matterValueChanged: (value: number) => this.#handleUpdatedMatterSetpoint(AirConditionerMode.Heat, value),
        });
        this.registerStateChangeHandlerForAttribute({
            endpointId: this.appEndpoint.number,
            clusterId: MatterThermostat.id,
            attributeName: 'occupiedCoolingSetpoint',
            matterValueChanged: (value: number) => this.#handleUpdatedMatterSetpoint(AirConditionerMode.Cool, value),
        });

        this.enableDeviceTypeStateForAttribute(PropertyType.Power, {
            endpointId: this.appEndpoint.number,
            clusterId: MatterOnOff.id,
            attributeName: 'onOff',
            changeHandler: async value => {
                if (value) {
                    await this.appEndpoint.commandsOf(OnOffClient)?.on();
                } else {
                    await this.appEndpoint.commandsOf(OnOffClient)?.off();
                }
            },
        });

        this.enableDeviceTypeStateForAttribute(PropertyType.Humidity, {
            endpointId: this.appEndpoint.number,
            clusterId: RelativeHumidityMeasurement.id,
            attributeName: 'measuredValue',
            convertValue: value => (value === null ? null : parseFloat((value / 100).toFixed(2))),
        });

        this.enableDeviceTypeStateForAttribute(PropertyType.Speed, {
            endpointId: this.appEndpoint.number,
            clusterId: MatterFanControl.id,
            attributeName: 'fanMode',
            modes: {
                [AirConditionerSpeedNumbers.AUTO]: AirConditionerSpeed.Auto,
                [AirConditionerSpeedNumbers.LOW]: AirConditionerSpeed.Low,
                [AirConditionerSpeedNumbers.MEDIUM]: AirConditionerSpeed.Medium,
                [AirConditionerSpeedNumbers.HIGH]: AirConditionerSpeed.High,
            },
            convertValue: (value: MatterFanControl.FanMode) => this.#matterFanModeToSpeed(value),
            changeHandler: async value => {
                const fanMode = this.#speedToMatterFanMode(value);
                if (fanMode === undefined) {
                    return;
                }
                await this.appEndpoint.setStateOf(FanControlClient, { fanMode });
            },
        });

        this.enableDeviceTypeStateForAttribute(PropertyType.Swing, {
            endpointId: this.appEndpoint.number,
            clusterId: MatterFanControl.id,
            attributeName: 'rockSetting',
            modes: {
                [AirConditionerSwingNumbers.HORIZONTAL]: AirConditionerSwing.Horizontal,
                [AirConditionerSwingNumbers.VERTICAL]: AirConditionerSwing.Vertical,
                [AirConditionerSwingNumbers.STATIONARY]: AirConditionerSwing.Stationary,
            },
            convertValue: (value: MatterFanControl.Rock) => {
                if (value?.rockLeftRight) {
                    return AirConditionerSwing.Horizontal;
                }
                if (value?.rockUpDown || value?.rockRound) {
                    return AirConditionerSwing.Vertical;
                }
                return AirConditionerSwing.Stationary;
            },
            changeHandler: async value => {
                const rockSetting = {
                    rockLeftRight: value === AirConditionerSwing.Horizontal,
                    rockUpDown: value === AirConditionerSwing.Vertical,
                    rockRound: false,
                };
                await this.appEndpoint.setStateOf(FanControlClient, { rockSetting });
            },
        });

        return super.enableDeviceTypeStates();
    }

    override async init(): Promise<void> {
        await super.init(true);

        const thermostat = this.appEndpoint.maybeStateOf(ThermostatClient);
        const features = this.appEndpoint.behaviors.typeFor(ThermostatClient)?.features;
        if (thermostat !== undefined) {
            let min: number | undefined = undefined;
            let max: number | undefined = undefined;
            if (features?.heating) {
                if (thermostat.absMinHeatSetpointLimit !== undefined && thermostat.absMinHeatSetpointLimit !== null) {
                    min = thermostat.absMinHeatSetpointLimit;
                }
                if (thermostat.absMaxHeatSetpointLimit !== undefined && thermostat.absMaxHeatSetpointLimit !== null) {
                    max = thermostat.absMaxHeatSetpointLimit;
                }
            }
            if (features?.cooling) {
                if (thermostat.absMinCoolSetpointLimit !== undefined && thermostat.absMinCoolSetpointLimit !== null) {
                    min =
                        min === undefined
                            ? thermostat.absMinCoolSetpointLimit
                            : Math.min(min, thermostat.absMinCoolSetpointLimit);
                }
                if (thermostat.absMaxCoolSetpointLimit !== undefined && thermostat.absMaxCoolSetpointLimit !== null) {
                    max =
                        max === undefined
                            ? thermostat.absMaxCoolSetpointLimit
                            : Math.max(max, thermostat.absMaxCoolSetpointLimit);
                }
            }
            await this.#ioBrokerDevice.updateSetpointMinMax(
                min !== undefined ? MatterConverters.fromMatterHundredths(min) : undefined,
                max !== undefined ? MatterConverters.fromMatterHundredths(max) : undefined,
            );
        }

        await this.initializeStates();
    }

    get ioBrokerDevice(): AirCondition {
        return this.#ioBrokerDevice;
    }
}
