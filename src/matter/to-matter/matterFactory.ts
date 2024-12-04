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
import { CtToMatter } from './CtToMatter';
import type { ClassExtends } from '@matter/main';

/**
 * Factory function to create a Matter device from an ioBroker device.
 */
async function matterDeviceFabric(
    ioBrokerDevice: GenericDevice,
    name: string,
    uuid: string,
): Promise<GenericDeviceToMatter | null> {
    const ioBrokerDeviceType = ioBrokerDevice.deviceType;

    let ToMatter: ClassExtends<GenericDeviceToMatter>;

    switch (ioBrokerDeviceType) {
        case Types.ct:
            ToMatter = CtToMatter;
            break;
        case Types.dimmer:
            ToMatter = DimmerToMatter;
            break;
        case Types.door:
            ToMatter = DoorToMatter;
            break;
        case Types.floodAlarm:
            ToMatter = FloodAlarmToMatter;
            break;
        case Types.humidity:
            ToMatter = HumidityToMatter;
            break;
        case Types.light:
            ToMatter = LightToMatter;
            break;
        case Types.lock:
            ToMatter = LockToMatter;
            break;
        case Types.motion:
            ToMatter = MotionToMatter;
            break;
        case Types.socket:
            ToMatter = SocketToMatter;
            break;
        case Types.temperature:
            ToMatter = TemperatureToMatter;
            break;
        case Types.window:
            ToMatter = WindowToMatter;
            break;
        default:
            return null;
    }

    await ioBrokerDevice.init();
    return new ToMatter(ioBrokerDevice, name, uuid);
}

export default matterDeviceFabric;
