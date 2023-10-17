import {StateType} from "./devices/GenericDevice";

declare module 'iobroker.type-detector';

export interface DetectorOptions {
    objects:  Record<{[id: string]: ioBroker.Object}>; // all objects
    id: string;                    // Channel, device or state, that must be detected
    _keysOptional?: string[];      // For optimization, it is Object.keys(objects)
    _usedIdsOptional?: string[];   // For optimization, initially it is empty array
    ignoreIndicators?: string[];   // List of state names, that will be ignored. E.g., ['UNREACH_STICKY']
}

export interface DeviceState {
    id?: string;
    name: string;
    write?: boolean;
    noSubscribe?: boolean;
    type: StateType;
    indicator?: boolean;
    defaultRole: string;
    required: boolean;
}

export interface Control {
    type: string;
    states: ControlState[];
}

export interface ChannelDetectorType {
    constructor();

    detect(options: DetectorOptions): Control[] | null;
}