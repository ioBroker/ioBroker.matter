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
import { ButtonToMatter } from './ButtonToMatter';
import { ButtonSensorToMatter } from './ButtonSensorToMatter';
import { IlluminanceToMatter } from './IlluminanceToMatter';
import { BlindsToMatter } from './BlindsToMatter';
import { ThermostatToMatter } from './ThermostatToMatter';
import { HueAndRgbToMatter } from './HueAndRgbToMatter';
import { CieToMatter } from './CieToMatter';
import { VolumeToMatter } from './VolumeToMatter';

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
        case Types.blind:
        case Types.blindButtons:
            ToMatter = BlindsToMatter;
            break;
        case Types.button:
            ToMatter = ButtonToMatter;
            break;
        case Types.buttonSensor:
            ToMatter = ButtonSensorToMatter;
            break;
        case Types.cie:
            ToMatter = CieToMatter;
            break;
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
        case Types.hue:
            ToMatter = HueAndRgbToMatter;
            break;
        case Types.humidity:
            ToMatter = HumidityToMatter;
            break;
        case Types.illuminance:
            ToMatter = IlluminanceToMatter;
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
        case Types.rgb:
        case Types.rgbSingle:
        case Types.rgbwSingle:
            ToMatter = HueAndRgbToMatter;
            break;
        case Types.socket:
            ToMatter = SocketToMatter;
            break;
        case Types.temperature:
            ToMatter = TemperatureToMatter;
            break;
        case Types.thermostat:
            ToMatter = ThermostatToMatter;
            break;
        case Types.volume:
        case Types.volumeGroup:
            ToMatter = VolumeToMatter;
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
