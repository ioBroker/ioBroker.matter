const utils        = require('@iobroker/adapter-core'); // Get common adapter utils
//@ts-ignore
const adapterName  = require('./package.json').name.split('.').pop(); 
let adapter;

function startAdapter(options) {
    options = options || {};

    Object.assign(options, {
        name: adapterName,
        ready: () => main()
            .then(() => {})
            .catch(error => adapter.log.error(`Error in main: ${error.toString()}`)),
    });

    adapter = new utils.Adapter(options);

    return adapter;
}

async function main() {

}

// If started as allInOne mode => return function to create instance
// @ts-ignore
if (module.parent) {
    module.exports = startAdapter;
} else {
    // or start the instance directly
    startAdapter();
}
