import type { Types } from '@iobroker/type-detector';

export interface MatterAdapterConfig extends ioBroker.AdapterConfig {
    interface: string;
    debug: boolean;
    login: string;
    pass: string;
}

export interface BridgeDeviceDescription {
    uuid: string;
    enabled: boolean;
    name: ioBroker.StringOrTranslated;
    /** Object ID */
    oid: string;
    type: Types;
    auto?: boolean;
    hasOnState?: boolean;
    noComposed?: boolean;
    dimmerOnLevel?: number;
    dimmerUseLastLevelForOn?: boolean;
    actionAllowedByIdentify?: boolean;
}

export interface BridgeDescription {
    uuid: string;
    enabled: boolean;
    productID: string;
    vendorID: string;
    passcode?: string;
    name: ioBroker.StringOrTranslated;
    deleted?: boolean;
    list: BridgeDeviceDescription[];
}

export interface DeviceDescription extends BridgeDeviceDescription {
    deleted?: boolean;
    productID?: string;
    vendorID?: string;
    passcode?: string;
}

export interface DetectedDevice {
    _id: string;
    common: ioBroker.ObjectCommon;
    type: ioBroker.ObjectType;
    deviceType: Types;
    states: ioBroker.StateObject[];
    hasOnState?: boolean;
    roomName: ioBroker.StringOrTranslated;
    vendorID?: string;
    productID?: string;
    auto?: boolean;
}

export interface DetectedRoom {
    _id: `system.room.${string}` | 'unknown';
    common: ioBroker.EnumCommon;
    devices: DetectedDevice[];
}

export interface MatterControllerConfig {
    enabled?: boolean;
    ble?: boolean;
    hciId?: string;
    wifiSSID?: string;
    wifiPassword?: string;
    threadNetworkName?: string;
    threadOperationalDataSet?: string;
}

export interface MatterConfig {
    controller: MatterControllerConfig;
    devices: DeviceDescription[];
    bridges: BridgeDescription[];
}

export type ServerAddressIp = {
    type: 'udp';
    ip: string;
    port: number;
};

export type ServerAddressBle = {
    type: 'ble';
    peripheralAddress: string;
};

export type ServerAddress = ServerAddressIp | ServerAddressBle;

export interface CommissionableDevice {
    deviceIdentifier: string;
    /** Discriminator */
    D: number;
    /** Commissioning Mode */
    CM: number;
    /** The device's addresses IP/ port pairs */
    addresses: ServerAddress[];
    /** VendorId + ProductId */
    VP?: string;
    /** Device type */
    DT?: number;
    /** Device advertising name */
    DN?: string;
    /** Rotating device identifier */
    RI?: string;
    /** Pairing hint */
    PH?: number;
    /** Pairing instructions */
    PI?: string;
    /** Sleep Idle Interval */
    SII?: number;
    /** Sleep Active Interval */
    SAI?: number;
    /** Session active threshold */
    SAT?: number;
    /** TCP supported */
    T?: number;
    /** ICD Long Idle Time operating mode supported */
    ICD?: number;
}

export enum NodeStates {
    Creating = 'creating',
    WaitingForCommissioning = 'waitingForCommissioning',
    Commissioned = 'commissioned',
    ConnectedWithController = 'connected',
}

export interface ConnectionInfo {
    vendor: string;
    connected: boolean;
    label?: string;
}

export interface NodeStateResponse {
    status: NodeStates;
    qrPairingCode?: string;
    manualPairingCode?: string;
    connectionInfo?: ConnectionInfo[];
}

export interface GUIMessage {
    command: 'bridgeStates' | 'deviceStates' | 'stopped' | 'updateStates' | 'discoveredDevice';
    states?: { [uuid: string]: NodeStateResponse };
    device?: CommissionableDevice;
}

export interface CommissioningInfo {
    bridges: Record<string, boolean>;
    devices: Record<string, boolean>;
}
