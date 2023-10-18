const { Types } = require('iobroker.type-detector');
const SubscribeManager = require('../build/lib/SubscribeManager');
const { StateAccessType } = require('../build/lib/devices/GenericDevice');

class Adapter {
    constructor() {
        this.log = {
            debug: console.log,
            info: console.log,
            warn: console.log,
            error: console.log,
        };
        this.subscribed = [];
    }

    async getObjectAsync(id) {

    }

    async setStateAsync(id, value) {

    }

    async unsubscribeForeignStatesAsync(id) {
        console.log('Unsubscribe', id);
        const pos = this.subscribed.indexOf(id);
        if (pos !== -1) {
            this.subscribed.splice(pos, 1);
        }

    }

    async subscribeForeignStatesAsync(id) {
        console.log('Subscribe', id);
        this.subscribed.push(id);
    }

    isSubscribed(id) {
        return this.subscribed.includes(id);
    }

    getSubscribed() {
        return this.subscribed;
    }
}

// create a maximal set of states
const detectedDevices = {
    states: [
        { name: 'SET', id: '0_userdata.0.set' },
        { name: 'ACTUAL', id: '0_userdata.0.actual' },
        { name: 'POWER', id: '0_userdata.0.power' },
        { name: 'HUMIDITY', id: '0_userdata.0.humidity' },
        { name: 'SPEED', id: '0_userdata.0.speed' },
        { name: 'BOOST', id: '0_userdata.0.boost' },
        { name: 'MODE', id: '0_userdata.0.mode' },


        { name: 'ERROR', id: '0_userdata.0.error' },
        { name: 'MAINTAIN', id: '0_userdata.0.maintain' },
        { name: 'UNREACH', id: '0_userdata.0.unreach' },
        { name: 'LOWBAT', id: '0_userdata.0.lowbat' },
        { name: 'WORKING', id: '0_userdata.0.working' },
        { name: 'DIRECTION', id: '0_userdata.0.direction' },
    ],
    type: 'abstract',
};

describe('Test Devices', function () {
    // const devices = fs.readdirSync(`${__dirname}/build/lib/devices`).filter(file => file.endsWith('.js') && file !== 'GenericDevice.js');
    // for (const device of devices) {
    //     it(`Test ${device.replace('.js', '')}`, function () {
    //          const Device = require(`../build/lib/devices/${device}`);
    //          const adapter = new Adapter();
    //          const deviceObj = new Device(adapter);
    //     });
    // }
    it('Test that all devices are existing', async function () {
        const types = Object.keys(Types).filter(type => type !== 'unknown' && type !== 'instance' && type !== 'valve');
        for (const type of types) {
            const Device = require(`../build/lib/devices/${type[0].toUpperCase() + type.substring(1)}`);
            const adapter = new Adapter();
            SubscribeManager.default.setAdapter(adapter);
            detectedDevices.type = type;

            const deviceObj = new Device.default(detectedDevices, adapter);
            await deviceObj.init();
            const properties = deviceObj.getProperties();
            let subscribed = adapter.getSubscribed();
            Object.keys(properties).forEach(prop => {
                if (properties[prop].accessType === StateAccessType.Read || properties[prop].accessType === StateAccessType.ReadWrite) {
                    // check that read properties are subscribed
                    if (!subscribed.includes(properties[prop].read)) {
                        throw new Error(`Property "${prop}" of "${type}" was not subscribed, but it is readable`);
                    }
                } else if (properties[prop].accessType === StateAccessType.Write) {
                    // check that write only properties are not subscribed
                    if (subscribed.includes(properties[prop].read)) {
                        throw new Error(`Property "${prop}" of "${type}" was subscribed, but it is only writable`);
                    }
                }

                if (properties[prop].accessType === StateAccessType.Write || properties[prop].accessType === StateAccessType.ReadWrite) {
                    // check setter
                    if (!deviceObj[`set${prop[0].toUpperCase()}${prop.substring(1)}`]) {
                        throw new Error(`Property "${prop}" of "${type}" has no setter`);
                    }
                    if (properties[prop].accessType === StateAccessType.Write) {
                        if (deviceObj[`get${prop[0].toUpperCase()}${prop.substring(1)}`]) {
                            throw new Error(`Property "${prop}" of "${type}" has getter`);
                        }
                    }
                } else if (properties[prop].accessType === StateAccessType.Write) {
                    // check getter
                    if (!deviceObj[`set${prop[0].toUpperCase()}${prop.substring(1)}`]) {
                        throw new Error(`Property "${prop}" of "${type}" has no setter`);
                    }
                    if (deviceObj[`get${prop[0].toUpperCase()}${prop.substring(1)}`]) {
                        throw new Error(`Property "${prop}" of "${type}" has getter`);
                    }
                }
            });
            await deviceObj.destroy();
            subscribed = adapter.getSubscribed();
            if (subscribed.length) {
                throw new Error(`Device "${type}" was not unsubscribed`);
            }

            // detect that only read values are subscribed
            console.log(`Created device for ${type}`);
        }
    });
});