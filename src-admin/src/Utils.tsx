import { AdminConnection, I18n } from '@iobroker/adapter-react-v5';
import ChannelDetector, { DetectOptions, Types } from '@iobroker/type-detector';
import { DetectedDevice, DetectedRoom } from './types';

function getObjectIcon(
    obj: ioBroker.Object | DetectedDevice,
    id: string,
    imagePrefix?: string,
): string | undefined {
    imagePrefix = imagePrefix || '.'; // http://localhost:8081';
    let src = '';
    const common: ioBroker.ObjectCommon = obj?.common;

    if (common) {
        const cIcon = common.icon;
        if (cIcon) {
            if (!cIcon.startsWith('data:image/')) {
                if (cIcon.includes('.')) {
                    let instance: string[];
                    if (obj.type === 'instance' || obj.type === 'adapter') {
                        src = `${imagePrefix}/adapter/${common.name}/${cIcon}`;
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

async function allObjects(
    socket: AdminConnection,
): Promise<Record<string, ioBroker.Object>> {
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
    list?: string[],
): Promise<DetectedRoom[]> {
    const devicesObject = await allObjects(socket);
    const keys: string[] = Object.keys(devicesObject).sort();
    const detector = new ChannelDetector();

    const usedIds: string[] = [];
    const ignoreIndicators = ['UNREACH_STICKY']; // Ignore indicators by name
    const excludedTypes: Types[] = [Types.info];
    const enums: string[] = [];
    const rooms: string[] = [];
    let _list: string[] = [];

    if (!list) {
        keys.forEach(id => {
            if (devicesObject[id]?.type === 'enum') {
                enums.push(id);
            } else if (devicesObject[id]?.common?.smartName) {
                _list.push(id);
            }
        });

        enums.forEach(id => {
            if (id.startsWith('enum.rooms.')) {
                rooms.push(id);
            }
            const members: string[] = devicesObject[id].common.members;

            if (members && members.length) {
                members.forEach(member => {
                    // if an object really exists
                    if (devicesObject[member]) {
                        if (!_list.includes(member)) {
                            _list.push(member);
                        }
                    }
                });
            }
        });
    } else {
        _list = list;
    }

    const options: DetectOptions = {
        id: '',
        objects: devicesObject,
        _keysOptional: keys,
        _usedIdsOptional: usedIds,
        ignoreIndicators,
        excludedTypes,
    };

    const result: DetectedRoom[] = [];

    _list.forEach(id => {
        options.id = id;

        const controls = detector.detect(options);

        if (controls) {
            controls.forEach(control => {
                const stateIdObj = control?.states?.find(state => state.id);
                if (!stateIdObj) {
                    return;
                }
                const stateId = stateIdObj.id;
                // if not yet added
                if (
                    result.find(item => item.devices.find(st => st._id === stateId))
                ) {
                    return;
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
                            devicesObject[state.id].native =
                devicesObject[state.id].native || {};
                            devicesObject[state.id].native.__detectedName = state.name;
                            return devicesObject[state.id] as ioBroker.StateObject;
                        }),
                    roomName: '',
                };
                deviceObject.hasOnState = !!deviceObject.states.find(
                    it => it.native.__detectedName === 'ON',
                );

                const parts = stateId.split('.');
                let channelId: string | null = null;
                let deviceId: string | null = null;
                if (
                    devicesObject[stateId].type === 'channel' ||
          devicesObject[stateId].type === 'state'
                ) {
                    parts.pop();
                    channelId = parts.join('.');
                    if (
                        devicesObject[channelId] &&
            (devicesObject[channelId].type === 'channel' ||
              devicesObject[stateId].type === 'folder')
                    ) {
                        parts.pop();
                        deviceId = parts.join('.');
                        if (
                            !devicesObject[deviceId] ||
              (devicesObject[deviceId].type !== 'device' &&
                devicesObject[stateId].type !== 'folder')
                        ) {
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
                    if (
                        channelId &&
            devicesObject[roomId].common.members.includes(channelId)
                    ) {
                        return true;
                    }
                    return (
                        deviceId && devicesObject[roomId].common.members.includes(deviceId)
                    );
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
            });
        }
    });

    // find names and icons for devices
    for (const k in result) {
        for (const k2 in result[k].devices) {
            const deviceObj = result[k].devices[k2];
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
                    deviceObj.common.name =
            parentObject.common?.name || deviceObj.common.name;
                    if (parentObject.common.icon) {
                        deviceObj.common.icon = getObjectIcon(
                            parentObject,
                            parentObject._id,
                            '../..',
                        );
                    }
                    idArray.pop();
                    // read device
                    const grandParentObject = devicesObject[idArray.join('.')];
                    if (
                        grandParentObject?.type === 'device' &&
            grandParentObject.common?.icon
                    ) {
                        deviceObj.common.name =
              grandParentObject.common.name || deviceObj.common.name;
                        deviceObj.common.icon = getObjectIcon(
                            grandParentObject,
                            grandParentObject._id,
                            '../..',
                        );
                    }
                } else {
                    deviceObj.common.name =
            parentObject?.common?.name || deviceObj.common.name;
                    if (parentObject?.common?.icon) {
                        deviceObj.common.icon = getObjectIcon(
                            parentObject,
                            parentObject._id,
                            '../..',
                        );
                    }
                }
            } else {
                deviceObj.common.icon = getObjectIcon(
                    deviceObj,
                    deviceObj._id,
                    '../..',
                );
            }
        }
    }

    return result;
}

export function getText(text: ioBroker.StringOrTranslated): string {
    return typeof text === 'object'
        ? text?.[I18n.getLanguage()] || ''
        : text || '';
}
