import GenericDevice, { DetectedDevice, DeviceType } from "./GenericDevice";
import Dimmer from "./Dimmer";
import Light from "./Light";
import Temperature from "./Temperature";

const types = {
    [DeviceType.Light]: Light,
    [DeviceType.Switch]: undefined,
    [DeviceType.Temperature]: Temperature,
    [DeviceType.Dimmer]: Dimmer,
}

function DeviceFabric(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter): GenericDevice | undefined {
    const type = types[detectedDevice.type];
    if (type) {
        return new type(detectedDevice, adapter);
    }
}

export default DeviceFabric;