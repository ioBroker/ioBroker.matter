import { DeviceClassification, DeviceTypeModel, MatterModel, RequirementElement } from '@matter/main/model';
import type { ClassExtends, Endpoint, ClientNode } from '@matter/main';
import * as Devices from '@matter/main/devices';
import * as Endpoints from '@matter/main/endpoints';
import { DescriptorClient } from '@matter/main/behaviors';
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
import { GenericSwitchToIoBroker } from './GenericSwitchToIoBroker';
import { LightSensorToIoBroker } from './LightSensorToIoBroker';
import { ExtendedColorLightToIoBroker } from './ExtendedColorLightToIoBroker';
import { WindowCoveringToIoBroker } from './WindowCoveringToIoBroker';
import { SpeakerToIoBroker } from './SpeakerToIoBroker';
import { ThermostatToIoBroker } from './ThermostatToIoBroker';
import { SmokeCoAlarmToIoBroker } from './SmokeCoAlarmToIoBroker';
import { AirConditionerToIoBroker } from './AirConditionerToIoBroker';
import { AirPurifierToIoBroker } from './AirPurifierToIoBroker';
import { AirQualitySensorToIoBroker } from './AirQualitySensorToIoBroker';
import { FanToIoBroker } from './FanToIoBroker';
import { FlowSensorToIoBroker } from './FlowSensorToIoBroker';
import { PressureSensorToIoBroker } from './PressureSensorToIoBroker';
import { PumpToIoBroker } from './PumpToIoBroker';
import { RoboticVacuumCleanerToIoBroker } from './RoboticVacuumCleanerToIoBroker';

export function identifyDeviceTypes(endpoint: Endpoint): {
    utilityTypes: { deviceType: DeviceTypeModel; revision: number }[];
    appTypes: { deviceType: DeviceTypeModel; revision: number }[];
    primaryDeviceType?: { deviceType: DeviceTypeModel; revision: number };
} {
    const deviceTypeList: { deviceType: number; revision: number }[] =
        (endpoint as any).stateOf(DescriptorClient)?.deviceTypeList ?? [];
    const matterDeviceTypes = deviceTypeList.map(({ deviceType, revision }) => ({
        code: deviceType,
        revision,
    }));

    const utilityTypes = new Array<{ deviceType: DeviceTypeModel; revision: number }>();
    const appTypes = new Array<{ deviceType: DeviceTypeModel; revision: number }>();
    matterDeviceTypes.forEach(deviceType => {
        const deviceTypeDetails = MatterModel.standard.get(DeviceTypeModel, deviceType.code);
        if (deviceTypeDetails === undefined) {
            // Found an unknown Endpoint Device type
            return;
        }
        if (deviceTypeDetails.classification === DeviceClassification.Utility) {
            utilityTypes.push({ deviceType: deviceTypeDetails, revision: deviceType.revision });
        } else {
            appTypes.push({ deviceType: deviceTypeDetails, revision: deviceType.revision });
        }
    });
    // The deviceTypeList order is not defined by the specification, and child endpoints are only
    // traversed when BridgedNode is the primary type - so it wins over the other utility types.
    const primaryUtilityType =
        utilityTypes.find(({ deviceType }) => deviceType.id === Endpoints.BridgedNodeEndpointDefinition.deviceType) ??
        utilityTypes[0];
    const primaryDeviceType = appTypes.length > 0 ? appTypes[0] : primaryUtilityType;

    return { utilityTypes, appTypes, primaryDeviceType };
}

const mandatoryApplicationChildCache = new Map<string, boolean>();

/**
 * Whether a device type composes an application device type, so that a child endpoint of that type is a part of the
 * device instead of a device of its own.
 *
 * Utility children are excluded because power source and electrical sensor data reach ioBroker through their own paths.
 * Anything but plain mandatory conformance stays permissive, matching how unknown endpoints are treated.
 */
function declaresMandatoryApplicationChild(deviceType: DeviceTypeModel): boolean {
    const cached = mandatoryApplicationChildCache.get(deviceType.name);
    if (cached !== undefined) {
        return cached;
    }
    const base = deviceType.base;
    const declares =
        deviceType.requirements.some(requirement => {
            if (requirement.element !== RequirementElement.ElementType.DeviceType || !requirement.isMandatory) {
                return false;
            }
            const childDeviceType = MatterModel.standard.get(DeviceTypeModel, requirement.name);
            return childDeviceType !== undefined && childDeviceType.classification !== DeviceClassification.Utility;
        }) ||
        // A derived device type inherits the requirements of the type it refines.
        (base instanceof DeviceTypeModel && declaresMandatoryApplicationChild(base));
    mandatoryApplicationChildCache.set(deviceType.name, declares);
    return declares;
}

/**
 * Whether the child endpoints of an endpoint are devices in their own right, or parts the endpoint owns.
 *
 * The children of the root endpoint are walked by the caller, and an endpoint without a known device type
 * produces no objects to hang them under.
 */
export function childEndpointsAreOwnDevices(
    endpointId: number,
    { appTypes, primaryDeviceType }: ReturnType<typeof identifyDeviceTypes>,
): boolean {
    if (endpointId === 0 || primaryDeviceType === undefined) {
        return false;
    }
    if (
        primaryDeviceType.deviceType.id === Endpoints.AggregatorEndpointDefinition.deviceType ||
        primaryDeviceType.deviceType.id === Endpoints.BridgedNodeEndpointDefinition.deviceType
    ) {
        return true;
    }
    // An endpoint owns its parts only where the device type model says a part has to be there; anything a vendor
    // optionally attached - the sensors on an air purifier, say - is a device the user expects on its own.
    // The answer covers all parts of the endpoint, so an optional part of a composing type - an oven's cooktop -
    // stays with its parent, which is preferred over splitting a composed appliance apart.
    return !appTypes.some(({ deviceType }) => declaresMandatoryApplicationChild(deviceType));
}

/**
 * Factory function to create an ioBroker device from a Matter device type.
 */
async function ioBrokerDeviceFabric(
    node: ClientNode,
    endpoint: Endpoint,
    rootEndpoint: Endpoint,
    adapter: ioBroker.Adapter,
    endpointDeviceBaseId: string,
    defaultConnectionStateId: string,
    endpointName: string,
): Promise<GenericDeviceToIoBroker<any>> {
    const { primaryDeviceType, utilityTypes } = identifyDeviceTypes(endpoint);

    const nodeId = node.state.commissioning.peerAddress?.nodeId.toString() ?? node.id;
    const fullEndpointDeviceBaseId = `${adapter.namespace}.${endpointDeviceBaseId}`;
    const mainDeviceTypeName = primaryDeviceType?.deviceType.name ?? 'Unknown';
    adapter.log.info(`Node ${nodeId}: Creating device for ${mainDeviceTypeName} (endpoint ${endpoint.number})`);

    let DeviceType: ClassExtends<GenericDeviceToIoBroker<any>>;
    let isSupportedDeviceType = true;
    switch (primaryDeviceType?.deviceType.id) {
        case Devices.RoomAirConditionerDeviceDefinition.deviceType:
            DeviceType = AirConditionerToIoBroker;
            break;
        case Devices.AirPurifierDeviceDefinition.deviceType:
            DeviceType = AirPurifierToIoBroker;
            break;
        case Devices.AirQualitySensorDeviceDefinition.deviceType:
            DeviceType = AirQualitySensorToIoBroker;
            break;
        case Devices.ColorTemperatureLightDeviceDefinition.deviceType:
            //DeviceType = ColorTemperatureLightToIoBroker;
            DeviceType = ExtendedColorLightToIoBroker; // Because it could be CT and Hue it is easier top map this way
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
        case Devices.ExtendedColorLightDeviceDefinition.deviceType:
            DeviceType = ExtendedColorLightToIoBroker;
            break;
        case Devices.FanDeviceDefinition.deviceType:
            DeviceType = FanToIoBroker;
            break;
        case Devices.FlowSensorDeviceDefinition.deviceType:
            DeviceType = FlowSensorToIoBroker;
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
        case Devices.PressureSensorDeviceDefinition.deviceType:
            DeviceType = PressureSensorToIoBroker;
            break;
        case Devices.PumpDeviceDefinition.deviceType:
            DeviceType = PumpToIoBroker;
            break;
        case Devices.RoboticVacuumCleanerDeviceDefinition.deviceType:
            DeviceType = RoboticVacuumCleanerToIoBroker;
            break;
        case Devices.SmokeCoAlarmDeviceDefinition.deviceType:
            DeviceType = SmokeCoAlarmToIoBroker;
            break;
        case Devices.SpeakerDeviceDefinition.deviceType:
            DeviceType = SpeakerToIoBroker;
            break;
        case Devices.TemperatureSensorDeviceDefinition.deviceType:
            DeviceType = TemperatureSensorToIoBroker;
            break;
        case Devices.ThermostatDeviceDefinition.deviceType:
            DeviceType = ThermostatToIoBroker;
            break;
        case Devices.WaterLeakDetectorDeviceDefinition.deviceType:
            DeviceType = WaterLeakDetectorToIoBroker;
            break;
        case Devices.WindowCoveringDeviceDefinition.deviceType:
            DeviceType = WindowCoveringToIoBroker;
            break;
        case Endpoints.ElectricalSensorEndpointDefinition.deviceType:
        case Endpoints.PowerSourceEndpointDefinition.deviceType:
        case Endpoints.BridgedNodeEndpointDefinition.deviceType:
            DeviceType = UtilityOnlyToIoBroker;
            break;
        default:
            if (utilityTypes.length === 0) {
                adapter.log.info(
                    `Node ${nodeId}: Unknown device type: ${mainDeviceTypeName}. We enabled exposing of the application clusters for this node if you need this device type.`,
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
