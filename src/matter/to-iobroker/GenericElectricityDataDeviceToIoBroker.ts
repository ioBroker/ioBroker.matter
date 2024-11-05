import { AttributeId, ClusterId } from '@matter/main';
import { ElectricalEnergyMeasurement, ElectricalPowerMeasurement, PowerSource } from '@matter/main/clusters';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import { DeviceOptions } from '../../lib/devices/GenericDevice';
import { GenericDeviceToIoBroker } from './GenericDeviceToIoBroker';

export abstract class GenericElectricityDataDeviceToIoBroker extends GenericDeviceToIoBroker {
    protected enableDeviceTypeStates(): DeviceOptions {
        // Check for PowerSource
        this.#enablePowerSourceStates();

        // Check for Energy or Power measurement clusters
        let found = this.#enableMatterElectricalMeasurementStates();
        if (!found) {
            found = this.#enableCustomEveMeasurementStates();
        }
        if (!found) {
            this.#enableCustomNeoMeasurementStates();
        }
        return super.enableDeviceTypeStates();
    }

    #enablePowerSourceStates(): void {
        const endpointId = this.appEndpoint.getNumber();

        const powerSource = this.appEndpoint.getClusterClient(PowerSource.Complete);
        if (powerSource !== undefined && powerSource.supportedFeatures.battery) {
            this.enableDeviceTypeState(PropertyType.ElectricPower, {
                endpointId,
                clusterId: PowerSource.Cluster.id,
                attributeName: 'batChargeLevel',
                convertValue: value => value !== PowerSource.BatChargeLevel.Ok,
            });
        }
    }

    #enableMatterElectricalMeasurementStates(): boolean {
        const endpointId = this.appEndpoint.getNumber();

        let found = false;
        // TODO check for other attributes and feature combinations or also other information
        const electricalPower = this.appEndpoint.getClusterClient(ElectricalPowerMeasurement.Complete);
        if (electricalPower !== undefined) {
            const clusterId = ElectricalPowerMeasurement.Cluster.id;
            this.enableDeviceTypeState(PropertyType.ElectricPower, {
                endpointId,
                clusterId,
                attributeName: 'activePower',
                convertValue: value => value / 1000,
            });
            this.enableDeviceTypeState(PropertyType.Current, {
                endpointId,
                clusterId,
                attributeName: 'activeCurrent',
                // No conversion because also our default unit is mA
            });
            this.enableDeviceTypeState(PropertyType.Voltage, {
                endpointId,
                clusterId,
                attributeName: 'voltage',
                convertValue: value => value / 1000,
            });
            this.enableDeviceTypeState(PropertyType.Frequency, {
                endpointId,
                clusterId,
                attributeName: 'frequency',
                convertValue: value => value / 1000,
            });
            found = true;
        }

        // TODO check for other attributes and feature combinations or also other information
        const electricalEnergy = this.appEndpoint.getClusterClient(ElectricalEnergyMeasurement.Complete);
        if (electricalEnergy !== undefined) {
            this.enableDeviceTypeState(PropertyType.Consumption, {
                endpointId,
                clusterId: ElectricalEnergyMeasurement.Cluster.id,
                attributeName: 'cumulativeEnergy',
            });
            found = true;
        }
        return found;
    }

    #enableCustomEveMeasurementStates(): boolean {
        const endpointId = this.appEndpoint.getNumber();
        // TODO Add polling when this is present nd with the Eve vendor id 4874 (0x130a)
        const clusterId = ClusterId(0x130afc01);
        const eveCluster = this.appEndpoint.getClusterClientById(clusterId);
        if (eveCluster !== undefined) {
            // Label="timesOpened", Tag=0x130A0006, Type=int
            // Label="wattAccumulatedControlPoint", Tag=0x130A000E, Type=float32
            // Label="altitude", Tag=0x130A0013, Type=float32
            // Label="pressure", Tag=0x130A0014, Type=float32
            // Label="valvePosition", Tag=0x130A0018, Type=int
            // Label="motionSensitivity", Tag=0x130A000D, Type=int

            this.enableDeviceTypeState(PropertyType.ElectricPower, {
                endpointId,
                clusterId,
                vendorSpecificAttributeId: AttributeId(0x130a000a),
            });
            this.enableDeviceTypeState(PropertyType.Consumption, {
                endpointId,
                clusterId,
                vendorSpecificAttributeId: AttributeId(0x130a000b),
            });
            this.enableDeviceTypeState(PropertyType.Current, {
                endpointId,
                clusterId,
                vendorSpecificAttributeId: AttributeId(0x130a0009),
                convertValue: value => value * 1000, // let's assume we have A?
            });
            this.enableDeviceTypeState(PropertyType.Voltage, {
                endpointId,
                clusterId,
                vendorSpecificAttributeId: AttributeId(0x130a0008),
            });
            return true;
        }
        return false;
    }

    #enableCustomNeoMeasurementStates(): boolean {
        const endpointId = this.appEndpoint.getNumber();
        // Vendor ID 4991 (0x137F)
        const clusterId = ClusterId(0x00125dfc11);
        const neoCluster = this.appEndpoint.getClusterClientById(clusterId);
        if (neoCluster !== undefined) {
            this.enableDeviceTypeState(PropertyType.ElectricPower, {
                endpointId,
                clusterId,
                vendorSpecificAttributeId: AttributeId(0x00125d0023),
            }); // Watt as Float
            this.enableDeviceTypeState(PropertyType.Consumption, {
                endpointId,
                clusterId,
                vendorSpecificAttributeId: AttributeId(0x00125d0021),
            }); // Accumulated Watt as Float
            this.enableDeviceTypeState(PropertyType.Current, {
                endpointId,
                clusterId,
                vendorSpecificAttributeId: AttributeId(0x00125d0022),
                convertValue: value => value * 1000, // let's assume we have A?
            }); // Current as float 32
            this.enableDeviceTypeState(PropertyType.Voltage, {
                endpointId,
                clusterId,
                vendorSpecificAttributeId: AttributeId(0x00125d0024),
            }); // Voltage as float 32
            return true;
        }
        return false;
    }
}
