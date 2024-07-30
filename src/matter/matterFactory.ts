import { Types } from '@iobroker/type-detector';
import { GenericDevice } from '../lib';
import { MappingGenericDevice } from './devices/MappingGenericDevice';

import { MappingDimmer } from './devices/MappingDimmer';
import { MappingHumidity } from './devices/MappingHumidity';
import { MappingLight } from './devices/MappingLight';
import { MappingSocket } from './devices/MappingSocket';
import { MappingTemperature } from './devices/MappingTemperature';

/**
 * Factory function to create a Matter device from an ioBroker device.
 */
async function matterDeviceFabric(
    ioBrokerDevice: GenericDevice,
    name: string,
    uuid: string,
): Promise<MappingGenericDevice | null> {
    const ioBrokerDeviceType = ioBrokerDevice.deviceType;

    switch (ioBrokerDeviceType) {
        case Types.light:
            return new MappingLight(ioBrokerDevice, name, uuid);
        case Types.socket:
            return new MappingSocket(ioBrokerDevice, name, uuid);
        case Types.dimmer:
            return new MappingDimmer(ioBrokerDevice, name, uuid);
        case Types.temperature:
            return new MappingTemperature(ioBrokerDevice, name, uuid);
        case Types.humidity:
            return new MappingHumidity(ioBrokerDevice, name, uuid);
    }

    return null;
}

export default matterDeviceFabric;
