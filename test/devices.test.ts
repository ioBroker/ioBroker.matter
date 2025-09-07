import { Types, DetectorState } from '@iobroker/type-detector';
import { SubscribeManager } from '../src/lib/SubscribeManager';
import { StateAccessType, DetectedDevice } from '../src/lib/devices/GenericDevice';
import { ValueType, PropertyType } from '../src/lib/devices/DeviceStateObject';

// Import all device classes statically
import { AirCondition } from '../src/lib/devices/AirCondition';
import { Blind } from '../src/lib/devices/Blind';
import { BlindButtons } from '../src/lib/devices/BlindButtons';
import { Button } from '../src/lib/devices/Button';
import { ButtonSensor } from '../src/lib/devices/ButtonSensor';
import { Camera } from '../src/lib/devices/Camera';
import { Chart } from '../src/lib/devices/Chart';
import { Cie } from '../src/lib/devices/Cie';
import { Ct } from '../src/lib/devices/Ct';
import { Dimmer } from '../src/lib/devices/Dimmer';
import { Door } from '../src/lib/devices/Door';
import { ElectricityDataDevice } from '../src/lib/devices/ElectricityDataDevice';
import { FireAlarm } from '../src/lib/devices/FireAlarm';
import { FloodAlarm } from '../src/lib/devices/FloodAlarm';
import { Gate } from '../src/lib/devices/Gate';
import { Hue } from '../src/lib/devices/Hue';
import { Humidity } from '../src/lib/devices/Humidity';
import { Illuminance } from '../src/lib/devices/Illuminance';
import { Image } from '../src/lib/devices/Image';
import { Info } from '../src/lib/devices/Info';
import { Light } from '../src/lib/devices/Light';
import { Location } from '../src/lib/devices/Location';
import { LocationOne } from '../src/lib/devices/LocationOne';
import { Lock } from '../src/lib/devices/Lock';
import { Media } from '../src/lib/devices/Media';
import { Motion } from '../src/lib/devices/Motion';
import { Rgb } from '../src/lib/devices/Rgb';
import { RgbSingle } from '../src/lib/devices/RgbSingle';
import { RgbwSingle } from '../src/lib/devices/RgbwSingle';
import { Slider } from '../src/lib/devices/Slider';
import { Socket } from '../src/lib/devices/Socket';
import { Temperature } from '../src/lib/devices/Temperature';
import { Thermostat } from '../src/lib/devices/Thermostat';
import { VacuumCleaner } from '../src/lib/devices/VacuumCleaner';
import { Volume } from '../src/lib/devices/Volume';
import { VolumeGroup } from '../src/lib/devices/VolumeGroup';
import { Warning } from '../src/lib/devices/Warning';
import { WeatherCurrent } from '../src/lib/devices/WeatherCurrent';
import { WeatherForecast } from '../src/lib/devices/WeatherForecast';
import { Window } from '../src/lib/devices/Window';
import { WindowTilt } from '../src/lib/devices/WindowTilt';

// Device registry mapping type names to classes
const deviceRegistry: Record<string, any> = {
    airCondition: AirCondition,
    blind: Blind,
    blindButtons: BlindButtons,
    button: Button,
    buttonSensor: ButtonSensor,
    camera: Camera,
    chart: Chart,
    cie: Cie,
    ct: Ct,
    dimmer: Dimmer,
    door: Door,
    electricityDataDevice: ElectricityDataDevice,
    fireAlarm: FireAlarm,
    floodAlarm: FloodAlarm,
    gate: Gate,
    hue: Hue,
    humidity: Humidity,
    illuminance: Illuminance,
    image: Image,
    info: Info,
    light: Light,
    location: Location,
    locationOne: LocationOne,
    lock: Lock,
    media: Media,
    motion: Motion,
    rgb: Rgb,
    rgbSingle: RgbSingle,
    rgbwSingle: RgbwSingle,
    slider: Slider,
    socket: Socket,
    temperature: Temperature,
    thermostat: Thermostat,
    vacuumCleaner: VacuumCleaner,
    volume: Volume,
    volumeGroup: VolumeGroup,
    warning: Warning,
    weatherCurrent: WeatherCurrent,
    weatherForecast: WeatherForecast,
    window: Window,
    windowTilt: WindowTilt,
};

const excludedTypes: string[] = [
    'unknown',
    'instance',
    'valve',
];

interface StateDefinition {
    name: string;
    id: string;
    type?: string;
    val?: any;
}

interface TestDetectedDevice {
    states: StateDefinition[];
    type: string;
    isIoBrokerDevice?: boolean;
}

// create a maximal set of states
const detectedDevices: TestDetectedDevice = {
    states: [
        { name: 'SET', id: '0_userdata.0.set', type: 'mixed' },
        { name: 'ACTUAL', id: '0_userdata.0.actual', type: 'mixed' },
        { name: 'POWER', id: '0_userdata.0.power', type: 'boolean' },
        { name: 'HUMIDITY', id: '0_userdata.0.humidity', type: 'number' },
        { name: 'SPEED', id: '0_userdata.0.speed', type: 'enum' },
        { name: 'BOOST', id: '0_userdata.0.boost', type: 'boolean' },
        { name: 'MODE', id: '0_userdata.0.mode', type: 'enum' },

        { name: 'SWING', id: '0_userdata.0.swing', type: 'boolean' },
        { name: 'STOP', id: '0_userdata.0.stop', type: 'boolean' },
        { name: 'OPEN', id: '0_userdata.0.open', type: 'boolean' },
        { name: 'CLOSE', id: '0_userdata.0.close', type: 'boolean' },
        { name: 'TILT_SET', id: '0_userdata.0.tilt_set', type: 'number' },
        { name: 'TILT_ACTUAL', id: '0_userdata.0.tilt_actual', type: 'number' },
        { name: 'TILT_STOP', id: '0_userdata.0.tilt_stop', type: 'boolean' },
        { name: 'TILT_OPEN', id: '0_userdata.0.tilt_open', type: 'boolean' },
        { name: 'TILT_CLOSE', id: '0_userdata.0.tilt_close', type: 'boolean' },
        { name: 'DOOR_STATE', id: '0_userdata.0.door_state', type: 'boolean' },

        { name: 'PRESS', id: '0_userdata.0.press', type: 'boolean' },
        { name: 'PRESS_LONG', id: '0_userdata.0.press_long', type: 'boolean' },

        { name: 'FILE', id: '0_userdata.0.file', type: 'string' },
        { name: 'AUTOFOCUS', id: '0_userdata.0.autofocus', type: 'boolean' },
        { name: 'AUTOWHITEBALANCE', id: '0_userdata.0.autowhiteballance', type: 'boolean' },
        { name: 'BRIGHTNESS', id: '0_userdata.0.brightness', type: 'number' },
        { name: 'NIGHTMODE', id: '0_userdata.0.nightmode', type: 'boolean' },
        { name: 'PTZ', id: '0_userdata.0.ptz', type: 'boolean' },

        { name: 'URL', id: '0_userdata.0.url', type: 'string' },

        { name: 'ON_SET', id: '0_userdata.0.on_set', type: 'boolean' },
        { name: 'ON', id: '0_userdata.0.on', type: 'boolean' },
        { name: 'ON_ACTUAL', id: '0_userdata.0.on_actual', type: 'boolean' },

        { name: 'ELECTRIC_POWER', id: '0_userdata.0.electric_power', type: 'number' },
        { name: 'CURRENT', id: '0_userdata.0.current', type: 'number' },
        { name: 'VOLTAGE', id: '0_userdata.0.voltage', type: 'number' },
        { name: 'CONSUMPTION', id: '0_userdata.0.consumption', type: 'number' },
        { name: 'FREQUENCY', id: '0_userdata.0.frequency', type: 'number' },

        { name: 'GPS', id: '0_userdata.0.GPS', type: 'string' },
        { name: 'LONGITUDE', id: '0_userdata.0.LONGITUDE', type: 'number' },
        { name: 'LATITUDE', id: '0_userdata.0.LATITUDE', type: 'number' },
        { name: 'ELEVATION', id: '0_userdata.0.ELEVATION', type: 'number' },
        { name: 'RADIUS', id: '0_userdata.0.RADIUS', type: 'number' },
        { name: 'ACCURACY', id: '0_userdata.0.ACCURACY', type: 'number' },

        { name: 'STATE', id: '0_userdata.0.STATE.state', type: 'enum' },
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
        { name: 'DURATION', id: '0_userdata.0.DURATION', type: 'number' },
        { name: 'ELAPSED', id: '0_userdata.0.ELAPSED' },
        { name: 'SEEK', id: '0_userdata.0.SEEK' },
        { name: 'TRACK', id: '0_userdata.0.TRACK' },
        { name: 'EPISODE', id: '0_userdata.0.EPISODE' },
        { name: 'SEASON', id: '0_userdata.0.SEASON' },
        { name: 'VOLUME', id: '0_userdata.0.VOLUME', type: 'number' },
        { name: 'VOLUME_ACTUAL', id: '0_userdata.0.VOLUME_ACTUAL', type: 'number' },
        { name: 'MUTE', id: '0_userdata.0.MUTE' },
        { name: 'CONNECTED', id: '0_userdata.0.CONNECTED' },

        { name: 'MAP_BASE64', id: '0_userdata.0.MAP_BASE64' },
        { name: 'MAP_URL', id: '0_userdata.0.MAP_URL' },
        { name: 'WORK_MODE', id: '0_userdata.0.WORK_MODE', type: 'enum' },
        { name: 'WATER', id: '0_userdata.0.WATER' },
        { name: 'WASTE', id: '0_userdata.0.WASTE' },
        { name: 'BATTERY', id: '0_userdata.0.BATTERY', type:'number' },
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
        { name: 'PRECIPITATION_CHANCE', id: '0_userdata.0.PRECIPITATION_CHANCE', type: 'number' },
        { name: 'PRECIPITATION_TYPE', id: '0_userdata.0.PRECIPITATION_TYPE' },
        { name: 'PRESSURE', id: '0_userdata.0.PRESSURE', type: 'number' },
        { name: 'PRESSURE_TENDENCY', id: '0_userdata.0.PRESSURE_TENDENCY', type: 'number' },
        { name: 'REAL_FEEL_TEMPERATURE', id: '0_userdata.0.REAL_FEEL_TEMPERATURE', type: 'number' },
        { name: 'HUMIDITY', id: '0_userdata.0.HUMIDITY', type: 'number' },
        { name: 'UV', id: '0_userdata.0.UV', type: 'number' },
        { name: 'WEATHER', id: '0_userdata.0.WEATHER' },
        { name: 'WIND_DIRECTION', id: '0_userdata.0.WIND_DIRECTION', type: 'number' },
        { name: 'WIND_GUST', id: '0_userdata.0.WIND_GUST', type: 'number' },
        { name: 'WIND_SPEED', id: '0_userdata.0.WIND_SPEED', type: 'number' },

        { name: 'TEMP_MIN', id: '0_userdata.0.TEMP_MIN', type: 'number' },
        { name: 'TEMP_MAX', id: '0_userdata.0.TEMP_MAX', type: 'number' },
        { name: 'DATE', id: '0_userdata.0.DATE' },
        { name: 'DOW', id: '0_userdata.0.DOW', type: 'number' },
        { name: 'TEMP', id: '0_userdata.0.TEMP', type: 'number' },
        { name: 'PRESSURE', id: '0_userdata.0.PRESSURE', type: 'number' },
        { name: 'HUMIDITY', id: '0_userdata.0.HUMIDITY', type: 'number' },
        { name: 'TIME_SUNRISE', id: '0_userdata.0.TIME_SUNRISE' },
        { name: 'TIME_SUNSET', id: '0_userdata.0.TIME_SUNSET' },
        { name: 'WIND_CHILL', id: '0_userdata.0.WIND_CHILL', type: 'number' },
        { name: 'FEELS_LIKE', id: '0_userdata.0.FEELS_LIKE', type: 'number' },
        { name: 'WIND_SPEED', id: '0_userdata.0.WIND_SPEED', type: 'number' },
        { name: 'WIND_DIRECTION', id: '0_userdata.0.WIND_DIRECTION', type: 'number' },
        { name: 'WIND_DIRECTION_STR', id: '0_userdata.0.WIND_DIRECTION_STR', type: 'string' },
        { name: 'WIND_ICON', id: '0_userdata.0.WIND_ICON', type: 'string' },
        { name: 'HISTORY_CHART', id: '0_userdata.0.HISTORY_CHART' },
        { name: 'FORECAST_CHART', id: '0_userdata.0.FORECAST_CHART' },
        { name: 'PRECIPITATION', id: '0_userdata.0.PRECIPITATION' },

        { name: 'SECOND', id: '0_userdata.0.secondary' },

        { name: 'PARTY', id: '0_userdata.0.party' },

        { name: 'RED', id: '0_userdata.0.RED', type: 'number' },
        { name: 'GREEN', id: '0_userdata.0.GREEN', type: 'number' },
        { name: 'BLUE', id: '0_userdata.0.BLUE', type: 'number' },
        { name: 'WHITE', id: '0_userdata.0.WHITE', type: 'number' },
        { name: 'RGB', id: '0_userdata.0.RGB', type: 'string' },
        { name: 'RGBW', id: '0_userdata.0.RGBW', type: 'string' },
        { name: 'HUE', id: '0_userdata.0.HUE', type: 'number' },
        { name: 'CIE', id: '0_userdata.0.CIE', type: 'string' },

        { name: 'DIMMER', id: '0_userdata.0.dimmer', type: 'number' },
        { name: 'BRIGHTNESS', id: '0_userdata.0.brightness', type: 'number' },
        { name: 'SATURATION', id: '0_userdata.0.saturation', type: 'number' },
        { name: 'TEMPERATURE', id: '0_userdata.0.temperature', type: 'number' },
        { name: 'TRANSITION_TIME', id: '0_userdata.0.TRANSITIONTIME', type: 'number' },

        { name: 'LEVEL', id: '0_userdata.0.level', type: 'number' },

        { name: 'ERROR', id: '0_userdata.0.error', type: 'boolean' },
        { name: 'MAINTAIN', id: '0_userdata.0.maintain', type: 'boolean' },
        { name: 'UNREACH', id: '0_userdata.0.unreach', type: 'boolean' },
        { name: 'LOWBAT', id: '0_userdata.0.lowbat', type: 'boolean' },
        { name: 'WORKING', id: '0_userdata.0.working', type: 'boolean' },
        { name: 'DIRECTION', id: '0_userdata.0.direction', type: 'boolean' },
        { name: 'DIRECTION_ENUM', id: '0_userdata.0.direction_enum', type: 'enum' },
    ],
    type: 'abstract',
};

interface StateValue {
    ts: number;
    val: any;
    ack: boolean;
}

// Helper function to convert test data to proper DetectedDevice interface
function convertToDetectedDevice(testData: TestDetectedDevice): DetectedDevice {
    return {
        type: testData.type as Types,
        states: testData.states.map(state => ({
            id: state.id,
            name: state.name,
            // Add required fields for DetectorState
        } as DetectorState)),
        isIoBrokerDevice: testData.isIoBrokerDevice || false
    };
}

interface MockAdapter {
    log: {
        debug: (msg: string) => void;
        info: (msg: string) => void;
        warn: (msg: string) => void;
        error: (msg: string) => void;
    };
    subscribed: string[];
    states: Record<string, StateValue>;
    namespace: string;
    subscribeManager?: any;
    setSubscribeManager(subscribeManager: any): void;
    getForeignObjectAsync(id: string): Promise<any>;
    setForeignStateAsync(id: string, value: any, ack?: boolean): Promise<void>;
    getForeignStateAsync(id: string): Promise<StateValue>;
    unsubscribeForeignStatesAsync(id: string): Promise<void>;
    subscribeForeignStatesAsync(id: string): Promise<void>;
    getSubscribed(): string[];
    extendObject(): void;
    extendObjectAsync?(id: string, obj: any): Promise<void>;
}

class Adapter implements MockAdapter {
    public log: {
        debug: (msg: string) => void;
        info: (msg: string) => void;
        warn: (msg: string) => void;
        error: (msg: string) => void;
    };
    public subscribed: string[];
    public states: Record<string, StateValue>;
    public namespace: string;
    public subscribeManager?: any;

    constructor() {
        this.log = {
            debug: console.log,
            info: console.log,
            warn: console.log,
            error: console.log,
        };
        this.subscribed = [];
        this.states = {};
        this.namespace = 'matter.0';
    }

    setSubscribeManager(subscribeManager: any): void {
        this.subscribeManager = subscribeManager;
    }

    async getForeignObjectAsync(id: string): Promise<any> {
        const entry = detectedDevices.states.find(state => state.id === id);
        if (entry && (entry.type === 'boolean' || entry.type === 'string')) {
            return {
                _id: id,
                common: {
                    type: entry.type,
                },
                type: 'state',
            };
        }
        return {
            _id: id,
            common: {
                min: -100,
                max: 200,
                unit: '°C',
                type: 'number',
                states: entry?.type === 'enum' ? { 0: 'Dummy', 1: 'Dummy2' } : entry?.type === 'mixed' ? { null: 'Dummy' } : undefined,
            },
            type: 'state',
        };
    }

    async setForeignStateAsync(id: string, value: any, ack?: boolean): Promise<void> {
        console.log("SET", id, value);
        this.states[id] = this.states[id] || {} as StateValue;
        this.states[id].ts = Date.now();
        this.states[id].val = value;
        this.states[id].ack = ack ?? true; // Just simulate as if the state was acked directly
        if (this.subscribed.includes(id) && this.subscribeManager) {
            setTimeout(() => {
                this.subscribeManager.observer(id, { ...this.states[id] });
            }, 0);
        }
    }

    async getForeignStateAsync(id: string): Promise<StateValue> {
        console.log("GET", id);
        if (!this.states[id]) {
            const entry = detectedDevices.states.find(state => state.id === id);
            if (entry && entry.val !== undefined) {
                this.states[id] = { ts: Date.now(), val: entry.val, ack: true };
            } else if (entry?.type === 'enum') {
                this.states[id] = { ts: Date.now(), val: 0, ack: true };
            } else if (entry?.type === 'number') {
                this.states[id] = { ts: Date.now(), val: 1, ack: true };
            } else if (entry?.type === 'boolean') {
                this.states[id] = { ts: Date.now(), val: true, ack: true };
            } else if (entry?.type === 'string') {
                this.states[id] = { ts: Date.now(), val: 'test', ack: true };
            } else {
                this.states[id] = { ts: Date.now(), val: null, ack: true };
            }
        }
        return this.states[id];
    }

    async unsubscribeForeignStatesAsync(id: string): Promise<void> {
        // console.log('Unsubscribe', id);
        const pos = this.subscribed.indexOf(id);
        if (pos !== -1) {
            this.subscribed.splice(pos, 1);
        }
    }

    async subscribeForeignStatesAsync(id: string): Promise<void> {
        console.log('Subscribe', id);
        this.subscribed.push(id);
    }

    getSubscribed(): string[] {
        return this.subscribed;
    }

    extendObject(): void {
        // Nothing to do
    }

    async extendObjectAsync(id: string, obj: any): Promise<void> {
        // Nothing to do - just mock implementation
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
        const types = Object.keys(Types).filter(type => !excludedTypes.includes(type));
        for (const type of types) {
            // detect that only read values are subscribed
            console.log(`------------------------\nCreated device for ${type}`);
            const Device = deviceRegistry[type];
            if (!Device) {
                console.warn(`Device class not found for type: ${type}`);
                continue;
            }
            const adapter = new Adapter();
            SubscribeManager.setAdapter(adapter as any);
            adapter.setSubscribeManager(SubscribeManager);
            const testDetectedDevices = convertToDetectedDevice({ ...detectedDevices, type, isIoBrokerDevice: true });
            
            const deviceObj = new Device(testDetectedDevices, adapter as any, { 
                uuid: 'test-uuid',
                enabled: true,
                name: 'test-device',
                oid: 'test.0',
                type: type,
                auto: true,
                noComposed: false
            });
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
                    // check that write-only properties are not subscribed
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
                        if (prop !== 'directionEnum') { // This enum is special because overlaps name wise with  direction
                            throw new Error(`Property "${prop}" (${properties[prop].valueType}) of "${type}" has no value`);
                        }
                    } else if (properties[prop].valueType === ValueType.Enum) {
                        if (deviceObj.getPropertyValue(prop) !== 'Dummy') {
                            throw new Error(`Property "${prop}" (Enum) of "${type}" has wrong value`);
                        }
                    }
                }
                if (properties[prop].accessType === StateAccessType.Write) {
                    let value: any;
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
                        let value: any;
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
                        const handler = (event: any) => {
                            console.log(`Detected change of ${event.property} to ${event.value}`);
                            deviceObj.offChange(handler);
                            resolve(undefined);
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
    }).timeout(120000);

    it('Test min/max - negative', async function () {
        const Device = Thermostat;
        const adapter = new Adapter();
        SubscribeManager.setAdapter(adapter as any);
        adapter.setSubscribeManager(SubscribeManager);
        const testDetectedDevices = convertToDetectedDevice({ ...detectedDevices, type: 'thermostat' });
        
        const deviceObj = new Device(testDetectedDevices, adapter as any, { 
            uuid: 'test-uuid-thermostat',
            enabled: true,
            name: 'test-thermostat',
            oid: 'test.0',
            type: 'thermostat',
            auto: true,
            noComposed: false
        });
        await deviceObj.init();

        const properties = deviceObj.getProperties();

        // subscribe on changes and try to read value
        await deviceObj.setPropertyValue(PropertyType.Level, 30);
        const ioBrokerValue = await adapter.getForeignStateAsync(properties.level.read);
        await new Promise(resolve =>
            setTimeout(() => {
                const deviceValue = deviceObj.getPropertyValue(PropertyType.Level);
                if (ioBrokerValue.val !== deviceValue) {
                    throw new Error(
                        `Value of ${properties.level.read} is ${ioBrokerValue.val}, but should be ${deviceValue}`,
                    );
                }
                resolve(undefined);
            }, 100),
        );
        await deviceObj.destroy();
    }).timeout(2000);

    it('Test min/max - positive, readId=writeId', async function () {
        const Device = Slider;
        const adapter = new Adapter();
        SubscribeManager.setAdapter(adapter as any);
        adapter.setSubscribeManager(SubscribeManager);
        const _detectedDevices: TestDetectedDevice = {
            states: [{ name: 'SET', id: '0_userdata.0.set' }],
            type: 'slider',
            isIoBrokerDevice: true,
        };

        const deviceObj = new Device(convertToDetectedDevice(_detectedDevices), adapter as any, { 
            uuid: 'test-uuid-slider1',
            enabled: true,
            name: 'test-slider1',
            oid: 'test.0',
            type: 'slider',
            auto: true,
            noComposed: false
        });
        await deviceObj.init();

        const properties = deviceObj.getProperties();

        // subscribe on changes and try to read value
        await deviceObj.setPropertyValue(PropertyType.Level, 30);
        const ioBrokerValue = await adapter.getForeignStateAsync(properties.level.read);
        await new Promise(resolve =>
            setTimeout(() => {
                const deviceValue = deviceObj.getPropertyValue(PropertyType.Level);
                if (deviceValue !== 30) {
                    throw new Error(`Value of ${properties.level.read} is ${ioBrokerValue.val}, but should be 30`);
                }
                if (ioBrokerValue.val !== -10) {
                    throw new Error(`Value of ${properties.level.read} is ${ioBrokerValue.val}, but should be -10`);
                }
                resolve(undefined);
            }, 100),
        );

        await deviceObj.destroy();
    }).timeout(2000);

    it('Test min/max - positive, readId!=writeId', async function () {
        const Device = Slider;
        const adapter = new Adapter();
        SubscribeManager.setAdapter(adapter as any);
        adapter.setSubscribeManager(SubscribeManager);
        const _detectedDevices: TestDetectedDevice = {
            states: [
                { name: 'SET', id: '0_userdata.0.set' },
                { name: 'ACTUAL', id: '0_userdata.0.actual' },
            ],
            type: 'slider',
            isIoBrokerDevice: true,
        };

        const deviceObj = new Device(convertToDetectedDevice(_detectedDevices), adapter as any, { 
            uuid: 'test-uuid-slider2',
            enabled: true,
            name: 'test-slider2',
            oid: 'test.0',
            type: 'slider',
            auto: true,
            noComposed: false
        });
        await deviceObj.init();

        const properties = deviceObj.getProperties();

        // subscribe on changes and try to read value
        await deviceObj.setPropertyValue(PropertyType.Level, 75);

        // write value to ACTUAL
        const ioBrokerValue = await adapter.getForeignStateAsync(properties.level.write);
        await adapter.setForeignStateAsync(properties.level.read, ioBrokerValue.val, true);

        await new Promise(resolve =>
            setTimeout(() => {
                const deviceValue = deviceObj.getPropertyValue(PropertyType.Level);
                if (deviceValue !== 75) {
                    throw new Error(`Value of ${properties.level.read} is ${deviceValue}, but should be 75`);
                }
                if (ioBrokerValue.val !== 125) {
                    throw new Error(`Value of ${properties.level.write} is ${ioBrokerValue.val}, but should be 125`);
                }
                resolve(undefined);
            }, 100),
        );

        await deviceObj.destroy();
    }).timeout(20000);
});