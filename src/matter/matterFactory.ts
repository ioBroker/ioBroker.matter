import { GenericDevice } from '../lib';
import { MappingGenericDevice } from './devices/MappingGenericDevice';
import { Types } from '@iobroker/type-detector';

import { MappingLight } from './devices/MappingLight';
import { MappingSocket } from './devices/MappingSocket';
import { MappingDimmer } from './devices/MappingDimmer';

async function matterDeviceFabric(ioBrokerDevice: GenericDevice, name: string, uuid?: string): Promise<MappingGenericDevice | null> {
    const ioBrokerDeviceType = ioBrokerDevice.getDeviceType();
    let matterDevice: MappingGenericDevice | null = null;

    if (ioBrokerDeviceType === Types.light) {
        matterDevice = new MappingLight(ioBrokerDevice, name, uuid);
    }

    if (ioBrokerDeviceType === Types.socket) {
        matterDevice = new MappingSocket(ioBrokerDevice, name, uuid);
    }

    if (ioBrokerDeviceType === Types.dimmer) {
        matterDevice = new MappingDimmer(ioBrokerDevice, name, uuid);
    }

    if (matterDevice) {
        await matterDevice.init();
        return matterDevice;
    }

    return null;
}

export default matterDeviceFabric;