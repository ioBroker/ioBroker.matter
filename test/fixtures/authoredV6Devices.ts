/**
 * Device trees for the device types `@iobroker/type-detector` v6 added.
 *
 * These are **authored, not exported**: the object export the other fixtures come from predates these
 * types, so there are no real objects for them. Their roles, units and enum labels are taken from
 * `ChannelDetector.getPatterns()` and from the device classes, not invented - but they are still my
 * reading of what such a device looks like, so treat a failure here as weaker evidence than one in
 * `ioBrokerObjects.json`. Replace this file with a real export as soon as one exists.
 *
 * They exist for what only the object path exercises: the real detector deciding a type from roles, alias
 * resolution to a `0_userdata` target, and the endpoint snapshot. The variant matrix for these types
 * lives in `toMatterEndpoints.test.ts`, which drives the converters directly; do not rebuild it here.
 */

import type { BridgeDeviceDescription } from '../../src/ioBrokerTypes';
import type { ObjectMap } from '../helpers/mockObjectAdapter';

const ALIAS_ROOT = 'alias.0.V6-Devices';
const TARGET_ROOT = '0_userdata.0.V6-States';

/** Enum labels the device classes map, keyed the way an ioBroker `common.states` is. */
const FAN_SPEEDS = ['AUTO', 'HIGH', 'LOW', 'MEDIUM', 'QUIET', 'TURBO'];
const FAN_SWINGS = ['AUTO', 'HORIZONTAL', 'STATIONARY', 'VERTICAL'];
const AIRFLOW_DIRECTIONS = ['FORWARD', 'REVERSE'];
const AQI_LEVELS = ['UNKNOWN', 'GOOD', 'FAIR', 'MODERATE', 'POOR', 'VERY_POOR', 'EXTREMELY_POOR'];
const POLLUTANT_LEVELS = ['UNKNOWN', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const ALARM_SEVERITIES = ['NORMAL', 'WARNING', 'CRITICAL'];

const labelled = (labels: string[]): Record<string, string> =>
    Object.fromEntries(labels.map((label, index) => [String(index), label]));

interface StateSpec {
    role: string;
    type: 'number' | 'boolean' | 'string';
    write?: boolean;
    unit?: string;
    min?: number;
    max?: number;
    states?: string[];
    /** Value the `0_userdata` target holds, so the snapshot shows a real conversion. */
    value?: number | boolean | string;
}

interface DeviceSpec {
    /** Channel name below `alias.0.V6-Devices`, also the device name in the bridge configuration. */
    name: string;
    type: string;
    uuid: string;
    /** Role of the channel, which is what the detector groups on. */
    channelRole: string;
    /** Set for a type the adapter maps in the controller direction only, so no bridge endpoint exists. */
    controllerOnly?: true;
    states: Record<string, StateSpec>;
}

const num = (role: string, value: number, unit?: string, extra: Partial<StateSpec> = {}): StateSpec => ({
    role,
    type: 'number',
    write: false,
    unit,
    value,
    ...extra,
});

const percent = (role: string, value: number): StateSpec => ({
    role,
    type: 'number',
    write: false,
    unit: '%',
    min: 0,
    max: 100,
    value,
});

const bool = (role: string, value: boolean, write = false): StateSpec => ({ role, type: 'boolean', write, value });

const choice = (role: string, states: string[], value: number): StateSpec => ({
    role,
    type: 'number',
    write: true,
    states,
    value,
});

const FAN_ELECTRICITY: Record<string, StateSpec> = {
    ELECTRIC_POWER: num('value.power', 12, 'W'),
    CURRENT: num('value.current', 0.05, 'A'),
    VOLTAGE: num('value.voltage', 230, 'V'),
    CONSUMPTION: num('value.power.consumption', 480, 'Wh'),
    FREQUENCY: num('value.frequency', 50, 'Hz'),
};

export const AUTHORED_DEVICES: DeviceSpec[] = [
    {
        name: 'Fan-Min',
        type: 'fan',
        uuid: 'a0000001-0000-4000-8000-000000000001',
        channelRole: 'fan',
        states: { SPEED: choice('level.mode.fan', FAN_SPEEDS, 3) },
    },
    {
        name: 'Fan-Full',
        type: 'fan',
        uuid: 'a0000002-0000-4000-8000-000000000002',
        channelRole: 'fan',
        states: {
            SPEED: choice('level.mode.fan', FAN_SPEEDS, 3),
            POWER: bool('switch.power', true, true),
            SPEED_LEVEL: { role: 'level.speed', type: 'number', write: true, unit: '%', min: 0, max: 100, value: 40 },
            SWING: choice('level.mode.swing', FAN_SWINGS, 1),
            AIRFLOW_DIRECTION: choice('level.mode.airflow', AIRFLOW_DIRECTIONS, 1),
            ...FAN_ELECTRICITY,
        },
    },
    {
        name: 'AirPurifier-Min',
        type: 'airPurifier',
        uuid: 'a0000003-0000-4000-8000-000000000003',
        channelRole: 'airPurifier',
        states: {
            SPEED: choice('level.mode.fan', FAN_SPEEDS, 1),
            FILTER_CONDITION: percent('value.filter', 70),
        },
    },
    {
        name: 'AirPurifier-Full',
        type: 'airPurifier',
        uuid: 'a0000004-0000-4000-8000-000000000004',
        channelRole: 'airPurifier',
        states: {
            SPEED: choice('level.mode.fan', FAN_SPEEDS, 1),
            POWER: bool('switch.power', true, true),
            FILTER_CONDITION: percent('value.filter', 70),
            FILTER_CONDITION_CARBON: percent('value.filter.carbon', 60),
            FILTER_CHANGE: bool('indicator.maintenance.filter', false),
        },
    },
    {
        name: 'AirQuality-Min',
        type: 'airQuality',
        uuid: 'a0000005-0000-4000-8000-000000000005',
        channelRole: 'airQuality',
        states: { AQI: choice('value.airquality', AQI_LEVELS, 2) },
    },
    {
        name: 'AirQuality-Full',
        type: 'airQuality',
        uuid: 'a0000006-0000-4000-8000-000000000006',
        channelRole: 'airQuality',
        states: {
            AQI: choice('value.airquality', AQI_LEVELS, 2),
            CO2: num('value.co2', 800, 'ppm'),
            CO2_LEVEL: choice('value.co2.level', POLLUTANT_LEVELS, 2),
            PM25: num('value.pm25', 12, 'µg/m³'),
            TVOC: num('value.tvoc', 0.3, 'ppm'),
            PRESSURE: num('value.pressure', 1013, 'mbar'),
            ACTUAL: num('value.temperature', 21.5, '°C'),
            HUMIDITY: percent('value.humidity', 48),
        },
    },
    {
        name: 'CoAlarm',
        type: 'coAlarm',
        uuid: 'a0000007-0000-4000-8000-000000000007',
        channelRole: 'coAlarm',
        controllerOnly: true,
        states: {
            ACTUAL: bool('sensor.alarm.co', false),
            SEVERITY: choice('value.severity', ALARM_SEVERITIES, 0),
            MUTED: bool('indicator.alarm.muted', false),
            TEST: bool('indicator.working.test', false),
        },
    },
    {
        name: 'Contact',
        type: 'contact',
        uuid: 'a0000008-0000-4000-8000-000000000008',
        channelRole: 'contact',
        states: { ACTUAL: bool('sensor.contact', true) },
    },
    {
        name: 'Electricity',
        type: 'electricity',
        uuid: 'a0000009-0000-4000-8000-000000000009',
        channelRole: 'electricity',
        controllerOnly: true,
        states: {
            ELECTRIC_POWER: num('value.power', 1200, 'W'),
            CURRENT: num('value.current', 5.2, 'A'),
            VOLTAGE: num('value.voltage', 230, 'V'),
            CONSUMPTION: num('value.power.consumption', 15300, 'Wh'),
            FREQUENCY: num('value.frequency', 50, 'Hz'),
        },
    },
    {
        name: 'Flow',
        type: 'flow',
        uuid: 'a000000a-0000-4000-8000-00000000000a',
        channelRole: 'flow',
        states: { FLOW: num('value.flow', 2.5, 'm³/h') },
    },
    {
        name: 'Pressure',
        type: 'pressure',
        uuid: 'a000000b-0000-4000-8000-00000000000b',
        channelRole: 'pressure',
        states: { PRESSURE: num('value.pressure', 1013, 'mbar') },
    },
    {
        name: 'Pump-Min',
        type: 'pump',
        uuid: 'a000000c-0000-4000-8000-00000000000c',
        channelRole: 'pump',
        states: { POWER: bool('switch.pump', true, true) },
    },
    {
        name: 'Pump-Full',
        type: 'pump',
        uuid: 'a000000d-0000-4000-8000-00000000000d',
        channelRole: 'pump',
        states: {
            POWER: bool('switch.pump', true, true),
            LEVEL: { role: 'level.pump', type: 'number', write: true, unit: '%', min: 0, max: 100, value: 60 },
            TEMPERATURE: num('value.temperature', 38, '°C'),
            // Declared in units the clusters do not use, so the object path is shown to convert them the
            // way the converter-level tests do.
            PRESSURE: num('value.pressure', 250, 'kPa'),
            FLOW: num('value.flow', 30, 'l/min'),
            ...FAN_ELECTRICITY,
        },
    },
];

/** Types the adapter detects but does not expose to Matter, so they have no endpoint to pin. */
export const CONTROLLER_ONLY_TYPES: ReadonlySet<string> = new Set(
    AUTHORED_DEVICES.filter(device => device.controllerOnly).map(device => device.type),
);

function targetId(device: DeviceSpec, name: string): string {
    return `${TARGET_ROOT}.${device.name}-${name}`;
}

/** The object tree the authored devices form: a channel, its alias states and their `0_userdata` targets. */
export function authoredObjects(): ObjectMap {
    const objects: ObjectMap = {
        [TARGET_ROOT]: {
            _id: TARGET_ROOT,
            type: 'folder',
            common: { name: 'V6-States' },
            native: {},
        } as ioBroker.Object,
    };

    for (const device of AUTHORED_DEVICES) {
        const channelId = `${ALIAS_ROOT}.${device.name}`;
        objects[channelId] = {
            _id: channelId,
            type: 'channel',
            common: { name: device.name, role: device.channelRole },
            native: {},
        } as ioBroker.Object;

        for (const [name, spec] of Object.entries(device.states)) {
            const target = targetId(device, name);
            const common = {
                name,
                type: spec.type,
                role: spec.role,
                read: true,
                write: spec.write ?? false,
                unit: spec.unit,
                min: spec.min,
                max: spec.max,
                states: spec.states ? labelled(spec.states) : undefined,
            };
            objects[`${channelId}.${name}`] = {
                _id: `${channelId}.${name}`,
                type: 'state',
                common: { ...common, alias: { id: target } },
                native: {},
            } as ioBroker.Object;
            objects[target] = {
                _id: target,
                type: 'state',
                common: { ...common, name: `${device.name}-${name}` },
                native: {},
            } as ioBroker.Object;
        }
    }
    return objects;
}

/** The value each authored target holds, so a snapshot shows the conversion and not a seeded default. */
export function authoredValues(): { id: string; value: number | boolean | string }[] {
    const values = new Array<{ id: string; value: number | boolean | string }>();
    for (const device of AUTHORED_DEVICES) {
        for (const [name, spec] of Object.entries(device.states)) {
            if (spec.value !== undefined) {
                values.push({ id: targetId(device, name), value: spec.value });
            }
        }
    }
    return values;
}

/** Bridge entries configured the way the admin UI writes them for a picked channel. */
export function authoredBridgeEntries(): BridgeDeviceDescription[] {
    return AUTHORED_DEVICES.map(device => ({
        uuid: device.uuid,
        name: device.name,
        oid: `${ALIAS_ROOT}.${device.name}`,
        type: device.type,
        enabled: true,
        noComposed: false,
        auto: true,
        actionAllowedByIdentify: false,
    })) as BridgeDeviceDescription[];
}
