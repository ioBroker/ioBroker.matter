import Dimmer from "./Dimmer";
import GenericDevice, { DetectedDevice, DeviceType } from "./GenericDevice";
import Light from "./Light";
import Temperature from "./Temperature";

const types = {
    [DeviceType.Light]: Light,
    // [DeviceType.Switch]: Switch,
    [DeviceType.Temperature]: Temperature,
    [DeviceType.Dimmer]: Dimmer,
}

function DeviceFabric(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter): GenericDevice | undefined {
  return types[detectedDevice.type] ? new types[detectedDevice.type](detectedDevice, adapter) : undefined
}

export default DeviceFabric;