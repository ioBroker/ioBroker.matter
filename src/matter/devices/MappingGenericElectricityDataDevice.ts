import { ElectricalEnergyMeasurementServer } from '@project-chip/matter.js/behavior/definitions/electrical-energy-measurement';
import { ElectricalPowerMeasurementServer } from '@project-chip/matter.js/behavior/definitions/electrical-power-measurement';
import { PowerTopologyServer } from '@project-chip/matter.js/behavior/definitions/power-topology';
import {
    ElectricalEnergyMeasurement,
    ElectricalPowerMeasurement,
    MeasurementType,
    PowerTopology,
} from '@project-chip/matter.js/cluster';
import { Endpoint } from '@project-chip/matter.js/endpoint';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import ElectricityDataDevice from '../../lib/devices/ElectricityDataDevice';
import { MappingGenericDevice } from './MappingGenericDevice';

type EnergyValues = { energy: number };

type PowerValues = {
    activePower: number | null;
    activeCurrent: number | null;
    voltage: number | null;
    frequency: number | null;
};

export abstract class MappingGenericElectricityDataDevice extends MappingGenericDevice {
    #powerClusterAdded = false;
    #energyClusterAdded = false;

    protected addElectricityDataClusters(endpoint: Endpoint<any>, ioBrokerDevice: ElectricityDataDevice): void {
        const measuredAccuracies = [];
        if (ioBrokerDevice.getPropertyNames().includes(PropertyType.ElectricPower)) {
            measuredAccuracies.push({
                measurementType: MeasurementType.ActivePower,
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
            });
        }
        if (ioBrokerDevice.getPropertyNames().includes(PropertyType.Current)) {
            measuredAccuracies.push({
                measurementType: MeasurementType.ActiveCurrent,
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
            });
        }
        if (ioBrokerDevice.getPropertyNames().includes(PropertyType.Voltage)) {
            measuredAccuracies.push({
                measurementType: MeasurementType.Voltage,
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
            });
        }
        if (ioBrokerDevice.getPropertyNames().includes(PropertyType.Frequency)) {
            measuredAccuracies.push({
                measurementType: MeasurementType.Frequency,
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
            });
        }

        if (measuredAccuracies.length) {
            // Adds the ElectricalPowerMeasurement cluster to the endpoint
            endpoint.behaviors.require(
                ElectricalPowerMeasurementServer.with(ElectricalPowerMeasurement.Feature.AlternatingCurrent),
                {
                    powerMode: ElectricalPowerMeasurement.PowerMode.Ac,
                    numberOfMeasurementTypes: measuredAccuracies.length,
                    accuracy: measuredAccuracies,
                },
            );
            this.#powerClusterAdded = true;
        }

        if (ioBrokerDevice.getPropertyNames().includes(PropertyType.Consumption)) {
            // Adds the ElectricalEnergyMeasurement cluster to the endpoint
            endpoint.behaviors.require(
                ElectricalEnergyMeasurementServer.with(
                    ElectricalEnergyMeasurement.Feature.ImportedEnergy,
                    ElectricalEnergyMeasurement.Feature.CumulativeEnergy,
                ),
                {
                    accuracy: {
                        measurementType: MeasurementType.ElectricalEnergy,
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
        const electricalPower = ioBrokerDevice.getElectricPower();
        const current = ioBrokerDevice.getCurrent();
        const voltage = ioBrokerDevice.getVoltage();
        const frequency = ioBrokerDevice.getFrequency();

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
            await endpoint.set({
                electricalPowerMeasurement: this.#getPowerValues(ioBrokerDevice),
            });
        }

        if (this.#energyClusterAdded) {
            ioBrokerDevice.onChange(async event => {
                switch (event.property) {
                    case PropertyType.Consumption:
                        await endpoint.set({
                            electricalEnergyMeasurement: {
                                cumulativeEnergyImported: {
                                    energy: typeof event.value === 'number' ? event.value * 1000 : 0,
                                },
                            },
                        });
                        break;
                }
            });

            // init current state from ioBroker side
            await endpoint.set({
                electricalEnergyMeasurement: {
                    cumulativeEnergyImported: this.#getEnergyValues(ioBrokerDevice),
                },
            });
        }
    }
}
