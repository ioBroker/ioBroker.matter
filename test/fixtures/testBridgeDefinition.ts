/**
 * Expectations for every endpoint the integration-test bridge exposes.
 *
 * The ids here must match the ones `TestBridgeDevice.ts` mounts; the test fails when the two sets differ.
 */

export interface BridgedEndpointSpec {
    /** Endpoint id inside the aggregator; also its nodeLabel, so the test can identify it again over the wire. */
    id: string;
    /** Matter device type id the endpoint declares. */
    deviceType: number;
    /** Converter class expected from `ioBrokerDeviceFabric`. */
    expectedConverter: string;
    /** ioBroker device type expected on the resulting `GenericDevice`. */
    expectedIoBrokerType: string;
    /** Exactly the ioBroker states, relative to the endpoint base id, the mapping must create. */
    expectedStates: string[];
    /** Values the mapping must have written, keyed by state name. */
    expectedValues?: Record<string, unknown>;
    /** Set when the Matter device type has no dedicated converter and falls through to the utility mapping. */
    unmapped?: true;
    /** Set when mapping this endpoint currently throws; the message the test pins. */
    expectedThrowMessage?: string;
}

const CONNECTION_STATES = ['UNREACH', 'info.connection'];

export const BRIDGED_ENDPOINTS: BridgedEndpointSpec[] = [
    {
        // Deliberately not mapped by the adapter: guards the UtilityOnlyToIoBroker fall-through
        id: 'onoffsensor',
        deviceType: 0x0850,
        expectedConverter: 'UtilityOnlyToIoBroker',
        expectedIoBrokerType: 'light',
        expectedStates: [...CONNECTION_STATES],
        unmapped: true,
    },
    {
        id: 'contact',
        deviceType: 0x0015,
        expectedConverter: 'ContactSensorToIoBroker',
        expectedIoBrokerType: 'window',
        expectedStates: ['ACTUAL', ...CONNECTION_STATES],
        // Matter booleanState true means the contact is closed, so the ioBroker window is not open.
        expectedValues: { ACTUAL: false, UNREACH: false },
    },
    {
        id: 'onofflight',
        deviceType: 0x0100,
        expectedConverter: 'OnOffLightToIoBroker',
        expectedIoBrokerType: 'light',
        expectedStates: ['ON_ACTUAL', 'SET', ...CONNECTION_STATES, 'startUpOnOff'],
        expectedValues: { ON_ACTUAL: true, SET: true },
    },
    {
        id: 'dimmable',
        deviceType: 0x0101,
        expectedConverter: 'DimmableToIoBroker',
        expectedIoBrokerType: 'dimmer',
        expectedStates: [
            'ACTUAL',
            'ON_ACTUAL',
            'ON_SET',
            'SET',
            'TRANSITION_TIME',
            ...CONNECTION_STATES,
            'startUpCurrentLevel',
            'startUpOnOff',
        ],
        // currentLevel 128 of 254 is 50%.
        expectedValues: { ACTUAL: 50, SET: 50, ON_ACTUAL: true },
    },
    {
        id: 'colortemp',
        deviceType: 0x010c,
        expectedConverter: 'ExtendedColorLightToIoBroker',
        expectedIoBrokerType: 'ct',
        expectedStates: [
            'DIMMER',
            'ON',
            'ON_ACTUAL',
            'TEMPERATURE',
            'TRANSITION_TIME',
            ...CONNECTION_STATES,
            'startUpCurrentLevel',
            'startUpOnOff',
        ],
        // 250 mireds is 4000 K.
        expectedValues: { TEMPERATURE: 4000, ON: true, DIMMER: 79 },
    },
    {
        id: 'extendedcolor',
        deviceType: 0x010d,
        expectedConverter: 'ExtendedColorLightToIoBroker',
        expectedIoBrokerType: 'hue',
        expectedStates: [
            'DIMMER',
            'HUE',
            'ON',
            'ON_ACTUAL',
            'SATURATION',
            'TEMPERATURE',
            'TRANSITION_TIME',
            ...CONNECTION_STATES,
            'startUpCurrentLevel',
            'startUpOnOff',
        ],
        // currentHue 100 of 254 is 141.73 degrees, currentSaturation 200 of 254 is 79%, 300 mireds is 3333 K.
        expectedValues: { HUE: 141.7323, SATURATION: 79, TEMPERATURE: 3333, DIMMER: 100 },
    },
    {
        id: 'onoffplug',
        deviceType: 0x010a,
        expectedConverter: 'OnOffPlugInUnitToIoBroker',
        expectedIoBrokerType: 'socket',
        expectedStates: ['ACTUAL', 'SET', ...CONNECTION_STATES, 'startUpOnOff'],
        expectedValues: { ACTUAL: false, SET: false },
    },
    {
        id: 'dimmableplug',
        deviceType: 0x010b,
        expectedConverter: 'DimmableToIoBroker',
        expectedIoBrokerType: 'dimmer',
        expectedStates: [
            'ACTUAL',
            'ON_ACTUAL',
            'ON_SET',
            'SET',
            'TRANSITION_TIME',
            ...CONNECTION_STATES,
            'startUpCurrentLevel',
            'startUpOnOff',
        ],
        expectedValues: { ACTUAL: 25, SET: 25 },
    },
    {
        id: 'doorlock',
        deviceType: 0x000a,
        expectedConverter: 'DoorLockToIoBroker',
        expectedIoBrokerType: 'lock',
        expectedStates: ['ACTUAL', 'DOOR_STATE', 'OPEN', 'SET', ...CONNECTION_STATES],
        // The ioBroker lock states mean "unlocked", and the fixture reports the bolt as locked.
        expectedValues: { ACTUAL: false, SET: false, DOOR_STATE: false },
    },
    {
        id: 'windowcovering',
        deviceType: 0x0202,
        expectedConverter: 'WindowCoveringToIoBroker',
        expectedIoBrokerType: 'blind',
        expectedStates: ['ACTUAL', 'CLOSE', 'MAINTAIN', 'OPEN', 'SET', 'STOP', ...CONNECTION_STATES, 'WORKING'],
        // 3000 hundredths closed is 70% open in ioBroker terms.
        expectedValues: { ACTUAL: 70, SET: 70, WORKING: false },
    },
    {
        id: 'occupancy',
        deviceType: 0x0107,
        expectedConverter: 'OccupancyToIoBroker',
        expectedIoBrokerType: 'motion',
        expectedStates: ['ACTUAL', ...CONNECTION_STATES],
        expectedValues: { ACTUAL: true },
    },
    {
        id: 'temperature',
        deviceType: 0x0302,
        expectedConverter: 'TemperatureSensorToIoBroker',
        expectedIoBrokerType: 'temperature',
        expectedStates: ['ACTUAL', ...CONNECTION_STATES],
        expectedValues: { ACTUAL: 21.5 },
    },
    {
        id: 'humidity',
        deviceType: 0x0307,
        expectedConverter: 'HumiditySensorToIoBroker',
        expectedIoBrokerType: 'humidity',
        expectedStates: ['ACTUAL', ...CONNECTION_STATES],
        // 5500 hundredths percent; the trailing float noise is what the converter actually writes today.
        expectedValues: { ACTUAL: 55.00000000000001 },
    },
    {
        id: 'lightsensor',
        deviceType: 0x0106,
        expectedConverter: 'LightSensorToIoBroker',
        expectedIoBrokerType: 'illuminance',
        expectedStates: ['ACTUAL', ...CONNECTION_STATES],
        // Matter encodes lux logarithmically: 10^((5000-1)/10000) rounds to 3.
        expectedValues: { ACTUAL: 3 },
    },
    {
        id: 'genericswitch',
        deviceType: 0x000f,
        expectedConverter: 'GenericSwitchToIoBroker',
        expectedIoBrokerType: 'buttonSensor',
        expectedStates: ['PRESS', 'PRESS_LONG', ...CONNECTION_STATES],
    },
    {
        id: 'genericswitchlatching',
        deviceType: 0x000f,
        expectedConverter: 'GenericSwitchToIoBroker',
        expectedIoBrokerType: 'socket',
        expectedStates: ['ACTUAL', ...CONNECTION_STATES],
        expectedValues: { ACTUAL: false },
    },
    {
        id: 'speaker',
        deviceType: 0x0022,
        expectedConverter: 'SpeakerToIoBroker',
        expectedIoBrokerType: 'volume',
        expectedStates: ['ACTUAL', 'MUTE', 'SET', ...CONNECTION_STATES],
        // currentLevel 100 of 254 is 39%.
        expectedValues: { ACTUAL: 39, SET: 39 },
    },
    {
        id: 'waterleak',
        deviceType: 0x0043,
        expectedConverter: 'WaterLeakDetectorToIoBroker',
        expectedIoBrokerType: 'floodAlarm',
        expectedStates: ['ACTUAL', ...CONNECTION_STATES],
        expectedValues: { ACTUAL: false },
    },
    {
        id: 'thermostat',
        deviceType: 0x0301,
        expectedConverter: 'ThermostatToIoBroker',
        expectedIoBrokerType: 'thermostat',
        expectedStates: ['ACTUAL', 'MODE', 'SET', ...CONNECTION_STATES],
        // MODE 7 is HEAT in the ioBroker thermostat mode enum.
        expectedValues: { ACTUAL: 21, SET: 22, MODE: 7 },
    },
    {
        id: 'smokecoalarm',
        deviceType: 0x0076,
        expectedConverter: 'SmokeCoAlarmToIoBroker',
        expectedIoBrokerType: 'fireAlarm',
        expectedStates: ['ACTUAL', 'BATTERY', 'LOWBAT', ...CONNECTION_STATES],
        // batPercentRemaining is reported in half percent.
        expectedValues: { ACTUAL: false, BATTERY: 90, LOWBAT: false },
    },
    {
        id: 'smokecoalarmmains',
        deviceType: 0x0076,
        expectedConverter: 'SmokeCoAlarmToIoBroker',
        expectedIoBrokerType: 'fireAlarm',
        // No PowerSource on the alarm endpoint, so the battery mapping falls back to the root endpoint
        expectedStates: ['ACTUAL', ...CONNECTION_STATES],
    },
    {
        id: 'airconditioner',
        deviceType: 0x0072,
        expectedConverter: 'AirConditionerToIoBroker',
        expectedIoBrokerType: 'airCondition',
        expectedStates: ['ACTUAL', 'MODE', 'POWER', 'SET', ...CONNECTION_STATES],
        // MODE 3 is COOL in the ioBroker thermostat mode enum.
        expectedValues: { ACTUAL: 24, SET: 20, MODE: 3, POWER: true },
    },
];

export const SENSOR_AND_APPLIANCE_ENDPOINTS: BridgedEndpointSpec[] = [
    {
        id: 'flow',
        deviceType: 0x0306,
        expectedConverter: 'FlowSensorToIoBroker',
        expectedIoBrokerType: 'flow',
        expectedStates: ['FLOW', ...CONNECTION_STATES],
        // Matter MeasuredValue is 10 x m³/h.
        expectedValues: { FLOW: 12 },
    },
    {
        id: 'pressure',
        deviceType: 0x0305,
        expectedConverter: 'PressureSensorToIoBroker',
        expectedIoBrokerType: 'pressure',
        expectedStates: ['PRESSURE', ...CONNECTION_STATES],
        // Matter MeasuredValue is 10 x kPa, which equals the ioBroker mbar value.
        expectedValues: { PRESSURE: 1013 },
    },
    {
        id: 'airquality',
        deviceType: 0x002c,
        expectedConverter: 'AirQualitySensorToIoBroker',
        expectedIoBrokerType: 'airQuality',
        // Only the concentration clusters the fixture mounts appear, and PM2.5 without the LevelIndication
        // feature contributes no level state.
        expectedStates: ['ACTUAL', 'AQI', 'CO2', 'CO2_LEVEL', 'HUMIDITY', 'PM25', ...CONNECTION_STATES],
        // AQI 1 is GOOD, CO2_LEVEL 2 is MEDIUM.
        expectedValues: { AQI: 1, CO2: 800, CO2_LEVEL: 2, PM25: 12, ACTUAL: 21.5, HUMIDITY: 48 },
    },
    {
        id: 'fan',
        deviceType: 0x002b,
        expectedConverter: 'FanToIoBroker',
        expectedIoBrokerType: 'fan',
        expectedStates: ['AIRFLOW_DIRECTION', 'POWER', 'SPEED', 'SPEED_LEVEL', 'SWING', ...CONNECTION_STATES],
        // SPEED 3 is MEDIUM, SWING 1 is HORIZONTAL, AIRFLOW_DIRECTION 0 is FORWARD.
        expectedValues: { SPEED: 3, SPEED_LEVEL: 50, POWER: true, SWING: 1, AIRFLOW_DIRECTION: 0 },
    },
    {
        id: 'airpurifier',
        deviceType: 0x002d,
        expectedConverter: 'AirPurifierToIoBroker',
        expectedIoBrokerType: 'airPurifier',
        // The fixture declares no Rocking and no AirflowDirection feature, so neither state exists.
        expectedStates: [
            'FILTER_CHANGE',
            'FILTER_CONDITION',
            'FILTER_CONDITION_CARBON',
            'POWER',
            'SPEED',
            'SPEED_LEVEL',
            ...CONNECTION_STATES,
        ],
        // SPEED 2 is LOW; the carbon filter alone warns and still raises the shared filter change flag.
        expectedValues: {
            SPEED: 2,
            SPEED_LEVEL: 33,
            POWER: true,
            FILTER_CONDITION: 75,
            FILTER_CONDITION_CARBON: 60,
            FILTER_CHANGE: true,
        },
    },
    {
        id: 'pump',
        deviceType: 0x0303,
        expectedConverter: 'PumpToIoBroker',
        expectedIoBrokerType: 'pump',
        expectedStates: ['FLOW', 'LEVEL', 'POWER', 'PRESSURE', 'TEMPERATURE', ...CONNECTION_STATES],
        // currentLevel 127 of 254 is 50%, MeasuredValue 4550 is 45.5 °C, 2000 is 2000 mbar, 250 is 25 m³/h.
        expectedValues: { POWER: false, LEVEL: 50, TEMPERATURE: 45.5, PRESSURE: 2000, FLOW: 25 },
    },
];

export const ALL_ENDPOINTS = [...BRIDGED_ENDPOINTS, ...SENSOR_AND_APPLIANCE_ENDPOINTS];
