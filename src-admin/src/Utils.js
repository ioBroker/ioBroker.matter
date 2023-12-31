import { I18n } from '@iobroker/adapter-react-v5';
import ChannelDetector from '@iobroker/type-detector';

function getObjectIcon(obj, id, imagePrefix) {
    imagePrefix = imagePrefix || '.'; // http://localhost:8081';
    let src = '';
    const common = obj && obj.common;

    if (common) {
        const cIcon = common.icon;
        if (cIcon) {
            if (!cIcon.startsWith('data:image/')) {
                if (cIcon.includes('.')) {
                    let instance;
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
                    return null;
                }
            } else {
                src = cIcon;
            }
        }
    }

    return src || null;
}

let cachedObjects;

const allObjects = async socket => {
    if (cachedObjects) {
        return cachedObjects;
    }
    const states = await socket.getObjectView('', '\u9999', 'state');
    const channels = await socket.getObjectView('', '\u9999', 'channel');
    const devices = await socket.getObjectView('', '\u9999', 'device');
    const folders = await socket.getObjectView('', '\u9999', 'folder');
    const enums = await socket.getObjectView('', '\u9999', 'enum');

    cachedObjects = Object.values(states)
        .concat(Object.values(channels))
        .concat(Object.values(devices))
        .concat(Object.values(folders))
        .concat(Object.values(enums))
        // eslint-disable-next-line
        .reduce((obj, item) => (obj[item._id] = item, obj), {});

    return cachedObjects;
};

export const detectDevices = async (socket, list) => {
    const devicesObject = await allObjects(socket);
    const keys = Object.keys(devicesObject).sort();
    const detector = new ChannelDetector();

    const usedIds = [];
    const ignoreIndicators = ['UNREACH_STICKY'];    // Ignore indicators by name
    const excludedTypes = ['info'];
    const enums = [];
    const rooms = [];
    let _list = [];

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
            const members = devicesObject[id].common.members;

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

    const options = {
        objects: devicesObject,
        _keysOptional: keys,
        _usedIdsOptional: usedIds,
        ignoreIndicators,
        excludedTypes,
    };

    const result = [];

    _list.forEach(id => {
        options.id = id;

        const controls = detector.detect(options);

        if (controls) {
            controls.forEach(control => {
                const stateId = control.states.find(state => state.id).id;
                // if not yet added
                if (result.find(item => item.devices.find(st => st._id === stateId))) {
                    return;
                }
                const deviceObject = {
                    _id: stateId,
                    common: devicesObject[stateId].common,
                    type: devicesObject[stateId].type,
                    deviceType: control.type,
                    states: control.states
                        .filter(state => state.id)
                        .map(state => {
                            devicesObject[state.id].common.role = state.defaultRole;
                            return devicesObject[state.id];
                        }),
                };
                deviceObject.hasOnState = deviceObject.states.find(it => it.name === 'ON');

                const parts = stateId.split('.');
                let channelId;
                let deviceId;
                if (devicesObject[stateId].type === 'channel' || devicesObject[stateId].type === 'state') {
                    parts.pop();
                    channelId = parts.join('.');
                    if (devicesObject[channelId] && (devicesObject[channelId].type === 'channel' || devicesObject[stateId].type === 'folder')) {
                        parts.pop();
                        deviceId = parts.join('.');
                        if (!devicesObject[deviceId] || (devicesObject[deviceId].type !== 'device' && devicesObject[stateId].type !== 'folder')) {
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
                let roomObj;
                if (room) {
                    roomObj = result.find(obj => obj._id === room);
                    if (!roomObj) {
                        roomObj = {
                            _id: room,
                            common: devicesObject[room].common,
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
                if (parentObject && (parentObject.type === 'channel' || parentObject.type === 'device' || parentObject.type === 'folder')) {
                    deviceObj.common.name = parentObject.common?.name || deviceObj.common.name;
                    if (parentObject.common.icon) {
                        deviceObj.common.icon = getObjectIcon(parentObject, parentObject._id, '../..');
                    }
                    idArray.pop();
                    // read device
                    const grandParentObject = devicesObject[idArray.join('.')];
                    if (grandParentObject?.type === 'device' && grandParentObject.common?.icon) {
                        deviceObj.common.name = grandParentObject.common.name || deviceObj.common.name;
                        deviceObj.common.icon = getObjectIcon(grandParentObject, grandParentObject._id, '../..');
                    }
                } else {
                    deviceObj.common.name = parentObject?.common?.name || deviceObj.common.name;
                    if (parentObject?.common?.icon) {
                        deviceObj.common.icon = getObjectIcon(parentObject, parentObject._id, '../..');
                    }
                }
            } else {
                deviceObj.common.icon = getObjectIcon(deviceObj, deviceObj._id, '../..');
            }
        }
    }

    return result;
};

export const getText = text => (typeof text === 'object' ? (text?.[I18n.getLanguage()] || '') : (text || ''));
