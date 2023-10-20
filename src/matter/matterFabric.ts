import { GenericDevice } from '../lib';
import { MappingGenericDevice } from './devices/MappingGenericDevice';
import { DeviceType } from '../lib/devices/GenericDevice';

import { MappingLight } from './devices/MappingLight';
import { MappingSocket } from './devices/MappingSocket';

async function matterDeviceFabric(ioBrokerDevice: GenericDevice, name: string, uuid?: string): Promise<MappingGenericDevice | null> {
    const ioBrokerDeviceType = ioBrokerDevice.getDeviceType();
    let matterDevice: MappingGenericDevice | null = null;

    if (ioBrokerDeviceType === DeviceType.Light) {
        matterDevice = new MappingLight(ioBrokerDevice, name, uuid);
    }

    if (ioBrokerDeviceType === DeviceType.Socket) {
        matterDevice = new MappingSocket(ioBrokerDevice, name, uuid);
    }

    if (matterDevice) {
        await matterDevice.init();
        return matterDevice;
    }

    return null;
}

export default matterDeviceFabric;