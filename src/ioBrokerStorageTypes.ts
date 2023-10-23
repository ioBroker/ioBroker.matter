export interface MatterAdapterConfig extends ioBroker.AdapterConfig {
    interface: string;
    login: string;
    pass: string;
}

export interface BridgeDeviceDescription {
    uuid: string;
    enabled: boolean;
    name: string;
    oid: string;
    type: string;
    auto: string;
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

export interface DeviceDescription {
    uuid: string;
    enabled: boolean;
    productID: string;
    vendorID: string;
    passcode: string;
    name: string;
    oid: string;
    type: string;
    auto: string;
}