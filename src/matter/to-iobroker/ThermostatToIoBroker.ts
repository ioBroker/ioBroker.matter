import ChannelDetector from '@iobroker/type-detector';
import { Thermostat as MatterThermostat } from '@matter/main/clusters';
import { ThermostatClient } from '@matter/main/behaviors';
import type { Endpoint } from '@matter/main';
import type { PairedNode } from '@project-chip/matter.js/device';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { DetectedDevice, DeviceOptions } from '../../lib/devices/GenericDevice';
import { Thermostat, ThermostatMode, ThermostatModeNumbers } from '../../lib/devices/Thermostat';
import { GenericElectricityDataDeviceToIoBroker } from './GenericElectricityDataDeviceToIoBroker';
import type { MatterAdapter } from '../../main';

export class ThermostatToIoBroker extends GenericElectricityDataDeviceToIoBroker {
    readonly #ioBrokerDevice: Thermostat;
    #minHeatSetpointLimit: number | undefined = undefined;
    #maxHeatSetpointLimit: number | undefined = undefined;
    #minCoolSetpointLimit: number | undefined = undefined;
    #maxCoolSetpointLimit: number | undefined = undefined;

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

        this.#ioBrokerDevice = new Thermostat(
            { ...ChannelDetector.getPatterns().thermostat, isIoBrokerDevice: false } as DetectedDevice,
            adapter,
            this.enableDeviceTypeStates(),
        );
    }

    async #handleUpdatedMatterTemperature(forMode: ThermostatMode, value: number): Promise<void> {
        const currentMode = this.ioBrokerDevice.getMode();
        if (
            currentMode === ThermostatMode.Auto ||
            (currentMode === ThermostatMode.Heat && forMode === ThermostatMode.Heat) ||
            (currentMode === ThermostatMode.Cool && forMode === ThermostatMode.Cool)
        ) {
            await this.ioBrokerDevice.updateLevel(this.temperatureFromMatter(value));
        }
    }

    temperatureToMatter(value: number): number {
        return Math.round(value * 100);
    }

    temperatureFromMatter(value: number): number {
        return parseFloat((value / 100).toFixed(2));
    }

    protected enableDeviceTypeStates(): DeviceOptions {
        this.enableDeviceTypeStateForAttribute(PropertyType.Temperature, {
            endpointId: this.appEndpoint.number,
            clusterId: MatterThermostat.id,
            attributeName: 'localTemperature',
            convertValue: value => this.temperatureFromMatter(value),
        });
        this.enableDeviceTypeStateForAttribute(PropertyType.Level, {
            changeHandler: async value => {
                const mode = this.ioBrokerDevice.getMode();
                if (mode === ThermostatMode.Heat || mode === ThermostatMode.Auto) {
                    await this.appEndpoint.setStateOf(ThermostatClient, {
                        occupiedHeatingSetpoint: this.temperatureToMatter(value),
                    });
                }
                if (mode === ThermostatMode.Cool || mode === ThermostatMode.Auto) {
                    await this.appEndpoint.setStateOf(ThermostatClient, {
                        occupiedCoolingSetpoint: this.temperatureToMatter(value),
                    });
                }
            },
        });

        let modes: { [key: number]: ThermostatMode } | undefined = undefined;

        const features = this.appEndpoint.behaviors.typeFor(ThermostatClient)?.features;
        if (features !== undefined) {
            modes = {};
            // We assume OFF is always supported by Matter Thermostat cluster, no way to determine exactly
            modes[ThermostatModeNumbers[ThermostatMode.Off]] = ThermostatMode.Off;
            if (features.heating) {
                modes[ThermostatModeNumbers[ThermostatMode.Heat]] = ThermostatMode.Heat;
            }
            if (features.cooling) {
                modes[ThermostatModeNumbers[ThermostatMode.Cool]] = ThermostatMode.Cool;
            }
            if (features.autoMode) {
                modes[ThermostatModeNumbers[ThermostatMode.Auto]] = ThermostatMode.Auto;
            }
        }

        this.enableDeviceTypeStateForAttribute(PropertyType.Mode, {
            endpointId: this.appEndpoint.number,
            clusterId: MatterThermostat.id,
            attributeName: 'systemMode',
            modes,
            convertValue: async (value: MatterThermostat.SystemMode) => {
                let ioMode: ThermostatMode | undefined = undefined;
                switch (value) {
                    case MatterThermostat.SystemMode.Off:
                        if (this.ioBrokerDevice.hasPower() && this.ioBrokerDevice.getPower()) {
                            await this.ioBrokerDevice.updatePower(false);
                        }
                        return ThermostatMode.Off;
                    case MatterThermostat.SystemMode.Heat:
                        ioMode = ThermostatMode.Heat;
                        break;
                    case MatterThermostat.SystemMode.Cool:
                        ioMode = ThermostatMode.Cool;
                        break;
                    case MatterThermostat.SystemMode.Auto:
                        ioMode = ThermostatMode.Auto;
                }
                if (ioMode !== undefined) {
                    if (this.ioBrokerDevice.hasPower() && !this.ioBrokerDevice.getPower()) {
                        await this.ioBrokerDevice.updatePower(true);
                    }
                    if (ioMode === ThermostatMode.Heat) {
                        const heatSetpoint = this.appEndpoint.maybeStateOf(ThermostatClient)?.occupiedHeatingSetpoint;
                        if (heatSetpoint !== undefined) {
                            await this.ioBrokerDevice.updateLevel(this.temperatureFromMatter(heatSetpoint));
                        }
                    } else if (ioMode === ThermostatMode.Cool) {
                        const coolSetpoint = this.appEndpoint.maybeStateOf(ThermostatClient)?.occupiedCoolingSetpoint;
                        if (coolSetpoint !== undefined) {
                            await this.ioBrokerDevice.updateLevel(this.temperatureFromMatter(coolSetpoint));
                        }
                    }
                    return ioMode;
                }
            },
            changeHandler: async value => {
                let mode: MatterThermostat.SystemMode | undefined = undefined;
                switch (value) {
                    case ThermostatMode.Off:
                        mode = MatterThermostat.SystemMode.Off;
                        break;
                    case ThermostatMode.Heat:
                        mode = MatterThermostat.SystemMode.Heat;
                        break;
                    case ThermostatMode.Cool:
                        mode = MatterThermostat.SystemMode.Cool;
                        break;
                    case ThermostatMode.Auto:
                        mode = MatterThermostat.SystemMode.Auto;
                }
                if (mode === undefined) {
                    this.ioBrokerDevice.adapter.log.warn(
                        `Unsupported thermostat mode: ${value} (${ThermostatModeNumbers[value]})`,
                    );
                    return;
                }
                await this.appEndpoint.setStateOf(ThermostatClient, { systemMode: mode });
            },
        });
        this.registerStateChangeHandlerForAttribute({
            endpointId: this.appEndpoint.number,
            clusterId: MatterThermostat.id,
            attributeName: 'occupiedHeatingSetpoint',
            matterValueChanged: (value: number) => this.#handleUpdatedMatterTemperature(ThermostatMode.Heat, value),
        });
        this.registerStateChangeHandlerForAttribute({
            endpointId: this.appEndpoint.number,
            clusterId: MatterThermostat.id,
            attributeName: 'occupiedCoolingSetpoint',
            matterValueChanged: (value: number) => this.#handleUpdatedMatterTemperature(ThermostatMode.Heat, value),
        });

        // TODO Add ControlSequenceOfOperation or such? And/Or Add power

        return super.enableDeviceTypeStates();
    }

    override async init(): Promise<void> {
        await super.init(true);

        const thermostat = this.appEndpoint.maybeStateOf(ThermostatClient);
        if (thermostat === undefined) {
            return;
        }
        const features = this.appEndpoint.behaviors.typeFor(ThermostatClient)?.features;

        // Determine global Min/Max values from Heat and Cool modes
        let min: number | undefined = undefined;
        let max: number | undefined = undefined;
        if (features?.heating) {
            this.#minHeatSetpointLimit = thermostat.absMinHeatSetpointLimit;
            if (this.#minHeatSetpointLimit !== undefined) {
                min = Math.min(min ?? this.#minHeatSetpointLimit, this.#minHeatSetpointLimit);
            }
            this.#maxHeatSetpointLimit = thermostat.absMaxHeatSetpointLimit;
            if (this.#maxHeatSetpointLimit !== undefined) {
                max = Math.max(max ?? this.#maxHeatSetpointLimit, this.#maxHeatSetpointLimit);
            }
        }

        if (features?.cooling) {
            this.#minCoolSetpointLimit = thermostat.absMinCoolSetpointLimit;
            if (this.#minCoolSetpointLimit !== undefined) {
                min = Math.min(min ?? this.#minCoolSetpointLimit, this.#minCoolSetpointLimit);
            }
            this.#maxCoolSetpointLimit = thermostat.absMaxCoolSetpointLimit;
            if (this.#maxCoolSetpointLimit !== undefined) {
                max = Math.max(max ?? this.#maxCoolSetpointLimit, this.#maxCoolSetpointLimit);
            }
        }
        if (min !== undefined) {
            min = this.temperatureFromMatter(min);
        }
        if (max !== undefined) {
            max = this.temperatureFromMatter(max);
        }
        await this.ioBrokerDevice.updateSetpointMinMax(min, max);

        // Process delayed State init after correcting min/max values
        await this.initializeStates();
    }

    get ioBrokerDevice(): Thermostat {
        return this.#ioBrokerDevice;
    }
}
