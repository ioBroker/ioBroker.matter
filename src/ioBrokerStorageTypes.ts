export interface MatterAdapterConfig extends ioBroker.AdapterConfig {
    interface: string;
}

export interface DeviceDescription {
    uuid: string;
    name: string;
    oid: string;
    type: string;
    enabled: boolean;
}

export interface BridgeDescription {
    uuid: string;
    enabled: boolean;
    productID: string;
    vendorID: string;
    passcode: string;
    name: string;
    list: DeviceDescription[];
}