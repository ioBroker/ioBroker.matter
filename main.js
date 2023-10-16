const utils = require('@iobroker/adapter-core') // Get common adapter utils
const { default: SubscribeManager } = require('./lib/devices/dist/SubscribeManager')
// @ts-expect-error
const adapterName = require('./package.json').name.split('.').pop()
let adapter

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

    _devices.forEach(device => {
        if (!Object.keys(deviceObjects).includes(device)) {
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
                loadDevices();
                adapter.subscribeForeignObjectsAsync('matter.0.*');
                adapter.subscribeForeignStatesAsync('matter.0.*');
            })
            .catch(error => adapter.log.error(`Error in main: ${error.toString()}`)),
        stateChange: (id, state) => {
            SubscribeManager.setAdapter(adapter);
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
