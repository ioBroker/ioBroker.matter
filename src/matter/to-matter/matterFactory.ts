import { Types } from '@iobroker/type-detector';
import { GenericDevice } from '../../lib';
import { DimmerToMatter } from './DimmerToMatter';
import { GenericDeviceToMatter } from './GenericDeviceToMatter';
import { HumidityToMatter } from './HumidityToMatter';
import { LightToMatter } from './LightToMatter';
import { SocketToMatter } from './SocketToMatter';
import { TemperatureToMatter } from './TemperatureToMatter';

/**
 * Factory function to create a Matter device from an ioBroker device.
 */
async function matterDeviceFabric(
    ioBrokerDevice: GenericDevice,
    name: string,
    uuid: string,
): Promise<GenericDeviceToMatter | null> {
    const ioBrokerDeviceType = ioBrokerDevice.deviceType;

    switch (ioBrokerDeviceType) {
        case Types.light:
            return new LightToMatter(ioBrokerDevice, name, uuid);
        case Types.socket:
            return new SocketToMatter(ioBrokerDevice, name, uuid);
        case Types.dimmer:
            return new DimmerToMatter(ioBrokerDevice, name, uuid);
        case Types.temperature:
            return new TemperatureToMatter(ioBrokerDevice, name, uuid);
        case Types.humidity:
            return new HumidityToMatter(ioBrokerDevice, name, uuid);
    }

    return null;
}

export default matterDeviceFabric;
