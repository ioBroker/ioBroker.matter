const ChannelDetectorImport = require('@iobroker/type-detector');
const Types = ChannelDetectorImport.Types;
const SubscribeManager = require('../build/lib/SubscribeManager');
const { StateAccessType } = require('../build/lib/devices/GenericDevice');
const { ValueType } = require('../build/lib/devices/DeviceStateObject');

// create a maximal set of states
const detectedDevices = {
    states: [
        { name: 'SET', id: '0_userdata.0.set' },
        { name: 'ACTUAL', id: '0_userdata.0.actual' },
        { name: 'POWER', id: '0_userdata.0.power', type: 'boolean' },
        { name: 'HUMIDITY', id: '0_userdata.0.humidity' },
        { name: 'SPEED', id: '0_userdata.0.speed' },
        { name: 'BOOST', id: '0_userdata.0.boost', type: 'boolean' },
        { name: 'MODE', id: '0_userdata.0.mode' },

        { name: 'SWING', id: '0_userdata.0.swing', type: 'boolean' },
        { name: 'STOP', id: '0_userdata.0.stop', type: 'boolean' },
        { name: 'OPEN', id: '0_userdata.0.open', type: 'boolean' },
        { name: 'CLOSE', id: '0_userdata.0.close', type: 'boolean' },
        { name: 'TILT_SET', id: '0_userdata.0.tilt_set' },
        { name: 'TILT_ACTUAL', id: '0_userdata.0.tilt_actual' },
        { name: 'TILT_STOP', id: '0_userdata.0.tilt_stop', type: 'boolean' },
        { name: 'TILT_OPEN', id: '0_userdata.0.tilt_open', type: 'boolean' },
        { name: 'TILT_CLOSE', id: '0_userdata.0.tilt_close', type: 'boolean' },

        { name: 'PRESS', id: '0_userdata.0.press', type: 'boolean' },
        { name: 'PRESS_LONG', id: '0_userdata.0.press_long', type: 'boolean' },

        { name: 'FILE', id: '0_userdata.0.file' },
        { name: 'AUTOFOCUS', id: '0_userdata.0.autofocus', type: 'boolean' },
        { name: 'AUTOWHITEBALANCE', id: '0_userdata.0.autowhiteballance', type: 'boolean' },
        { name: 'BRIGHTNESS', id: '0_userdata.0.brightness' },
        { name: 'NIGHTMODE', id: '0_userdata.0.nightmode', type: 'boolean' },
        { name: 'PTZ', id: '0_userdata.0.ptz', type: 'boolean' },

        { name: 'URL', id: '0_userdata.0.url', type: 'string' },

        { name: 'ON_SET', id: '0_userdata.0.on_set', type: 'boolean' },
        { name: 'ON', id: '0_userdata.0.on', type: 'boolean' },
        { name: 'ON_ACTUAL', id: '0_userdata.0.on_actual', type: 'boolean' },

        { name: 'ELECTRIC_POWER', id: '0_userdata.0.electric_power' },
        { name: 'CURRENT', id: '0_userdata.0.current' },
        { name: 'VOLTAGE', id: '0_userdata.0.voltage' },
        { name: 'CONSUMPTION', id: '0_userdata.0.consumption' },
        { name: 'FREQUENCY', id: '0_userdata.0.frequency' },

        { name: 'LONGITUDE', id: '0_userdata.0.LONGITUDE' },
        { name: 'LATITUDE', id: '0_userdata.0.LATITUDE' },
        { name: 'ELEVATION', id: '0_userdata.0.ELEVATION' },
        { name: 'RADIUS', id: '0_userdata.0.RADIUS' },
        { name: 'ACCURACY', id: '0_userdata.0.ACCURACY' },

        { name: 'STATE', id: '0_userdata.0.STATE.state' },
        { name: 'PLAY', id: '0_userdata.0.PLAY.play', type: 'boolean' },
        { name: 'PAUSE', id: '0_userdata.0.PAUSE', type: 'boolean' },
        { name: 'STOP', id: '0_userdata.0.STOP', type: 'boolean' },
        { name: 'NEXT', id: '0_userdata.0.NEXT', type: 'boolean' },
        { name: 'PREV', id: '0_userdata.0.PREV', type: 'boolean' },
        { name: 'SHUFFLE', id: '0_userdata.0.SHUFFLE', type: 'boolean' },
        { name: 'REPEAT', id: '0_userdata.0.REPEAT', type: 'boolean' },
        { name: 'ARTIST', id: '0_userdata.0.ARTIST', type: 'string' },
        { name: 'ALBUM', id: '0_userdata.0.ALBUM' },
        { name: 'TITLE', id: '0_userdata.0.TITLE' },
        { name: 'COVER', id: '0_userdata.0.COVER' },
        { name: 'DURATION', id: '0_userdata.0.DURATION' },
        { name: 'ELAPSED', id: '0_userdata.0.ELAPSED' },
        { name: 'SEEK', id: '0_userdata.0.SEEK' },
        { name: 'TRACK', id: '0_userdata.0.TRACK' },
        { name: 'EPISODE', id: '0_userdata.0.EPISODE' },
        { name: 'SEASON', id: '0_userdata.0.SEASON' },
        { name: 'VOLUME', id: '0_userdata.0.VOLUME' },
        { name: 'VOLUME_ACTUAL', id: '0_userdata.0.VOLUME_ACTUAL' },
        { name: 'MUTE', id: '0_userdata.0.MUTE' },
        { name: 'CONNECTED', id: '0_userdata.0.CONNECTED' },

        { name: 'MAP_BASE64', id: '0_userdata.0.MAP_BASE64' },
        { name: 'MAP_URL', id: '0_userdata.0.MAP_URL' },
        { name: 'WORK_MODE', id: '0_userdata.0.WORK_MODE' },
        { name: 'WATER', id: '0_userdata.0.WATER' },
        { name: 'WASTE', id: '0_userdata.0.WASTE' },
        { name: 'BATTERY', id: '0_userdata.0.BATTERY' },
        { name: 'STATE', id: '0_userdata.0.STATE' },
        { name: 'PAUSE', id: '0_userdata.0.PAUSE' },
        { name: 'WASTE_ALARM', id: '0_userdata.0.WASTE_ALARM' },
        { name: 'WATER_ALARM', id: '0_userdata.0.WATER_ALARM' },
        { name: 'FILTER', id: '0_userdata.0.FILTER' },
        { name: 'BRUSH', id: '0_userdata.0.BRUSH' },
        { name: 'SENSORS', id: '0_userdata.0.SENSORS' },
        { name: 'SIDE_BRUSH', id: '0_userdata.0.SIDE_BRUSH' },

        { name: 'TITLE', id: '0_userdata.0.TITLE' },
        { name: 'INFO', id: '0_userdata.0.INFO' },
        { name: 'START', id: '0_userdata.0.START' },
        { name: 'END', id: '0_userdata.0.END' },
        { name: 'ICON', id: '0_userdata.0.ICON' },
        { name: 'DESC', id: '0_userdata.0.DESC' },

        { name: 'ICON', id: '0_userdata.0.ICON' },
        { name: 'PRECIPITATION_CHANCE', id: '0_userdata.0.PRECIPITATION_CHANCE' },
        { name: 'PRECIPITATION_TYPE', id: '0_userdata.0.PRECIPITATION_TYPE' },
        { name: 'PRESSURE', id: '0_userdata.0.PRESSURE' },
        { name: 'PRESSURE_TENDENCY', id: '0_userdata.0.PRESSURE_TENDENCY' },
        { name: 'REAL_FEEL_TEMPERATURE', id: '0_userdata.0.REAL_FEEL_TEMPERATURE' },
        { name: 'HUMIDITY', id: '0_userdata.0.HUMIDITY' },
        { name: 'UV', id: '0_userdata.0.UV' },
        { name: 'WEATHER', id: '0_userdata.0.WEATHER' },
        { name: 'WIND_DIRECTION', id: '0_userdata.0.WIND_DIRECTION' },
        { name: 'WIND_GUST', id: '0_userdata.0.WIND_GUST' },
        { name: 'WIND_SPEED', id: '0_userdata.0.WIND_SPEED' },

        { name: 'TEMP_MIN', id: '0_userdata.0.TEMP_MIN' },
        { name: 'TEMP_MAX', id: '0_userdata.0.TEMP_MAX' },
        { name: 'DATE', id: '0_userdata.0.DATE' },
        { name: 'DOW', id: '0_userdata.0.DOW' },
        { name: 'TEMP', id: '0_userdata.0.TEMP' },
        { name: 'PRESSURE', id: '0_userdata.0.PRESSURE' },
        { name: 'HUMIDITY', id: '0_userdata.0.HUMIDITY' },
        { name: 'TIME_SUNRISE', id: '0_userdata.0.TIME_SUNRISE' },
        { name: 'TIME_SUNSET', id: '0_userdata.0.TIME_SUNSET' },
        { name: 'WIND_CHILL', id: '0_userdata.0.WIND_CHILL' },
        { name: 'FEELS_LIKE', id: '0_userdata.0.FEELS_LIKE' },
        { name: 'WIND_SPEED', id: '0_userdata.0.WIND_SPEED' },
        { name: 'WIND_DIRECTION', id: '0_userdata.0.WIND_DIRECTION' },
        { name: 'WIND_DIRECTION_STR', id: '0_userdata.0.WIND_DIRECTION_STR' },
        { name: 'WIND_ICON', id: '0_userdata.0.WIND_ICON' },
        { name: 'HISTORY_CHART', id: '0_userdata.0.HISTORY_CHART' },
        { name: 'FORECAST_CHART', id: '0_userdata.0.FORECAST_CHART' },
        { name: 'PRECIPITATION', id: '0_userdata.0.PRECIPITATION' },
        { name: 'PRECIPITATION', id: '0_userdata.0.PRECIPITATION' },

        { name: 'SECOND', id: '0_userdata.0.secondary' },

        { name: 'PARTY', id: '0_userdata.0.party' },

        { name: 'RED', id: '0_userdata.0.RED' },
        { name: 'GREEN', id: '0_userdata.0.GREEN' },
        { name: 'BLUE', id: '0_userdata.0.BLUE' },
        { name: 'WHITE', id: '0_userdata.0.WHITE' },
        { name: 'RGB', id: '0_userdata.0.RGB' },
        { name: 'RGBW', id: '0_userdata.0.RGBW' },
        { name: 'HUE', id: '0_userdata.0.HUE' },
        { name: 'CIE', id: '0_userdata.0.CIE' },

        { name: 'DIMMER', id: '0_userdata.0.dimmer' },
        { name: 'BRIGHTNESS', id: '0_userdata.0.brightness' },
        { name: 'SATURATION', id: '0_userdata.0.saturation' },
        { name: 'TEMPERATURE', id: '0_userdata.0.temperature' },

        { name: 'LEVEL', id: '0_userdata.0.level' },

        { name: 'ERROR', id: '0_userdata.0.error' },
        { name: 'MAINTAIN', id: '0_userdata.0.maintain' },
        { name: 'UNREACH', id: '0_userdata.0.unreach' },
        { name: 'LOWBAT', id: '0_userdata.0.lowbat' },
        { name: 'WORKING', id: '0_userdata.0.working' },
        { name: 'DIRECTION', id: '0_userdata.0.direction' },
    ],
    type: 'abstract',
};

class Adapter {
    constructor() {
        this.log = {
            debug: console.log,
            info: console.log,
            warn: console.log,
            error: console.log,
        };
        this.subscribed = [];
        this.states = [];
        this.namespace = 'matter.0';
    }

    setSubscribeManager(subscribeManager) {
        this.subscribeManager = subscribeManager;
    }

    async getForeignObjectAsync(id) {
        const entry = detectedDevices.states.find(state => state.id === id);
        if (entry && (entry.type === 'boolean' || entry.type === 'string')) {
            return {
                _id: id,
                common: {
                    type: entry.type,
                },
            };
        }
        return {
            _id: id,
            common: {
                min: -100,
                max: 200,
                unit: '°C',
                type: 'number',
            },
        };
    }

    async setForeignStateAsync(id, value) {
        this.states[id] = this.states[id] || {};
        this.states[id].ts = Date.now();
        this.states[id].val = value;
        this.states[id].ack = true; // Just simulate as if the state was acked directly
        if (this.subscribed.includes(id) && this.subscribeManager) {
            setTimeout(() => {
                this.subscribeManager.observer(id, { ...this.states[id] });
            }, 0);
        }
    }

    async getForeignStateAsync(id) {
        if (!this.states[id]) {
            const entry = detectedDevices.states.find(state => state.id === id);
            if (entry && entry.val !== undefined) {
                this.states[id] = { ts: Date.now(), val: entry.val, ack: true };
            } else {
                this.states[id] = { ts: Date.now(), val: null, ack: true };
            }
        }
        return this.states[id];
    }

    async unsubscribeForeignStatesAsync(id) {
        // console.log('Unsubscribe', id);
        const pos = this.subscribed.indexOf(id);
        if (pos !== -1) {
            this.subscribed.splice(pos, 1);
        }
    }

    async subscribeForeignStatesAsync(id) {
        console.log('Subscribe', id);
        this.subscribed.push(id);
    }

    getSubscribed() {
        return this.subscribed;
    }
}

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
            // detect that only read values are subscribed
            console.log(`------------------------\nCreated device for ${type}`);
            const Device = require(`../build/lib/devices/${type[0].toUpperCase() + type.substring(1)}`);
            const adapter = new Adapter();
            SubscribeManager.default.setAdapter(adapter);
            adapter.setSubscribeManager(SubscribeManager.default);
            detectedDevices.type = type;

            const deviceObj = new Device.default(detectedDevices, adapter, { enabled: true });
            await deviceObj.init();

            const properties = deviceObj.getProperties();
            const possibleProperties = deviceObj.getPossibleProperties();
            const subscribed = adapter.getSubscribed();
            const props = Object.keys(properties);
            for (const prop of props) {
                if (
                    properties[prop].accessType === StateAccessType.Read ||
                    properties[prop].accessType === StateAccessType.ReadWrite
                ) {
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

                if (
                    properties[prop].accessType === StateAccessType.Write ||
                    properties[prop].accessType === StateAccessType.ReadWrite
                ) {
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
                if (
                    properties[prop].accessType === StateAccessType.Read ||
                    properties[prop].accessType === StateAccessType.ReadWrite
                ) {
                    // Try to read value
                    if (deviceObj.getPropertyValue(prop) === undefined) {
                        throw new Error(`Property "${prop}" of "${type}" has no value`);
                    }
                }
                if (properties[prop].accessType === StateAccessType.Write) {
                    let value;
                    if (
                        properties[prop].valueType === ValueType.Boolean ||
                        properties[prop].valueType === ValueType.Button
                    ) {
                        value = true;
                    } else if (properties[prop].valueType === ValueType.Enum) {
                        value = 1;
                    } else if (properties[prop].valueType === ValueType.String) {
                        value = prop;
                    } else {
                        value = 50;
                    }
                    // Try to write value
                    console.log(`Write ${prop} with ${value}`);
                    await deviceObj.setPropertyValue(prop, value);
                } else if (properties[prop].accessType === StateAccessType.ReadWrite) {
                    // subscribe on changes and try to read value
                    setTimeout(async () => {
                        let value;
                        if (
                            properties[prop].valueType === ValueType.Boolean ||
                            properties[prop].valueType === ValueType.Button
                        ) {
                            value = true;
                        } else if (properties[prop].valueType === ValueType.Enum) {
                            value = 1;
                        } else if (properties[prop].valueType === ValueType.String) {
                            value = prop;
                        } else {
                            value = 50;
                        }
                        console.log(`Write ${prop} with ${value}`);
                        await deviceObj.setPropertyValue(prop, value);
                        if (properties[prop].read !== properties[prop].write) {
                            console.log(`Write read value of ${prop} with ${value}`);
                            await adapter.setForeignStateAsync(properties[prop].read, value, true);
                        }
                    }, 0);

                    await new Promise(resolve => {
                        const handler = event => {
                            console.log(`Detected change of ${event.property} to ${event.value}`);
                            deviceObj.offChange(handler);
                            resolve();
                        };
                        deviceObj.onChange(handler);
                    });
                }
            }
            if (Object.keys(possibleProperties).length) {
                throw new Error(
                    `Device "${type}" has not all properties detected: ${Object.keys(possibleProperties).join(', ')}`,
                );
            }

            await deviceObj.destroy();
            if (adapter.getSubscribed().length) {
                throw new Error(`Device "${type}" was not unsubscribed`);
            }
        }
    }).timeout(50000);

    it('Test min/max - negative', async function () {
        const Device = require(`../build/lib/devices/Thermostat`);
        const adapter = new Adapter();
        SubscribeManager.default.setAdapter(adapter);
        adapter.setSubscribeManager(SubscribeManager.default);
        detectedDevices.type = 'thermostat';

        const deviceObj = new Device.default(detectedDevices, adapter, { enabled: true });
        await deviceObj.init();

        const properties = deviceObj.getProperties();

        // subscribe on changes and try to read value
        await deviceObj.setPropertyValue('level', 30);
        const ioBrokerValue = await adapter.getForeignStateAsync(properties.level.read);
        await new Promise(resolve =>
            setTimeout(() => {
                const deviceValue = deviceObj.getPropertyValue('level');
                if (ioBrokerValue.val !== deviceValue) {
                    throw new Error(
                        `Value of ${properties.level.read} is ${ioBrokerValue.val}, but should be ${deviceValue}`,
                    );
                }
                resolve();
            }, 100),
        );
        await deviceObj.destroy();
    }).timeout(2000);

    it('Test min/max - positive, readId=writeId', async function () {
        const Device = require(`../build/lib/devices/Slider`);
        const adapter = new Adapter();
        SubscribeManager.default.setAdapter(adapter);
        adapter.setSubscribeManager(SubscribeManager.default);
        const _detectedDevices = {
            states: [{ name: 'SET', id: '0_userdata.0.set' }],
            type: 'slider',
        };

        const deviceObj = new Device.default(_detectedDevices, adapter, { enabled: true });
        await deviceObj.init();

        const properties = deviceObj.getProperties();

        // subscribe on changes and try to read value
        await deviceObj.setPropertyValue('level', 30);
        const ioBrokerValue = await adapter.getForeignStateAsync(properties.level.read);
        await new Promise(resolve =>
            setTimeout(() => {
                const deviceValue = deviceObj.getPropertyValue('level');
                if (deviceValue !== 30) {
                    throw new Error(`Value of ${properties.level.read} is ${ioBrokerValue.val}, but should be 30`);
                }
                if (ioBrokerValue.val !== -10) {
                    throw new Error(`Value of ${properties.level.read} is ${ioBrokerValue.val}, but should be -10`);
                }
                resolve();
            }, 100),
        );

        await deviceObj.destroy();
    }).timeout(2000);

    it('Test min/max - positive, readId!=writeId', async function () {
        const Device = require(`../build/lib/devices/Slider`);
        const adapter = new Adapter();
        SubscribeManager.default.setAdapter(adapter);
        adapter.setSubscribeManager(SubscribeManager.default);
        const _detectedDevices = {
            states: [
                { name: 'SET', id: '0_userdata.0.set' },
                { name: 'ACTUAL', id: '0_userdata.0.actual' },
            ],
            type: 'slider',
        };

        const deviceObj = new Device.default(_detectedDevices, adapter, { enabled: true });
        await deviceObj.init();

        const properties = deviceObj.getProperties();

        // subscribe on changes and try to read value
        await deviceObj.setPropertyValue('level', 75);

        // write value to ACTUAL
        const ioBrokerValue = await adapter.getForeignStateAsync(properties.level.write);
        await adapter.setForeignStateAsync(properties.level.read, ioBrokerValue.val, true);

        await new Promise(resolve =>
            setTimeout(() => {
                const deviceValue = deviceObj.getPropertyValue('level');
                if (deviceValue !== 75) {
                    throw new Error(`Value of ${properties.level.read} is ${ioBrokerValue.val}, but should be 75`);
                }
                if (ioBrokerValue.val !== 125) {
                    throw new Error(`Value of ${properties.level.read} is ${ioBrokerValue.val}, but should be 125`);
                }
                resolve();
            }, 100),
        );

        await deviceObj.destroy();
    }).timeout(20000);
});
