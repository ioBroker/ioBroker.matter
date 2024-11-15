import { Types } from '@iobroker/type-detector';
import type { GenericDevice } from '../../lib';
import { DimmerToMatter } from './DimmerToMatter';
import { DoorToMatter } from './DoorToMatter';
import { FloodAlarmToMatter } from './FloodAlarmToMatter';
import type { GenericDeviceToMatter } from './GenericDeviceToMatter';
import { HumidityToMatter } from './HumidityToMatter';
import { LightToMatter } from './LightToMatter';
import { LockToMatter } from './LockToMatter';
import { MotionToMatter } from './MotionToMatter';
import { SocketToMatter } from './SocketToMatter';
import { TemperatureToMatter } from './TemperatureToMatter';
import { WindowToMatter } from './WindowToMatter';

/**
 * Factory function to create a Matter device from an ioBroker device.
 */
function matterDeviceFabric(
    ioBrokerDevice: GenericDevice,
    name: string,
    uuid: string,
): Promise<GenericDeviceToMatter | null> {
    const ioBrokerDeviceType = ioBrokerDevice.deviceType;

    switch (ioBrokerDeviceType) {
        case Types.dimmer:
            return Promise.resolve(new DimmerToMatter(ioBrokerDevice, name, uuid));
        case Types.door:
            return Promise.resolve(new DoorToMatter(ioBrokerDevice, name, uuid));
        case Types.floodAlarm:
            return Promise.resolve(new FloodAlarmToMatter(ioBrokerDevice, name, uuid));
        case Types.humidity:
            return Promise.resolve(new HumidityToMatter(ioBrokerDevice, name, uuid));
        case Types.light:
            return Promise.resolve(new LightToMatter(ioBrokerDevice, name, uuid));
        case Types.lock:
            return Promise.resolve(new LockToMatter(ioBrokerDevice, name, uuid));
        case Types.motion:
            return Promise.resolve(new MotionToMatter(ioBrokerDevice, name, uuid));
        case Types.socket:
            return Promise.resolve(new SocketToMatter(ioBrokerDevice, name, uuid));
        case Types.temperature:
            return Promise.resolve(new TemperatureToMatter(ioBrokerDevice, name, uuid));
        case Types.window:
            return Promise.resolve(new WindowToMatter(ioBrokerDevice, name, uuid));
    }

    return Promise.resolve(null);
}

export default matterDeviceFabric;
