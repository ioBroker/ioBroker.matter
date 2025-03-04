import type { Types } from '@iobroker/type-detector';

export interface MatterAdapterConfig extends ioBroker.AdapterConfig {
    interface: string;
    debug: boolean;
    login: string;
    pass: string;
    /** UUID of the default (alexa-compatible - port 5540)bridge */
    defaultBridge: string;
    controllerFabricLabel: string;
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
    name: string;
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
    noComposed?: boolean;
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
    defaultExposeMatterApplicationClusterData?: boolean;
    defaultExposeMatterSystemClusterData?: boolean;
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
    /** Vendor ID */
    V?: number;
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

export type Processing = { id: string; inProgress: boolean }[] | null;

export interface ConnectionInfo {
    vendorId: number;
    vendorName: string;
    connected: boolean;
    label?: string;
}

export interface NodeStateResponse {
    status: NodeStates;
    error?: boolean | string[];
    qrPairingCode?: string;
    manualPairingCode?: string;
    connectionInfo?: ConnectionInfo[];
}

export interface GUIMessage {
    command:
        | 'bridgeStates'
        | 'deviceStates'
        | 'stopped'
        | 'updateStates'
        | 'discoveredDevice'
        | 'reconnect'
        | 'progress'
        | 'processing'
        | 'identifyPopup'
        | 'updateController';
    states?: { [uuid: string]: NodeStateResponse };
    device?: CommissionableDevice;
    processing?: { id: string; inProgress: boolean }[] | null;

    /** Used for identify popup */
    identifyUuid?: string;
    /** Used for identify popup. How long to blink */
    identifySeconds?: number;

    progress?: {
        close?: boolean;
        title?: string;
        text?: string;
        indeterminate?: boolean;
        value?: number;
    };
}

export interface CommissioningInfo {
    bridges: Record<string, boolean>;
    devices: Record<string, boolean>;
}
