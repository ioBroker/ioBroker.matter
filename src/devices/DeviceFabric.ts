import GenericDevice, { DetectedDevice, DeviceType } from './GenericDevice';
import Dimmer from './Dimmer';
import Light from './Light';
import Temperature from './Temperature';
import Socket from './Socket';

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