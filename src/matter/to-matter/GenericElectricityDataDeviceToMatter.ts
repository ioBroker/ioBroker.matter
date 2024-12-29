import type { Endpoint } from '@matter/main';
import {
    ElectricalEnergyMeasurementServer,
    ElectricalPowerMeasurementServer,
    PowerTopologyServer,
} from '@matter/main/behaviors';
import { ElectricalEnergyMeasurement, ElectricalPowerMeasurement, PowerTopology } from '@matter/main/clusters';
import { MeasurementType } from '@matter/main/types';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type ElectricityDataDevice from '../../lib/devices/ElectricityDataDevice';
import { GenericDeviceToMatter } from './GenericDeviceToMatter';

type EnergyValues = { energy: number };

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
        const measuredAccuracies = [];
        const initialValues: any = {};
        if (ioBrokerDevice.hasElectricPower()) {
            measuredAccuracies.push({
                measurementType: MeasurementType.ActivePower,
                ...fakedAccuracyDetails,
            });
            initialValues.activePower = null;
            this.#hasActivePower = true;
        }
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

        if (measuredAccuracies.length) {
            // Adds the ElectricalPowerMeasurement cluster to the endpoint
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

    #getEnergyValues(ioBrokerDevice: ElectricityDataDevice): EnergyValues {
        const energy = ioBrokerDevice.getConsumption() ?? 0;
        return {
            energy: energy * 1000, // mWh
        };
    }

    #getPowerValues(ioBrokerDevice: ElectricityDataDevice): PowerValues {
        const electricalPower = this.#hasActivePower ? ioBrokerDevice.getElectricPower() : undefined;
        const current = this.#hasActiveCurrent ? ioBrokerDevice.getCurrent() : undefined;
        const voltage = this.#hasVoltage ? ioBrokerDevice.getVoltage() : undefined;
        const frequency = this.#hasFrequency ? ioBrokerDevice.getFrequency() : undefined;

        return {
            activePower: typeof electricalPower === 'number' ? electricalPower * 1000 : null, // mW
            activeCurrent: typeof current === 'number' ? current * 1000 : null, // mA
            voltage: typeof voltage === 'number' ? voltage * 1000 : null, // mV
            frequency: typeof frequency === 'number' ? frequency * 1000 : null, // mHz
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
                                activePower: typeof event.value === 'number' ? event.value * 1000 : null,
                            },
                        });
                        break;
                    case PropertyType.Current:
                        await endpoint.set({
                            electricalPowerMeasurement: {
                                activeCurrent: typeof event.value === 'number' ? event.value * 1000 : null,
                            },
                        });
                        break;
                    case PropertyType.Voltage:
                        await endpoint.set({
                            electricalPowerMeasurement: {
                                voltage: typeof event.value === 'number' ? event.value * 1000 : null,
                            },
                        });
                        break;
                    case PropertyType.Frequency:
                        await endpoint.set({
                            electricalPowerMeasurement: {
                                frequency: typeof event.value === 'number' ? event.value * 100 : null,
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
                        await endpoint.act(agent =>
                            agent.get(ElectricalEnergyMeasurementServer).setMeasurement({
                                cumulativeEnergy: {
                                    imported: {
                                        energy: typeof event.value === 'number' ? event.value * 1000 : 0,
                                    },
                                },
                            }),
                        );
                        break;
                }
            });

            const imported = this.#getEnergyValues(ioBrokerDevice);
            // init current state from ioBroker side
            await endpoint.act(agent =>
                agent.get(ElectricalEnergyMeasurementServer).setMeasurement({
                    cumulativeEnergy: { imported },
                }),
            );
        }
    }
}
