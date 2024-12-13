import { DeviceClassification, DeviceTypeModel, MatterModel } from '@matter/main/model';
import type { ClassExtends } from '@matter/main';
import * as Devices from '@matter/main/devices';
import * as Endpoints from '@matter/main/endpoints';
import type { Endpoint, PairedNode } from '@project-chip/matter.js/device';
import { ContactSensorToIoBroker } from './ContactSensorToIoBroker';
import { DimmableToIoBroker } from './DimmableToIoBroker';
import { DoorLockToIoBroker } from './DoorLockToIoBroker';
import type { GenericDeviceToIoBroker } from './GenericDeviceToIoBroker';
import { HumiditySensorToIoBroker } from './HumiditySensorToIoBroker';
import { OccupancyToIoBroker } from './OccupancyToIoBroker';
import { OnOffLightToIoBroker } from './OnOffLightToIoBroker';
import { OnOffPlugInUnitToIoBroker } from './OnOffPlugInUnitToIoBroker';
import { TemperatureSensorToIoBroker } from './TemperatureSensorToIoBroker';
import { UtilityOnlyToIoBroker } from './UtilityOnlyToIoBroker';
import { WaterLeakDetectorToIoBroker } from './WaterLeakDetectorToIoBroker';
import { ColorTemperatureLightToIoBroker } from './ColorTemperatureLightToIoBroker';
import { GenericSwitchToIoBroker } from './GenericSwitchToIoBroker';
import { LightSensorToIoBroker } from './LightSensorToIoBroker';

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
    endpointName: string,
): Promise<any> {
    const { primaryDeviceType, utilityTypes } = identifyDeviceTypes(endpoint);

    const fullEndpointDeviceBaseId = `${adapter.namespace}.${endpointDeviceBaseId}`;
    const mainDeviceTypeName = primaryDeviceType?.deviceType.name ?? 'Unknown';
    adapter.log.info(`Node ${node.nodeId}: Creating device for ${mainDeviceTypeName} (endpoint ${endpoint.number})`);

    let DeviceType: ClassExtends<GenericDeviceToIoBroker>;
    let isSupportedDeviceType = true;
    switch (primaryDeviceType?.deviceType.id) {
        case Devices.ExtendedColorLightDeviceDefinition.deviceType:
        case Devices.ColorTemperatureLightDeviceDefinition.deviceType:
            DeviceType = ColorTemperatureLightToIoBroker;
            break;
        case Devices.ContactSensorDeviceDefinition.deviceType:
            DeviceType = ContactSensorToIoBroker;
            break;
        case Devices.DimmablePlugInUnitDeviceDefinition.deviceType:
        case Devices.DimmableLightDeviceDefinition.deviceType:
            DeviceType = DimmableToIoBroker;
            break;
        case Devices.DoorLockDeviceDefinition.deviceType:
            DeviceType = DoorLockToIoBroker;
            break;
        case Devices.GenericSwitchDeviceDefinition.deviceType:
            DeviceType = GenericSwitchToIoBroker;
            break;
        case Devices.HumiditySensorDeviceDefinition.deviceType:
            DeviceType = HumiditySensorToIoBroker;
            break;
        case Devices.LightSensorDeviceDefinition.deviceType:
            DeviceType = LightSensorToIoBroker;
            break;
        case Devices.OccupancySensorDeviceDefinition.deviceType:
            DeviceType = OccupancyToIoBroker;
            break;
        case Devices.OnOffLightDeviceDefinition.deviceType:
            DeviceType = OnOffLightToIoBroker;
            break;
        case Devices.OnOffPlugInUnitDeviceDefinition.deviceType:
            DeviceType = OnOffPlugInUnitToIoBroker;
            break;
        case Devices.TemperatureSensorDeviceDefinition.deviceType:
            DeviceType = TemperatureSensorToIoBroker;
            break;
        case Devices.WaterLeakDetectorDeviceDefinition.deviceType:
            DeviceType = WaterLeakDetectorToIoBroker;
            break;
        case Endpoints.ElectricalSensorEndpointDefinition.deviceType:
        case Endpoints.PowerSourceEndpointDefinition.deviceType:
        case Endpoints.BridgedNodeEndpointDefinition.deviceType:
            DeviceType = UtilityOnlyToIoBroker;
            break;
        default:
            if (utilityTypes.length === 0) {
                adapter.log.info(
                    `Node ${node.nodeId}: Unknown device type: ${mainDeviceTypeName}. We enabled exposing of the application clusters for this node if you need this device type.`,
                );
            }
            // ... but device has a utility type, so we can expose it
            DeviceType = UtilityOnlyToIoBroker;
            isSupportedDeviceType = false;
    }
    const device = new DeviceType(
        node,
        endpoint,
        rootEndpoint,
        adapter,
        fullEndpointDeviceBaseId,
        mainDeviceTypeName,
        defaultConnectionStateId,
        endpointName,
        isSupportedDeviceType,
    );
    await device.init();
    return device;
}

export default ioBrokerDeviceFabric;
