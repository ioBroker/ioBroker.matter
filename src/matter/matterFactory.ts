import { Types } from '@iobroker/type-detector';
import { GenericDevice } from '../lib';
import { MappingGenericDevice } from './devices/MappingGenericDevice';

import { MappingDimmer } from './devices/MappingDimmer';
import { MappingLight } from './devices/MappingLight';
import { MappingSocket } from './devices/MappingSocket';

async function matterDeviceFabric(
    ioBrokerDevice: GenericDevice,
    name: string,
    uuid?: string,
): Promise<MappingGenericDevice | null> {
    const ioBrokerDeviceType = ioBrokerDevice.getDeviceType();

    switch (ioBrokerDeviceType) {
        case Types.light:
            return new MappingLight(ioBrokerDevice, name, uuid);
        case Types.socket:
            return new MappingSocket(ioBrokerDevice, name, uuid);
        case Types.dimmer:
            return new MappingDimmer(ioBrokerDevice, name, uuid);
    }

    return null;
}

export default matterDeviceFabric;
