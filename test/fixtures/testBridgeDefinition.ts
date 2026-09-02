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
    /**
     * Device type the ioBroker type detector finds again in the states the mapping created. Defaults to
     * `expectedIoBrokerType`; set it only where the created states legitimately describe another type, and say
     * why. `null` means the states are not a detectable device at all.
     */
    expectedDetectedType?: string | null;
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
        // Only the connection states are created, which are no device
        expectedDetectedType: null,
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
        // A latching switch reports its position and takes no command, so the only state is a read-only
        // ACTUAL. A socket needs a writable SET, so no socket is detected and the retry reports what the
        // state does describe: a read-only boolean sensor. A bridge pointed at these states would log the
        // mismatch and expose the single state, not a socket.
        expectedDetectedType: 'window',
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
        // Only the concentration clusters the fixture mounts appear, and none of them enables the
        // LevelIndication feature except CO2, so only CO2 contributes a level state. POWER comes from an
        // OnOff cluster the AirQualitySensor device type does not declare but real devices co-locate anyway.
        expectedStates: [
            'ACTUAL',
            'AQI',
            'CH2O',
            'CO',
            'CO2',
            'CO2_LEVEL',
            'HUMIDITY',
            'PM25',
            'POWER',
            'TVOC',
            ...CONNECTION_STATES,
        ],
        // AQI 1 is GOOD, CO2_LEVEL 2 is MEDIUM. CH2O is reported as 0.02 mg/m³ and scaled to the pattern's
        // µg/m³ default (x1000). CO is reported in µg/m³ against the ppm-family default: cross-family, so the
        // mapping drops the reading rather than convert it and CO is never written. TVOC has no type-detector
        // default; the mapping's canonical ppb picks up the 0.5 ppm reading scaled by 1000.
        expectedValues: {
            AQI: 1,
            CO2: 800,
            CO2_LEVEL: 2,
            PM25: 12,
            CH2O: 20,
            CO: undefined,
            TVOC: 500,
            ACTUAL: 21.5,
            HUMIDITY: 48,
            POWER: true,
        },
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
        id: 'fannoonoff',
        deviceType: 0x002b,
        expectedConverter: 'FanToIoBroker',
        expectedIoBrokerType: 'fan',
        // No OnOff, no Rocking, no AirflowDirection feature, so only fanMode and percentCurrent back a state here.
        expectedStates: ['POWER', 'SPEED', 'SPEED_LEVEL', ...CONNECTION_STATES],
        // POWER has no OnOff to read, so it derives from fanMode: Medium is not Off, so POWER is true.
        expectedValues: { SPEED: 3, SPEED_LEVEL: 66, POWER: true },
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
        id: 'airpurifiercarbon',
        deviceType: 0x002d,
        expectedConverter: 'AirPurifierToIoBroker',
        expectedIoBrokerType: 'airPurifier',
        // No HEPA cluster, so FILTER_CONDITION cannot exist while the shared FILTER_CHANGE still has to
        expectedStates: [
            'FILTER_CHANGE',
            'FILTER_CONDITION_CARBON',
            'POWER',
            'SPEED',
            'SPEED_LEVEL',
            ...CONNECTION_STATES,
        ],
        expectedValues: { SPEED: 1, SPEED_LEVEL: 90, POWER: true, FILTER_CONDITION_CARBON: 40, FILTER_CHANGE: true },
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
    {
        id: 'roboticvacuum',
        deviceType: 0x0074,
        expectedConverter: 'RoboticVacuumCleanerToIoBroker',
        expectedIoBrokerType: 'vacuumCleaner',
        expectedStates: [
            'ERROR',
            'HOME',
            'MODE',
            'PAUSE',
            'PHASE',
            'POWER',
            'PROGRESS',
            'RUN_MODE',
            'STATE',
            ...CONNECTION_STATES,
        ],
        // The robot runs its Cleaning mode as number 3, which must land on the ioBroker CLEANING key 1; STATE 1 is
        // CLEANING too. MODE keeps the robot's own mode numbers, so its Deep Clean mode stays 2.
        expectedValues: {
            RUN_MODE: 1,
            POWER: true,
            MODE: 2,
            STATE: 1,
            PHASE: 'Sweeping',
            PROGRESS: 50,
            ERROR: '',
        },
    },
    {
        id: 'roboticvacuumbasic',
        deviceType: 0x0074,
        expectedConverter: 'RoboticVacuumCleanerToIoBroker',
        expectedIoBrokerType: 'vacuumCleaner',
        // No RvcCleanMode and no optional command, so MODE, PAUSE and HOME cannot exist. PROGRESS does, but an
        // empty Matter progress list means the robot reports no progress, so no percentage may be invented for it.
        expectedStates: ['ERROR', 'PHASE', 'POWER', 'PROGRESS', 'RUN_MODE', 'STATE', ...CONNECTION_STATES],
        expectedValues: { RUN_MODE: 0, POWER: false, STATE: 0, ERROR: '', PROGRESS: undefined },
    },
];

/**
 * Endpoints that carry child endpoints in their partsList, and the children the mapping must derive from them.
 * A child is keyed `<parent nodeLabel>/<child device type name>`.
 */
export const COMPOSED_ENDPOINTS: BridgedEndpointSpec[] = [
    {
        // An air purifier only offers its sensor children, so each of them is a device of its own.
        id: 'airpurifiercomposed',
        deviceType: 0x002d,
        expectedConverter: 'AirPurifierToIoBroker',
        expectedIoBrokerType: 'airPurifier',
        expectedStates: ['FILTER_CHANGE', 'FILTER_CONDITION', 'POWER', 'SPEED', 'SPEED_LEVEL', ...CONNECTION_STATES],
        // SPEED 1 is HIGH; only the hepa filter is mounted here and it is fine, so no filter change is due.
        expectedValues: { SPEED: 1, SPEED_LEVEL: 80, POWER: true, FILTER_CONDITION: 90, FILTER_CHANGE: false },
    },
    {
        id: 'airpurifiercomposed/AirQualitySensor',
        deviceType: 0x002c,
        expectedConverter: 'AirQualitySensorToIoBroker',
        expectedIoBrokerType: 'airQuality',
        // A child endpoint carries no BridgedDeviceBasicInformation, so it shares the parent's connection state.
        expectedStates: ['AQI', 'CO2', 'PM25'],
        expectedValues: { AQI: 1, CO2: 620, PM25: 7 },
    },
    {
        id: 'airpurifiercomposed/TemperatureSensor',
        deviceType: 0x0302,
        expectedConverter: 'TemperatureSensorToIoBroker',
        expectedIoBrokerType: 'temperature',
        expectedStates: ['ACTUAL'],
        expectedValues: { ACTUAL: 23.5 },
    },
    {
        id: 'airpurifiercomposed/HumiditySensor',
        deviceType: 0x0307,
        expectedConverter: 'HumiditySensorToIoBroker',
        expectedIoBrokerType: 'humidity',
        expectedStates: ['ACTUAL'],
        expectedValues: { ACTUAL: 42 },
    },
    {
        // A refrigerator composes a mandatory TemperatureControlledCabinet, so the cabinet stays a part of it and
        // never appears as an own device - the endpoint list assertion is what pins that.
        id: 'fridgecomposed',
        deviceType: 0x0070,
        expectedConverter: 'UtilityOnlyToIoBroker',
        expectedIoBrokerType: 'light',
        // Only the connection states are created, which are no device
        expectedDetectedType: null,
        expectedStates: [...CONNECTION_STATES],
        unmapped: true,
    },
    {
        // A mandatory PowerSource child is a utility type, so the alarm is not a composition.
        id: 'smokecoalarmcomposed',
        deviceType: 0x0076,
        expectedConverter: 'SmokeCoAlarmToIoBroker',
        expectedIoBrokerType: 'fireAlarm',
        expectedStates: ['ACTUAL', ...CONNECTION_STATES],
        expectedValues: { ACTUAL: false },
    },
    {
        // The alarm's children are walked, and a bare PowerSource endpoint maps to the utility device the adapter
        // creates for power sources anywhere else in a bridge.
        id: 'smokecoalarmcomposed/PowerSource',
        deviceType: 0x0011,
        expectedConverter: 'UtilityOnlyToIoBroker',
        expectedIoBrokerType: 'light',
        // A power source contributes battery indicators, not a device
        expectedDetectedType: null,
        expectedStates: ['BATTERY', 'LOWBAT'],
        // batPercentRemaining is reported in half percent.
        expectedValues: { BATTERY: 70, LOWBAT: false },
    },
];

/** Endpoints that must never be mapped, keyed the way `COMPOSED_ENDPOINTS` keys children. */
export const OWNED_CHILD_ENDPOINTS = ['fridgecomposed/TemperatureControlledCabinet'];

export const ALL_ENDPOINTS = [...BRIDGED_ENDPOINTS, ...SENSOR_AND_APPLIANCE_ENDPOINTS, ...COMPOSED_ENDPOINTS];
