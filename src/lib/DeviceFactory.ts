import { Types } from '@iobroker/type-detector';
import GenericDevice, { DetectedDevice, DeviceOptions } from './devices/GenericDevice';

import AirCondition from './devices/AirCondition';
import Blind from './devices/Blind';
import BlindButtons from './devices/BlindButtons';
import Button from './devices/Button';
import ButtonSensor from './devices/ButtonSensor';
import Camera from './devices/Camera';
import Chart from './devices/Chart';
import Cie from './devices/Cie';
import Ct from './devices/Ct';
import Dimmer from './devices/Dimmer';
import Door from './devices/Door';
import FireAlarm from './devices/FireAlarm';
import FloodAlarm from './devices/FloodAlarm';
import Gate from './devices/Gate';
import Hue from './devices/Hue';
import Humidity from './devices/Humidity';
import Image from './devices/Image';
import Info from './devices/Info';
import Light from './devices/Light';
import Location from './devices/Location';
import Lock from './devices/Lock';
import Media from './devices/Media';
import Motion from './devices/Motion';
import Rgb from './devices/Rgb';
import RgbSingle from './devices/RgbSingle';
import RgbwSingle from './devices/RgbwSingle';
import Slider from './devices/Slider';
import Socket from './devices/Socket';
import Temperature from './devices/Temperature';
import Thermostat from './devices/Thermostat';
import VacuumCleaner from './devices/VacuumCleaner';
import Volume from './devices/Volume';
import VolumeGroup from './devices/VolumeGroup';
import Warning from './devices/Warning';
import WeatherCurrent from './devices/WeatherCurrent';
import WeatherForecast from './devices/WeatherForecast';
import Window from './devices/Window';
import WindowTilt from './devices/WindowTilt';

/** Type for a class that extends a defined class to make TS understand that also derived classes are allowed. */
type ClassExtends<C> = { new (...args: any[]): C };

const types: { [key in Types]: ClassExtends<GenericDevice> | null } = {
    [Types.airCondition]: AirCondition,
    [Types.blind]: Blind,
    [Types.blindButtons]: BlindButtons,
    [Types.button]: Button,
    [Types.buttonSensor]: ButtonSensor,
    [Types.camera]: Camera,
    [Types.image]: Image,
    [Types.chart]: Chart,
    [Types.dimmer]: Dimmer,
    [Types.door]: Door,
    [Types.fireAlarm]: FireAlarm,
    [Types.floodAlarm]: FloodAlarm,
    [Types.gate]: Gate,
    [Types.humidity]: Humidity,
    [Types.info]: Info,
    [Types.instance]: null,
    [Types.light]: Light,
    [Types.lock]: Lock,
    [Types.location]: Location,
    [Types.media]: Media,
    [Types.motion]: Motion,
    [Types.rgb]: Rgb,
    [Types.ct]: Ct,
    [Types.rgbSingle]: RgbSingle,
    [Types.rgbwSingle]: RgbwSingle,
    [Types.hue]: Hue,
    [Types.cie]: Cie,
    [Types.slider]: Slider,
    [Types.socket]: Socket,
    [Types.temperature]: Temperature,
    [Types.thermostat]: Thermostat,
    [Types.volume]: Volume,
    [Types.vacuumCleaner]: VacuumCleaner,
    [Types.volumeGroup]: VolumeGroup,
    [Types.window]: Window,
    [Types.unknown]: null,
    [Types.windowTilt]: WindowTilt,
    [Types.weatherCurrent]: WeatherCurrent,
    [Types.weatherForecast]: WeatherForecast,
    [Types.warning]: Warning,
};

/**
 * Factory method for an ioBroker Device object that abstracts all states of a Device defined by Type Detector.
 */
async function DeviceFactory(
    detectedDevice: DetectedDevice,
    adapter: ioBroker.Adapter,
    options: DeviceOptions,
): Promise<GenericDevice> {
    const DeviceType = types[detectedDevice.type];
    if (!DeviceType) {
        throw new Error(`No class found for device type ${detectedDevice.type}.`);
    }
    const deviceObject = new DeviceType(detectedDevice, adapter, options);
    await deviceObject.init();
    return deviceObject;
}

export default DeviceFactory;
