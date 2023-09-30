const utils = require('@iobroker/adapter-core') // Get common adapter utils
const { default: SubscribeManager } = require('./lib/devices/SubscribeManager')
// @ts-expect-error
const adapterName = require('./package.json').name.split('.').pop()
let adapter

function startAdapter (options) {
    options = options || {}

    Object.assign(options, {
        name: adapterName,
        ready: async () => await main()
            .then(() => {})
            .catch(error => adapter.log.error(`Error in main: ${error.toString()}`)),
        stateChange: (id, state) => {
            SubscribeManager.setAdapter(adapter);
            SubscribeManager.observer(id, state);
        },
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
