const utils = require('@iobroker/adapter-core') // Get common adapter utils
// const { default: SubscribeManager } = require('./lib/devices/dist/SubscribeManager')
const { SubscribeManager, DeviceFabric } = require('./lib/devices')
// @ts-expect-error
const adapterName = require('./package.json').name.split('.').pop()
let adapter

async function findDeviceFromId(id) {
    let obj = await adapter.getForeignObjectAsync(id);
    if (obj && obj.type === 'device') {
        return id;
    }
    const parts = id.split('.');
    if (obj && obj.type === 'state') {
        // we can go maximal three levels up: state => channel => device
        parts.pop();
        const channelId= parts.join('.');
        obj = await adapter.getForeignObjectAsync(channelId);
        if (obj && obj.type === 'device') {
            return channelId;
        }
        if (obj && obj.type === 'channel') {
            parts.pop();
            const deviceId = parts.join('.');
            obj = await adapter.getForeignObjectAsync(deviceId);
            if (obj && obj.type === 'device') {
                return deviceId;
            }

            return channelId;
        }
        return id;
    } else if (obj.type === 'channel') {
        // we can go maximal two levels up: channel => device
        parts.pop();
        obj = await adapter.getForeignObjectAsync(parts.join('.'));
        if (obj && obj.type === 'device') {
            return parts.join('.');
        }

        return id;
    }

    return id;
}

async function getDeviceStates(id) {
    const deviceId = await findDeviceFromId(id);
    const obj = await adapter.getForeignObjectAsync(deviceId);
    const states = await adapter.getObjectViewAsync('system', 'state', {startkey: `${deviceId}.`, endkey: `${deviceId}.\u9999`});
    const objects = {[obj._id]: obj};
    for (const state of states.rows) {
        objects[state.id] = state.value;
    }

    const { ChannelDetector } = require('iobroker.type-detector');
    const detector = new ChannelDetector();
    const keys = Object.keys(objects);        // For optimization
    const usedIds = [];                       // To not allow using of same ID in more than one device
    const ignoreIndicators = ['UNREACH_STICKY'];    // Ignore indicators by name
    const options = {
        objects,
        id:                 deviceId, // Channel, device or state, that must be detected
        _keysOptional:      keys,
        _usedIdsOptional:   usedIds,
        ignoreIndicators
    };
    const controls = detector.detect(options);
    if (controls) {
        const id = controls[0].states.find(state => state.id).id;
        if (id) {
            // console.log(`In ${options.id} was detected "${controls[0].type}" with following states:`);
            controls[0].states = controls[0].states.filter(state => state.id);

            return controls[0];
        }
    } else {
        console.log(`Nothing found for ${options.id}`);
    }

    return null;
}

const deviceObjects = {};

async function loadDevices() {
    const _devices = [];
    const objects = await adapter.getObjectViewAsync(
        'system', 'channel', 
        {startkey: `${adapter.namespace}.`, endkey: `${adapter.namespace}.\u9999`}
    );

    objects.rows.forEach(object => {
        if (object.id.startsWith(`${adapter.namespace}.devices.`)) {
            _devices.push(object.value.native.oid);
        } else if (object.id.startsWith(`${adapter.namespace}.bridges.`)) {
            object.value.native.list.forEach(device => {
                _devices.push(device.oid);
            });
        }
    })

    _devices.forEach(async device => {
        if (!Object.keys(deviceObjects).includes(device)) {
            console.log (DeviceFabric(await getDeviceStates(device), adapter));
            deviceObjects[device] = device;
        }
    });

    Object.keys(deviceObjects).forEach(device => {
        if (!_devices.includes(device)) {
            delete deviceObjects[device];
        }
    });
}

function startAdapter (options) {
    options = options || {}

    Object.assign(options, {
        name: adapterName,
        ready: async () => await main()
            .then(() => {
                SubscribeManager.setAdapter(adapter);
                loadDevices();
                adapter.subscribeForeignObjectsAsync('matter.0.*');
                adapter.subscribeForeignStatesAsync('matter.0.*');
            })
            .catch(error => adapter.log.error(`Error in main: ${error.toString()}`)),
        stateChange: (id, state) => {
            SubscribeManager.observer(id, state);
        },
        objectChange: (id, obj) => {
            console.log(id, obj);
        }
    })

    adapter = new utils.Adapter(options)

    return adapter
}

async function main () {

}

// If started as allInOne mode => return function to create instance
// @ts-expect-error
if (module.parent) {
    module.exports = startAdapter
} else {
    // or start the instance directly
    startAdapter()
}
