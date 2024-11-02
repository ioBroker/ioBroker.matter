import { NodeId } from '@matter/main';
import { DeviceClassification, DeviceTypeModel, MatterModel } from '@matter/main/model';
import { Endpoint } from '@project-chip/matter.js/device';
import { DimmerToIobroker } from './DimmerToIobroker';
import { GenericDeviceToIoBroker } from './GenericDeviceToIoBroker';
import { HumidityToIoBroker } from './HumidityToIoBroker';
import { LightToIoBroker } from './LightToIoBroker';
import { LockToIoBroker } from './LockToIoBroker';
import { SocketToIoBroker } from './SocketToIoBroker';
import { TemperatureToIoBroker } from './TemperatureToIoBroker';
import { UtilityOnlyToIoBroker } from './UtilityOnlyToIoBroker';

/**
 * Factory function to create an ioBroker device from a Matter device type.
 */
async function ioBrokerDeviceFabric(
    nodeId: NodeId,
    endpoint: Endpoint,
    rootEndpoint: Endpoint,
    adapter: ioBroker.Adapter,
    endpointDeviceBaseId: string,
): Promise<any | null> {
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

    const fullEndpointDeviceBaseId = `${adapter.namespace}.${endpointDeviceBaseId}`;
    adapter.log.info(`Node ${nodeId}: Creating device for ${mainDeviceType.deviceType.name}`);
    let device: GenericDeviceToIoBroker;
    switch (mainDeviceType.deviceType.name) {
        case 'PowerSource':
        case 'ElectricalSensor':
            device = new UtilityOnlyToIoBroker(endpoint, rootEndpoint, adapter, fullEndpointDeviceBaseId);
            break;
        case 'OnOffLight':
            device = new LightToIoBroker(endpoint, rootEndpoint, adapter, fullEndpointDeviceBaseId);
            break;
        case 'OnOffPlugInUnit':
            device = new SocketToIoBroker(endpoint, rootEndpoint, adapter, fullEndpointDeviceBaseId);
            break;
        case 'DimmablePlugInUnit':
        case 'DimmableLight':
            device = new DimmerToIobroker(endpoint, rootEndpoint, adapter, fullEndpointDeviceBaseId);
            break;
        case 'TemperatureSensor':
            device = new TemperatureToIoBroker(endpoint, rootEndpoint, adapter, fullEndpointDeviceBaseId);
            break;
        case 'HumiditySensor':
            device = new HumidityToIoBroker(endpoint, rootEndpoint, adapter, fullEndpointDeviceBaseId);
            break;
        case 'DoorLock':
            device = new LockToIoBroker(endpoint, rootEndpoint, adapter, fullEndpointDeviceBaseId);
            break;
        default:
            adapter.log.info(
                `Node ${nodeId}: Unknown device type: ${mainDeviceType.deviceType.name}. Please enable the exposing of application clusters for this node if you need this device type.`,
            );
            return null;
    }
    await device.init();
    return device;
}

export default ioBrokerDeviceFabric;
