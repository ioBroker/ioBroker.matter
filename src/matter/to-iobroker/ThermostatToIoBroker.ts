import ChannelDetector from '@iobroker/type-detector';
import { Thermostat as MatterThermostat } from '@matter/main/clusters';
import type { Endpoint, PairedNode } from '@project-chip/matter.js/device';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { DetectedDevice, DeviceOptions } from '../../lib/devices/GenericDevice';
import Thermostat, { ThermostatMode, ThermostatModeNumbers } from '../../lib/devices/Thermostat';
import { GenericElectricityDataDeviceToIoBroker } from './GenericElectricityDataDeviceToIoBroker';

/** Mapping Logic to map a ioBroker Socket device to a Matter OnOffPlugInUnitDevice. */
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

        this.#ioBrokerDevice = new Thermostat(
            { ...ChannelDetector.getPatterns().thermostat, isIoBrokerDevice: false } as DetectedDevice,
            adapter,
            this.enableDeviceTypeStates(),
        );
    }

    async #handleUpdatedMatterTemperature(forMode: ThermostatMode, value: number): Promise<void> {
        value = value / 100; // TODO Validate
        const currentMode = this.ioBrokerDevice.getMode();
        if (
            currentMode === ThermostatMode.Auto ||
            (currentMode === ThermostatMode.Heat && forMode === ThermostatMode.Heat) ||
            (currentMode === ThermostatMode.Cool && forMode === ThermostatMode.Cool)
        ) {
            await this.ioBrokerDevice.updateLevel(value);
        }
    }

    protected enableDeviceTypeStates(): DeviceOptions {
        this.enableDeviceTypeStateForAttribute(PropertyType.Temperature, {
            endpointId: this.appEndpoint.getNumber(),
            clusterId: MatterThermostat.Cluster.id,
            attributeName: 'localTemperature',
            convertValue: value => value / 100, // TODO Validate
        });
        this.enableDeviceTypeStateForAttribute(PropertyType.Level, {
            changeHandler: async value => {
                const mode = this.ioBrokerDevice.getMode();
                if (mode === ThermostatMode.Heat || mode === ThermostatMode.Auto) {
                    await this.appEndpoint
                        .getClusterClient(MatterThermostat.Complete)
                        ?.setOccupiedHeatingSetpointAttribute(Math.round(value * 100)); // TODO Validate
                }
                if (mode === ThermostatMode.Cool || mode === ThermostatMode.Auto) {
                    await this.appEndpoint
                        .getClusterClient(MatterThermostat.Complete)
                        ?.setOccupiedCoolingSetpointAttribute(Math.round(value * 100)); // TODO Validate
                }
            },
        });
        this.enableDeviceTypeStateForAttribute(PropertyType.Mode, {
            endpointId: this.appEndpoint.getNumber(),
            clusterId: MatterThermostat.Cluster.id,
            attributeName: 'systemMode',
            convertValue: async (value: MatterThermostat.SystemMode) => {
                let ioMode: ThermostatMode | undefined = undefined;
                switch (value) {
                    case MatterThermostat.SystemMode.Off:
                        /*if (this.ioBrokerDevice.getPower()) {
                            await this.ioBrokerDevice.updatePower(false);
                        }*/
                        break;
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
                    /*if (!this.ioBrokerDevice.getPower()) {
                        await this.ioBrokerDevice.updatePower(true);
                    }*/
                    if (ioMode === ThermostatMode.Heat) {
                        const heatSetpoint = await this.appEndpoint
                            .getClusterClient(MatterThermostat.Complete)
                            ?.getOccupiedHeatingSetpointAttribute();
                        if (heatSetpoint !== undefined) {
                            await this.ioBrokerDevice.updateLevel(heatSetpoint);
                        }
                    } else if (ioMode === ThermostatMode.Cool) {
                        const coolSetpoint = await this.appEndpoint
                            .getClusterClient(MatterThermostat.Complete)
                            ?.getOccupiedCoolingSetpointAttribute();
                        if (coolSetpoint !== undefined) {
                            await this.ioBrokerDevice.updateLevel(coolSetpoint);
                        }
                    }
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
                await this.appEndpoint.getClusterClient(MatterThermostat.Complete)?.setSystemModeAttribute(mode);
            },
        });
        this.registerStateChangeHandlerForAttribute({
            endpointId: this.appEndpoint.getNumber(),
            clusterId: MatterThermostat.Cluster.id,
            attributeName: 'occupiedHeatingSetpoint',
            matterValueChanged: (value: number) => this.#handleUpdatedMatterTemperature(ThermostatMode.Heat, value),
        });
        this.registerStateChangeHandlerForAttribute({
            endpointId: this.appEndpoint.getNumber(),
            clusterId: MatterThermostat.Cluster.id,
            attributeName: 'occupiedCoolingSetpoint',
            matterValueChanged: (value: number) => this.#handleUpdatedMatterTemperature(ThermostatMode.Heat, value),
        });

        // TODO Add ControlSequenceOfOperation or such? And/Or Add power

        return super.enableDeviceTypeStates();
    }

    override async init(): Promise<void> {
        await super.init();

        const thermostat = this.appEndpoint.getClusterClient(MatterThermostat.Complete);
        if (thermostat === undefined) {
            return;
        }

        const features = thermostat.supportedFeatures;
        const modes: { [key: string]: ThermostatMode } = {};
        if (features?.heating) {
            modes[ThermostatModeNumbers[ThermostatMode.Heat]] = ThermostatMode.Heat;
        }
        if (features?.cooling) {
            modes[ThermostatModeNumbers[ThermostatMode.Cool]] = ThermostatMode.Cool;
        }
        if (features?.autoMode) {
            modes[ThermostatModeNumbers[ThermostatMode.Auto]] = ThermostatMode.Auto;
        }
        await this.ioBrokerDevice.updateModes(modes);

        // Determine global Min/Max values from Heat and Cool modes
        let min: number | undefined = undefined;
        let max: number | undefined = undefined;
        if (features?.heating) {
            this.#minHeatSetpointLimit = thermostat.isAttributeSupportedByName('absMinHeatSetpointLimit')
                ? await thermostat.getAbsMinHeatSetpointLimitAttribute()
                : undefined;
            if (this.#minHeatSetpointLimit !== undefined) {
                min = Math.min(min ?? this.#minHeatSetpointLimit, this.#minHeatSetpointLimit);
            }
            this.#maxHeatSetpointLimit = thermostat.isAttributeSupportedByName('absMaxHeatSetpointLimit')
                ? await thermostat.getAbsMaxHeatSetpointLimitAttribute()
                : undefined;
            if (this.#maxHeatSetpointLimit !== undefined) {
                max = Math.max(max ?? this.#maxHeatSetpointLimit, this.#maxHeatSetpointLimit);
            }
        }

        if (features?.cooling) {
            this.#minCoolSetpointLimit = thermostat.isAttributeSupportedByName('absMinCoolSetpointLimit')
                ? await thermostat.getAbsMinCoolSetpointLimitAttribute()
                : undefined;
            if (this.#minCoolSetpointLimit !== undefined) {
                min = Math.min(min ?? this.#minCoolSetpointLimit, this.#minCoolSetpointLimit);
            }
            this.#maxCoolSetpointLimit = thermostat.isAttributeSupportedByName('absMaxCoolSetpointLimit')
                ? await thermostat.getAbsMaxCoolSetpointLimitAttribute()
                : undefined;
            if (this.#maxCoolSetpointLimit !== undefined) {
                max = Math.max(max ?? this.#maxCoolSetpointLimit, this.#maxCoolSetpointLimit);
            }
        }
        if (min !== undefined) {
            min = min / 100; // TODO Validate
        }
        if (max !== undefined) {
            max = max / 100; // TODO Validate
        }
        await this.ioBrokerDevice.updateSetpointMinMax(min, max);
    }

    get ioBrokerDevice(): Thermostat {
        return this.#ioBrokerDevice;
    }
}
