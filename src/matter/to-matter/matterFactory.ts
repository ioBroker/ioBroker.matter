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
function matterDeviceFabric(ioBrokerDevice: GenericDevice, name: string, uuid: string): GenericDeviceToMatter | null {
    const ioBrokerDeviceType = ioBrokerDevice.deviceType;

    switch (ioBrokerDeviceType) {
        case Types.dimmer:
            return new DimmerToMatter(ioBrokerDevice, name, uuid);
        case Types.door:
            return new DoorToMatter(ioBrokerDevice, name, uuid);
        case Types.floodAlarm:
            return new FloodAlarmToMatter(ioBrokerDevice, name, uuid);
        case Types.humidity:
            return new HumidityToMatter(ioBrokerDevice, name, uuid);
        case Types.light:
            return new LightToMatter(ioBrokerDevice, name, uuid);
        case Types.lock:
            return new LockToMatter(ioBrokerDevice, name, uuid);
        case Types.motion:
            return new MotionToMatter(ioBrokerDevice, name, uuid);
        case Types.socket:
            return new SocketToMatter(ioBrokerDevice, name, uuid);
        case Types.temperature:
            return new TemperatureToMatter(ioBrokerDevice, name, uuid);
        case Types.window:
            return new WindowToMatter(ioBrokerDevice, name, uuid);
    }

    return null;
}

export default matterDeviceFabric;
