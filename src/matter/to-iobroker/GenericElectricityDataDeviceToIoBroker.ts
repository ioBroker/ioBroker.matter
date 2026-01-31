import { AttributeId, ClusterId } from '@matter/main';
import { ElectricalEnergyMeasurement, ElectricalPowerMeasurement } from '@matter/main/clusters';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { DeviceOptions } from '../../lib/devices/GenericDevice';
import { GenericDeviceToIoBroker } from './GenericDeviceToIoBroker';
import type { CustomStatesRecord, EmptyCustomStates } from './custom-states';

/**
 * Abstract class for devices that may have electrical measurement data.
 */
export abstract class GenericElectricityDataDeviceToIoBroker<
    C extends CustomStatesRecord = EmptyCustomStates,
> extends GenericDeviceToIoBroker<C> {
    protected enableDeviceTypeStates(): DeviceOptions {
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

    #enableMatterElectricalMeasurementStates(): boolean {
        const endpointId = this.appEndpoint.getNumber();

        let found = false;
        // TODO check for other attributes and feature combinations or also other information
        const electricalPower = this.appEndpoint.getClusterClient(ElectricalPowerMeasurement.Complete);
        if (electricalPower !== undefined) {
            const clusterId = ElectricalPowerMeasurement.Cluster.id;
            this.enableDeviceTypeStateForAttribute(PropertyType.ElectricPower, {
                endpointId,
                clusterId,
                attributeName: 'activePower',
                convertValue: value => value / 1000,
            });
            this.enableDeviceTypeStateForAttribute(PropertyType.Current, {
                endpointId,
                clusterId,
                attributeName: 'activeCurrent',
                // No conversion because also our default unit is mA
            });
            this.enableDeviceTypeStateForAttribute(PropertyType.Voltage, {
                endpointId,
                clusterId,
                attributeName: 'voltage',
                convertValue: value => value / 1000,
            });
            this.enableDeviceTypeStateForAttribute(PropertyType.Frequency, {
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
            this.enableDeviceTypeStateForAttribute(PropertyType.Consumption, {
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
        // TODO Add polling when this is present and with the Eve vendor id 4874 (0x130a)
        const isEveDevice = this.nodeBasicInformation.vendorId === 0x130a; // Only poll real Eve devices
        const clusterId = ClusterId(0x130afc01);
        const eveCluster = this.appEndpoint.getClusterClientById(clusterId);
        if (eveCluster !== undefined) {
            // Label="timesOpened", Tag=0x130A0006, Type=int
            // Label="wattAccumulatedControlPoint", Tag=0x130A000E, Type=float32
            // Label="altitude", Tag=0x130A0013, Type=float32
            // Label="pressure", Tag=0x130A0014, Type=float32
            // Label="valvePosition", Tag=0x130A0018, Type=int
            // Label="motionSensitivity", Tag=0x130A000D, Type=int

            this.enableDeviceTypeStateForAttribute(PropertyType.ElectricPower, {
                endpointId,
                clusterId,
                vendorSpecificAttributeId: AttributeId(0x130a000a),
                pollAttribute: isEveDevice,
            });
            this.enableDeviceTypeStateForAttribute(PropertyType.Consumption, {
                endpointId,
                clusterId,
                vendorSpecificAttributeId: AttributeId(0x130a000b),
                pollAttribute: isEveDevice,
            });
            this.enableDeviceTypeStateForAttribute(PropertyType.Current, {
                endpointId,
                clusterId,
                vendorSpecificAttributeId: AttributeId(0x130a0009),
                convertValue: value => value * 1000, // let's assume we have A?
                pollAttribute: isEveDevice,
            });
            this.enableDeviceTypeStateForAttribute(PropertyType.Voltage, {
                endpointId,
                clusterId,
                vendorSpecificAttributeId: AttributeId(0x130a0008),
                pollAttribute: isEveDevice,
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
            this.enableDeviceTypeStateForAttribute(PropertyType.ElectricPower, {
                endpointId,
                clusterId,
                vendorSpecificAttributeId: AttributeId(0x00125d0023),
                pollAttribute: true,
            }); // Watt as Float
            this.enableDeviceTypeStateForAttribute(PropertyType.Consumption, {
                endpointId,
                clusterId,
                vendorSpecificAttributeId: AttributeId(0x00125d0021),
                pollAttribute: true,
            }); // Accumulated Watt as Float
            this.enableDeviceTypeStateForAttribute(PropertyType.Current, {
                endpointId,
                clusterId,
                vendorSpecificAttributeId: AttributeId(0x00125d0022),
                convertValue: value => value * 1000, // let's assume we have A?
                pollAttribute: true,
            }); // Current as float 32
            this.enableDeviceTypeStateForAttribute(PropertyType.Voltage, {
                endpointId,
                clusterId,
                vendorSpecificAttributeId: AttributeId(0x00125d0024),
                pollAttribute: true,
            }); // Voltage as float 32
            return true;
        }
        return false;
    }
}
