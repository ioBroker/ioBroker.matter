export interface MatterAdapterConfig extends ioBroker.AdapterConfig {
    interface: string;
    debug: boolean;
    login: string;
    pass: string;
}

export interface BridgeDeviceDescription {
    uuid: string;
    enabled: boolean;
    name: string;
    oid: string;
    type: string;
    auto: boolean;
}

export interface BridgeDescription {
    uuid: string;
    enabled: boolean;
    productID: string;
    vendorID: string;
    passcode: string;
    name: string;
    list: BridgeDeviceDescription[];
}

export interface DeviceDescription extends BridgeDeviceDescription {
    productID: string;
    vendorID: string;
    passcode: string;
}
