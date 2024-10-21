import { DeviceClassification, DeviceTypeModel, MatterModel } from '@matter/main/model';
import { Endpoint } from '@project-chip/matter.js/device';

/**
 * Factory function to create an ioBroker device from a Matter device type.
 */
async function ioBrokerDeviceFabric(endpoint: Endpoint, _endpointDeviceBaseId: string): Promise<any | null> {
    // TODO!
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
    const mainDeviceType = appTypes.length > 0 ? appTypes[0] : utilityTypes[0];

    switch (mainDeviceType.deviceType.name) {
        /*        case 'OnOffLight':
            return new MappingLight(endpoint, endpointDeviceBaseId);
        case 'OnOffPlugInUnit':
            return new MappingSocket(endpoint, endpointDeviceBaseId);
        case 'DimmablePlugInUnit':
        case 'DimmableLight':
            return new MappingDimmer(endpoint, endpointDeviceBaseId);
        case 'TemperatureSensor':
            return new MappingTemperature(endpoint, endpointDeviceBaseId);
        case 'HumiditySensor':
            return new MappingHumidity(endpoint, endpointDeviceBaseId);*/
        default:
            console.log(`Unknown device type: ${mainDeviceType.deviceType.name}`);
    }

    return null;
}

export default ioBrokerDeviceFabric;
