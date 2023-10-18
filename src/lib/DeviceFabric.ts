import GenericDevice, { DetectedDevice, DeviceType } from './devices/GenericDevice';
import Dimmer from './devices/Dimmer';
import Light from './devices/Light';
import Temperature from './devices/Temperature';
import Socket from './devices/Socket';

const types = {
    [DeviceType.Light]: Light,
    [DeviceType.Switch]: Socket,
    [DeviceType.Temperature]: Temperature,
    [DeviceType.Dimmer]: Dimmer,
};

async function DeviceFabric(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter): Promise<GenericDevice | undefined> {
    const type = types[detectedDevice.type];
    if (type) {
        const deviceObject = new type(detectedDevice, adapter);
        await deviceObject.init();
        return deviceObject;
    }
}

export default DeviceFabric;