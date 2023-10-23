import GenericDevice, { DetectedDevice, DeviceOptions, DeviceType } from './devices/GenericDevice';

import AirCondition from './devices/AirCondition';
import Blind from './devices/Blind';
import BlindButtons from './devices/BlindButtons';
import Button from './devices/Button';
import ButtonSensor from './devices/ButtonSensor';
import Camera from './devices/Camera';
import Image from './devices/Image';
import Chart from './devices/Chart';
import Dimmer from './devices/Dimmer';
import Door from './devices/Door';
import FireAlarm from './devices/FireAlarm';
import FloodAlarm from './devices/FloodAlarm';
import Gate from './devices/Gate';
import Humidity from './devices/Humidity';
import Info from './devices/Info';
import Light from './devices/Light';
import Lock from './devices/Lock';
import Location from './devices/Location';
import Media from './devices/Media';
import Motion from './devices/Motion';
import Rgb from './devices/Rgb';
import Ct from './devices/Ct';
import RgbSingle from './devices/RgbSingle';
import RgbwSingle from './devices/RgbwSingle';
import Hue from './devices/Hue';
import Cie from './devices/Cie';
import Slider from './devices/Slider';
import Socket from './devices/Socket';
import Temperature from './devices/Temperature';
import Thermostat from './devices/Thermostat';
import Volume from './devices/Volume';
import VacuumCleaner from './devices/VacuumCleaner';
import VolumeGroup from './devices/VolumeGroup';
import Window from './devices/Window';
import WindowTilt from './devices/WindowTilt';
import WeatherCurrent from './devices/WeatherCurrent';
import WeatherForecast from './devices/WeatherForecast';
import Warning from './devices/Warning';

const types = {
    [DeviceType.AirCondition]: AirCondition,
    [DeviceType.Blind]: Blind,
    [DeviceType.BlindButtons]: BlindButtons,
    [DeviceType.Button]: Button,
    [DeviceType.ButtonSensor]: ButtonSensor,
    [DeviceType.Camera]: Camera,
    [DeviceType.Url]: Image,
    [DeviceType.Chart]: Chart,
    [DeviceType.Image]: Image,
    [DeviceType.Dimmer]: Dimmer,
    [DeviceType.Door]: Door,
    [DeviceType.FireAlarm]: FireAlarm,
    [DeviceType.FloodAlarm]: FloodAlarm,
    [DeviceType.Gate]: Gate,
    [DeviceType.Humidity]: Humidity,
    [DeviceType.Info]: Info,
    [DeviceType.Light]: Light,
    [DeviceType.Lock]: Lock,
    [DeviceType.Location]: Location,
    [DeviceType.Media]: Media,
    [DeviceType.Motion]: Motion,
    [DeviceType.Rgb]: Rgb,
    [DeviceType.Ct]: Ct,
    [DeviceType.RgbSingle]: RgbSingle,
    [DeviceType.RgbwSingle]: RgbwSingle,
    [DeviceType.Hue]: Hue,
    [DeviceType.Cie]: Cie,
    [DeviceType.Slider]: Slider,
    [DeviceType.Socket]: Socket,
    [DeviceType.Temperature]: Temperature,
    [DeviceType.Thermostat]: Thermostat,
    [DeviceType.Volume]: Volume,
    [DeviceType.VacuumCleaner]: VacuumCleaner,
    [DeviceType.VolumeGroup]: VolumeGroup,
    [DeviceType.Window]: Window,
    [DeviceType.WindowTilt]: WindowTilt,
    [DeviceType.WeatherCurrent]: WeatherCurrent,
    [DeviceType.WeatherForecast]: WeatherForecast,
    [DeviceType.Warning]: Warning,
};

async function deviceFabric(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options: DeviceOptions): Promise<GenericDevice | undefined> {
    const type = types[detectedDevice.type];
    if (type) {
        const deviceObject = new type(detectedDevice, adapter, options);
        await deviceObject.init();
        return deviceObject;
    }
}

export default deviceFabric;