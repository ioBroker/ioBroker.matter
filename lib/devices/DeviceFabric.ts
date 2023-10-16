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

function DeviceFabric(device: DetectedDevice): GenericDevice | undefined {
  return types[device.type] ? new types[device.type](device) : undefined
}

export default DeviceFabric;