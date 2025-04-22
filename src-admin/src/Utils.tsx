import { I18n, type AdminConnection } from '@iobroker/adapter-react-v5';
import ChannelDetector, { Types, type DetectOptions } from '@iobroker/type-detector';

import type { DetectedDevice, DetectedRoom } from './types';
import { VendorIds } from './utils/vendorIDs';

function getObjectIcon(
    obj: ioBroker.Object | DetectedDevice,
    id: string,
    imagePrefix: string,
    lang: ioBroker.Languages,
): string | undefined {
    imagePrefix = imagePrefix || '.'; // http://localhost:8081';
    let src = '';
    const common: ioBroker.ObjectCommon | undefined = obj?.common;

    if (common) {
        const cIcon = common.icon;
        if (cIcon) {
            if (!cIcon.startsWith('data:image/')) {
                if (cIcon.includes('.')) {
                    let instance: string[];
                    if (obj.type === 'instance' || obj.type === 'adapter') {
                        let name: string;
                        if (typeof common.name === 'object') {
                            name = common.name[lang] || common.name.en;
                        } else {
                            name = common.name;
                        }

                        src = `${imagePrefix}/adapter/${name}/${cIcon}`;
                    } else if (id && id.startsWith('system.adapter.')) {
                        instance = id.split('.', 3);
                        if (cIcon[0] === '/') {
                            instance[2] += cIcon;
                        } else {
                            instance[2] += `/${cIcon}`;
                        }
                        src = `${imagePrefix}/adapter/${instance[2]}`;
                    } else {
                        instance = id.split('.', 2);
                        if (cIcon[0] === '/') {
                            instance[0] += cIcon;
                        } else {
                            instance[0] += `/${cIcon}`;
                        }
                        src = `${imagePrefix}/adapter/${instance[0]}`;
                    }
                } else {
                    return undefined;
                }
            } else {
                src = cIcon;
            }
        }
    }

    return src || undefined;
}

let cachedObjects: Record<string, ioBroker.Object> | null = null;

async function allObjects(socket: AdminConnection): Promise<Record<string, ioBroker.Object>> {
    if (cachedObjects) {
        return cachedObjects;
    }
    const states = await socket.getObjectViewSystem('state', '', '\u9999');
    const channels = await socket.getObjectViewSystem('channel', '', '\u9999');
    const devices = await socket.getObjectViewSystem('device', '', '\u9999');
    const folders = await socket.getObjectViewSystem('folder', '', '\u9999');
    const enums = await socket.getObjectViewSystem('enum', '', '\u9999');

    cachedObjects = {};

    if (states) {
        for (const id in states) {
            if (states[id]) {
                cachedObjects[id] = states[id];
            }
        }
    }
    if (channels) {
        for (const id in channels) {
            if (channels[id]) {
                cachedObjects[id] = channels[id];
            }
        }
    }
    if (devices) {
        for (const id in devices) {
            if (devices[id]) {
                cachedObjects[id] = devices[id];
            }
        }
    }
    if (folders) {
        for (const id in folders) {
            if (folders[id]) {
                cachedObjects[id] = folders[id];
            }
        }
    }
    if (enums) {
        for (const id in enums) {
            if (enums[id]) {
                cachedObjects[id] = enums[id];
            }
        }
    }

    return cachedObjects;
}

export async function detectDevices(
    socket: AdminConnection,
    lang: ioBroker.Languages,
    allowedTypes?: Types[],
    list?: string[],
): Promise<DetectedRoom[]> {
    const devicesObject = await allObjects(socket);
    const keys = Object.keys(devicesObject).sort();
    const detector = new ChannelDetector();

    const usedIds: string[] = [];
    const ignoreIndicators = ['UNREACH_STICKY']; // Ignore indicators by name
    const excludedTypes: Types[] = [Types.info];
    const enums: string[] = [];
    const rooms: string[] = [];

    if (!list) {
        list = [];
        for (const id of keys) {
            if (devicesObject[id]?.type === 'enum') {
                enums.push(id);
            } else if (devicesObject[id]?.common?.smartName) {
                list.push(id);
            }
        }

        for (const id of enums) {
            if (id.startsWith('enum.rooms.')) {
                rooms.push(id);
            }
            const members: string[] = devicesObject[id].common.members;

            if (members?.length) {
                for (const member of members) {
                    // if an object really exists
                    if (devicesObject[member]) {
                        if (!list.includes(member)) {
                            list.push(member);
                        }
                    }
                }
            }
        }
    }

    // We have a list ob  IDs with "point" separated IDs that build up a tree
    // We sort them in a way that IDs are sorted by levels - so IDs with less points are first
    // This way we can start detecting from the bottom of the tree
    list = list.sort((a, b) => a.split('.').length - b.split('.').length);

    const detectOnSingleObject = list?.length === 1;
    const options: DetectOptions = {
        id: '',
        objects: devicesObject,
        _keysOptional: keys,
        _usedIdsOptional: usedIds,
        ignoreIndicators,
        allowedTypes,
        excludedTypes,
        // When we only detect for a single object then we try to find anything and ignore enums
        detectAllPossibleDevices: detectOnSingleObject,
        ignoreEnums: detectOnSingleObject,
    };

    const result: DetectedRoom[] = [];

    for (const id of list) {
        options.id = id;

        const controls = detector.detect(options);

        if (controls) {
            for (const control of controls) {
                const stateIdObj = control?.states?.find(state => state.id);
                if (!stateIdObj) {
                    continue;
                }
                const stateId = stateIdObj.id;
                // if not yet added
                if (!detectOnSingleObject && result.find(item => item.devices.find(st => st._id === stateId))) {
                    continue;
                }
                const deviceObject: DetectedDevice = {
                    _id: stateId,
                    common: devicesObject[stateId].common,
                    type: devicesObject[stateId].type,
                    deviceType: control.type,
                    states: control.states
                        .filter(state => state.id)
                        .map(state => {
                            devicesObject[state.id].common.role = state.defaultRole;
                            devicesObject[state.id].native = devicesObject[state.id].native || {};
                            devicesObject[state.id].native.__detectedName = state.name;
                            return devicesObject[state.id] as ioBroker.StateObject;
                        }),
                    roomName: '',
                };
                deviceObject.hasOnState = !!deviceObject.states.find(it => it.native.__detectedName === 'ON');

                const parts = stateId.split('.');
                let channelId: string | null = null;
                let deviceId: string | null = null;
                if (devicesObject[stateId].type === 'channel' || devicesObject[stateId].type === 'state') {
                    parts.pop();
                    channelId = parts.join('.');
                    if (devicesObject[channelId] && devicesObject[channelId].type === 'channel') {
                        parts.pop();
                        deviceId = parts.join('.');
                        if (!devicesObject[deviceId] || devicesObject[deviceId].type !== 'device') {
                            deviceId = null;
                        }
                    } else {
                        channelId = null;
                    }
                }
                // try to detect room
                const room = rooms.find(roomId => {
                    if (devicesObject[roomId].common.members.includes(stateId)) {
                        return true;
                    }
                    if (channelId && devicesObject[roomId].common.members.includes(channelId)) {
                        return true;
                    }
                    return deviceId && devicesObject[roomId].common.members.includes(deviceId);
                });

                let roomObj: DetectedRoom | undefined;
                if (room) {
                    roomObj = result.find(obj => obj._id === room);
                    if (!roomObj) {
                        roomObj = {
                            _id: room as `system.room.${string}`,
                            common: devicesObject[room].common as ioBroker.EnumCommon,
                            devices: [],
                        };
                        result.push(roomObj);
                    }
                } else {
                    roomObj = result.find(obj => obj._id === 'unknown');
                    if (!roomObj) {
                        roomObj = {
                            _id: 'unknown',
                            common: {
                                name: 'unknown',
                                icon: '?',
                            },
                            devices: [],
                        };
                        result.push(roomObj);
                    }
                }
                deviceObject.roomName = roomObj.common.name;
                roomObj.devices.push(deviceObject);
            }
        }
    }

    // find names and icons for devices
    result.forEach(room => {
        room.devices.forEach(dev => {
            const deviceObj = dev;
            if (deviceObj.type === 'state' || deviceObj.type === 'channel') {
                const idArray = deviceObj._id.split('.');
                idArray.pop();

                // read channel
                const parentObject = devicesObject[idArray.join('.')];
                if (
                    parentObject &&
                    (parentObject.type === 'channel' ||
                        parentObject.type === 'device' ||
                        parentObject.type === 'folder')
                ) {
                    deviceObj.common.name = parentObject.common?.name || deviceObj.common.name;
                    if (parentObject.common.icon) {
                        deviceObj.common.icon = getObjectIcon(parentObject, parentObject._id, '../..', lang);
                    }
                    idArray.pop();
                    // read device
                    const grandParentObject = devicesObject[idArray.join('.')];
                    if (grandParentObject?.type === 'device' && grandParentObject.common?.icon) {
                        deviceObj.common.name = grandParentObject.common.name || deviceObj.common.name;
                        deviceObj.common.icon = getObjectIcon(grandParentObject, grandParentObject._id, '../..', lang);
                    }
                } else {
                    deviceObj.common.name = parentObject?.common?.name || deviceObj.common.name;
                    if (parentObject?.common?.icon) {
                        deviceObj.common.icon = getObjectIcon(parentObject, parentObject._id, '../..', lang);
                    }
                }
            } else {
                deviceObj.common.icon = getObjectIcon(deviceObj, deviceObj._id, '../..', lang);
            }
        });
    });

    return result;
}

export function getDetectedDeviceTypes(detectedRooms: DetectedRoom[]): Types[] {
    const result: Types[] = [];
    detectedRooms.forEach(room => {
        room.devices.forEach(device => {
            if (!result.includes(device.deviceType)) {
                result.push(device.deviceType);
            }
        });
    });
    return result;
}

/**
 * Get text from an object or just a string without trying to translate it
 */
export function getText(text?: ioBroker.StringOrTranslated): string {
    return typeof text === 'object' ? text?.[I18n.getLanguage()] || '' : text || '';
}

/**
 * Get Translation and try to translate given string
 */
export function getTranslation(
    /** Text to translate */
    text: ioBroker.StringOrTranslated,
    noTranslation?: boolean,
): string {
    if (typeof text === 'object') {
        return text[I18n.getLanguage()] || text.en;
    }

    return noTranslation ? text : I18n.t(text);
}

/**
 * Clone an object
 *
 * @param obj the object to clone
 */
export function clone<TObject extends Record<string, any>>(obj: TObject): TObject {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Format a pairing code like 1234-567-8911
 *
 * @param pairingCode the pairing code
 */
export function formatPairingCode(pairingCode: string): string {
    return `${pairingCode.substring(0, 4)}-${pairingCode.substring(4, 7)}-${pairingCode.substring(7)}`;
}

/**
 * Get the vendor name by ID
 *
 * @param vendorId the vendor ID
 */
export function getVendorName(vendorId?: number): string {
    if (vendorId === undefined) {
        return '-';
    }

    return VendorIds[vendorId] || `0x${vendorId.toString(16)}`;
}
