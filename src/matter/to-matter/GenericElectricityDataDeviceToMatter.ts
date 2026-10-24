import { type Endpoint, Time } from '@matter/main';
import {
    ElectricalEnergyMeasurementServer,
    ElectricalPowerMeasurementServer,
    PowerTopologyServer,
} from '@matter/main/behaviors';
import { ElectricalEnergyMeasurement, ElectricalPowerMeasurement, PowerTopology } from '@matter/main/clusters';
import { MATTER_EPOCH_OFFSET_S, MeasurementType } from '@matter/main/types';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { ElectricityDataDevice } from '../../lib/devices/ElectricityDataDevice';
import { GenericDeviceToMatter } from './GenericDeviceToMatter';
import { MatterConverters } from '../ConversionUtils';

/** Nullable electrical measurement in thousandths of the ioBroker unit. */
function milli(value: unknown): number | null {
    return MatterConverters.toMatterMeasurement(value, MatterConverters.toMatterThousandths);
}

type PowerValues = {
    activePower: number | null;
    activeCurrent: number | null;
    voltage: number | null;
    frequency: number | null;
};

const fakedAccuracyDetails = {
    measured: true,
    minMeasuredValue: Number.MIN_SAFE_INTEGER,
    maxMeasuredValue: Number.MAX_SAFE_INTEGER,
    accuracyRanges: [
        {
            rangeMin: Number.MIN_SAFE_INTEGER,
            rangeMax: Number.MAX_SAFE_INTEGER,
            fixedMax: 1,
        },
    ],
};

export abstract class GenericElectricityDataDeviceToMatter extends GenericDeviceToMatter {
    #powerClusterAdded = false;
    #energyClusterAdded = false;
    #hasActivePower = false;
    #hasActiveCurrent = false;
    #hasVoltage = false;
    #hasFrequency = false;

    protected addElectricityDataClusters(endpoint: Endpoint<any>, ioBrokerDevice: ElectricityDataDevice): void {
        this.#hasActivePower = ioBrokerDevice.hasElectricPower();
        // Accuracy must list ActivePower even when the device has no power state (spec 2.13.6.3)
        const measuredAccuracies = [
            {
                measurementType: MeasurementType.ActivePower,
                ...fakedAccuracyDetails,
                measured: this.#hasActivePower,
            },
        ];
        const initialValues: any = {};
        if (ioBrokerDevice.hasCurrent()) {
            measuredAccuracies.push({
                measurementType: MeasurementType.ActiveCurrent,
                ...fakedAccuracyDetails,
            });
            initialValues.activeCurrent = null;
            this.#hasActiveCurrent = true;
        }
        if (ioBrokerDevice.hasVoltage()) {
            measuredAccuracies.push({
                measurementType: MeasurementType.Voltage,
                ...fakedAccuracyDetails,
            });
            initialValues.voltage = null;
            this.#hasVoltage = true;
        }
        if (ioBrokerDevice.hasFrequency()) {
            measuredAccuracies.push({
                measurementType: MeasurementType.Frequency,
                ...fakedAccuracyDetails,
            });
            initialValues.frequency = null;
            this.#hasFrequency = true;
        }

        if (this.#hasActivePower || this.#hasActiveCurrent || this.#hasVoltage || this.#hasFrequency) {
            endpoint.behaviors.require(
                ElectricalPowerMeasurementServer.with(ElectricalPowerMeasurement.Feature.AlternatingCurrent),
                {
                    ...initialValues,
                    powerMode: ElectricalPowerMeasurement.PowerMode.Ac,
                    numberOfMeasurementTypes: measuredAccuracies.length,
                    accuracy: measuredAccuracies,
                },
            );
            this.#powerClusterAdded = true;
        }

        if (ioBrokerDevice.hasConsumption()) {
            // Adds the ElectricalEnergyMeasurement cluster to the endpoint
            endpoint.behaviors.require(
                ElectricalEnergyMeasurementServer.with(
                    ElectricalEnergyMeasurement.Feature.ImportedEnergy,
                    ElectricalEnergyMeasurement.Feature.CumulativeEnergy,
                ),
                {
                    accuracy: {
                        measurementType: MeasurementType.ElectricalEnergy,
                        ...fakedAccuracyDetails,
                    },
                },
            );
            this.#energyClusterAdded = true;
        }

        if (this.#powerClusterAdded || this.#energyClusterAdded) {
            // Adds PowerTopology cluster to the endpoint
            endpoint.behaviors.require(PowerTopologyServer.with(PowerTopology.Feature.TreeTopology));
        }
    }

    /**
     * Sets CumulativeEnergyImported from a consumption in Wh and emits CumulativeEnergyMeasured. An unknown or
     * negative consumption sets the attribute to null without an event, because the energy is 0..2^62 and the event
     * has no null form (2.12.5.2, 2.12.6.2, 2.12.7.1). A cumulative measurement carries only its end time
     * (2.12.5.2.2, 2.12.5.2.3), and none while the clock is before the Matter epoch: such a clock has not determined
     * the time in UTC, and matter.js cannot encode a time before 2000-01-01.
     */
    async #setConsumption(endpoint: Endpoint<any>, wh: unknown): Promise<void> {
        const energy = MatterConverters.toMatterMeasurement(wh, MatterConverters.toMatterThousandths);
        if (energy === null || energy < 0) {
            await endpoint.set({ electricalEnergyMeasurement: { cumulativeEnergyImported: null } });
            return;
        }
        const now = Math.floor(Time.nowMs / 1000);
        const endTimestamp = now >= MATTER_EPOCH_OFFSET_S ? now : undefined;
        await endpoint.act(agent =>
            agent.get(ElectricalEnergyMeasurementServer).setMeasurement({
                cumulativeEnergy: { imported: { energy, endTimestamp } },
            }),
        );
    }

    #getPowerValues(ioBrokerDevice: ElectricityDataDevice): PowerValues {
        const electricalPower = this.#hasActivePower ? ioBrokerDevice.getElectricPower() : undefined;
        const current = this.#hasActiveCurrent ? ioBrokerDevice.getCurrent() : undefined;
        const voltage = this.#hasVoltage ? ioBrokerDevice.getVoltage() : undefined;
        const frequency = this.#hasFrequency ? ioBrokerDevice.getFrequency() : undefined;

        return {
            activePower: milli(electricalPower),
            activeCurrent: milli(current),
            voltage: milli(voltage),
            frequency: milli(frequency),
        };
    }

    /**
     * Initialize Electricity states for the device and Map it to Matter.
     */
    protected async initializeElectricityStateHandlers(
        endpoint: Endpoint<any>,
        ioBrokerDevice: ElectricityDataDevice,
    ): Promise<void> {
        if (this.#powerClusterAdded) {
            ioBrokerDevice.onChange(async event => {
                switch (event.property) {
                    case PropertyType.ElectricPower:
                        await endpoint.set({
                            electricalPowerMeasurement: {
                                activePower: milli(event.value),
                            },
                        });
                        break;
                    case PropertyType.Current:
                        await endpoint.set({
                            electricalPowerMeasurement: {
                                activeCurrent: milli(event.value),
                            },
                        });
                        break;
                    case PropertyType.Voltage:
                        await endpoint.set({
                            electricalPowerMeasurement: {
                                voltage: milli(event.value),
                            },
                        });
                        break;
                    case PropertyType.Frequency:
                        await endpoint.set({
                            electricalPowerMeasurement: {
                                frequency: milli(event.value),
                            },
                        });
                        break;
                }
            });

            // init current state from ioBroker side
            const electricalPowerMeasurement = this.#getPowerValues(ioBrokerDevice);
            await endpoint.set({ electricalPowerMeasurement });
        }

        if (this.#energyClusterAdded) {
            ioBrokerDevice.onChange(async event => {
                switch (event.property) {
                    case PropertyType.Consumption:
                        await this.#setConsumption(endpoint, event.value);
                        break;
                }
            });

            await this.#setConsumption(endpoint, ioBrokerDevice.getConsumption());
        }
    }
}
