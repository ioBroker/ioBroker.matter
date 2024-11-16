import { DeviceClassification, DeviceTypeModel, MatterModel } from '@matter/main/model';
import type { Endpoint, PairedNode } from '@project-chip/matter.js/device';
import { ContactSensorToIoBroker } from './ContactSensorToIoBroker';
import { DimmableToIobroker } from './DimmableToIobroker';
import { DoorLockToIoBroker } from './DoorLockToIoBroker';
import type { GenericDeviceToIoBroker } from './GenericDeviceToIoBroker';
import { HumiditySensorToIoBroker } from './HumiditySensorToIoBroker';
import { OccupancyToIoBroker } from './OccupancyToIoBroker';
import { OnOffLightToIoBroker } from './OnOffLightToIoBroker';
import { OnOffPlugInUnitToIoBroker } from './OnOffPlugInUnitToIoBroker';
import { TemperatureSensorToIoBroker } from './TemperatureSensorToIoBroker';
import { UtilityOnlyToIoBroker } from './UtilityOnlyToIoBroker';
import { WaterLeakDetectorToIoBroker } from './WaterLeakDetectorToIoBroker';

export function identifyDeviceTypes(endpoint: Endpoint): {
    utilityTypes: { deviceType: DeviceTypeModel; revision: number }[];
    appTypes: { deviceType: DeviceTypeModel; revision: number }[];
    primaryDeviceType?: { deviceType: DeviceTypeModel; revision: number };
} {
    const matterDeviceTypes = endpoint.getDeviceTypes();

    const utilityTypes = new Array<{ deviceType: DeviceTypeModel; revision: number }>();
    const appTypes = new Array<{ deviceType: DeviceTypeModel; revision: number }>();
    matterDeviceTypes.forEach(deviceType => {
        const deviceTypeDetails = MatterModel.standard.get(DeviceTypeModel, deviceType.code);
        if (deviceTypeDetails === undefined) {
            // Found unknown Endpoint Devicetype
            return;
        }
        if (deviceTypeDetails.classification === DeviceClassification.Utility) {
            utilityTypes.push({ deviceType: deviceTypeDetails, revision: deviceType.revision });
        } else {
            appTypes.push({ deviceType: deviceTypeDetails, revision: deviceType.revision });
        }
    });
    const primaryDeviceType = appTypes.length > 0 ? appTypes[0] : utilityTypes[0];

    return { utilityTypes, appTypes, primaryDeviceType };
}

/**
 * Factory function to create an ioBroker device from a Matter device type.
 */
async function ioBrokerDeviceFabric(
    node: PairedNode,
    endpoint: Endpoint,
    rootEndpoint: Endpoint,
    adapter: ioBroker.Adapter,
    endpointDeviceBaseId: string,
    defaultConnectionStateId: string,
): Promise<any> {
    const { primaryDeviceType, utilityTypes } = identifyDeviceTypes(endpoint);

    const fullEndpointDeviceBaseId = `${adapter.namespace}.${endpointDeviceBaseId}`;
    const mainDeviceTypeName = primaryDeviceType?.deviceType.name ?? 'Unknown';
    adapter.log.info(`Node ${node.nodeId}: Creating device for ${mainDeviceTypeName}`);
    let device: GenericDeviceToIoBroker;
    switch (mainDeviceTypeName) {
        case 'DimmablePlugInUnit':
        case 'DimmableLight':
            device = new DimmableToIobroker(
                node,
                endpoint,
                rootEndpoint,
                adapter,
                fullEndpointDeviceBaseId,
                mainDeviceTypeName,
                defaultConnectionStateId,
            );
            break;
        case 'ContactSensor':
            device = new ContactSensorToIoBroker(
                node,
                endpoint,
                rootEndpoint,
                adapter,
                fullEndpointDeviceBaseId,
                mainDeviceTypeName,
                defaultConnectionStateId,
            );
            break;
        case 'DoorLock':
            device = new DoorLockToIoBroker(
                node,
                endpoint,
                rootEndpoint,
                adapter,
                fullEndpointDeviceBaseId,
                mainDeviceTypeName,
                defaultConnectionStateId,
            );
            break;
        case 'ElectricalSensor':
        case 'PowerSource':
            device = new UtilityOnlyToIoBroker(
                node,
                endpoint,
                rootEndpoint,
                adapter,
                fullEndpointDeviceBaseId,
                mainDeviceTypeName,
                defaultConnectionStateId,
            );
            break;
        case 'HumiditySensor':
            device = new HumiditySensorToIoBroker(
                node,
                endpoint,
                rootEndpoint,
                adapter,
                fullEndpointDeviceBaseId,
                mainDeviceTypeName,
                defaultConnectionStateId,
            );
            break;
        case 'OccupancySensor':
            device = new OccupancyToIoBroker(
                node,
                endpoint,
                rootEndpoint,
                adapter,
                fullEndpointDeviceBaseId,
                mainDeviceTypeName,
                defaultConnectionStateId,
            );
            break;
        case 'OnOffLight':
            device = new OnOffLightToIoBroker(
                node,
                endpoint,
                rootEndpoint,
                adapter,
                fullEndpointDeviceBaseId,
                mainDeviceTypeName,
                defaultConnectionStateId,
            );
            break;
        case 'OnOffPlugInUnit':
            device = new OnOffPlugInUnitToIoBroker(
                node,
                endpoint,
                rootEndpoint,
                adapter,
                fullEndpointDeviceBaseId,
                mainDeviceTypeName,
                defaultConnectionStateId,
            );
            break;
        case 'TemperatureSensor':
            device = new TemperatureSensorToIoBroker(
                node,
                endpoint,
                rootEndpoint,
                adapter,
                fullEndpointDeviceBaseId,
                mainDeviceTypeName,
                defaultConnectionStateId,
            );
            break;
        case 'WaterLeakDetector':
            device = new WaterLeakDetectorToIoBroker(
                node,
                endpoint,
                rootEndpoint,
                adapter,
                fullEndpointDeviceBaseId,
                mainDeviceTypeName,
                defaultConnectionStateId,
            );
            break;
        default:
            if (utilityTypes.length === 0) {
                adapter.log.info(
                    `Node ${node.nodeId}: Unknown device type: ${mainDeviceTypeName}. We enabled exposing of the application clusters for this node if you need this device type.`,
                );
            }
            // ... but device has a utility type, so we can expose it
            device = new UtilityOnlyToIoBroker(
                node,
                endpoint,
                rootEndpoint,
                adapter,
                fullEndpointDeviceBaseId,
                mainDeviceTypeName,
                defaultConnectionStateId,
            );
    }
    await device.init();
    return device;
}

export default ioBrokerDeviceFabric;
