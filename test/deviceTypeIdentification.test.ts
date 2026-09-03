import { strictEqual } from 'node:assert';
import type { Endpoint } from '@matter/main';
import { childEndpointsAreOwnDevices, identifyDeviceTypes } from '../src/matter/to-iobroker/ioBrokerFactory';

const AGGREGATOR = 0x000e;
const POWER_SOURCE = 0x0011;
const BRIDGED_NODE = 0x0013;
const OCCUPANCY_SENSOR = 0x0107;
const AIR_PURIFIER = 0x002d;
const ROOM_AIR_CONDITIONER = 0x0072;
const SMOKE_CO_ALARM = 0x0076;
const OVEN = 0x007b;
const VIDEO_DOORBELL = 0x0143;
const METER_REFERENCE_POINT = 0x0512;
const ELECTRICAL_UTILITY_METER = 0x0511;

function endpointWithDeviceTypes(...deviceTypes: number[]): Endpoint {
    const state = { deviceTypeList: deviceTypes.map(deviceType => ({ deviceType, revision: 1 })) };
    return { stateOf: () => state } as unknown as Endpoint;
}

describe('identifyDeviceTypes', () => {
    it('splits application and utility device types', () => {
        const { appTypes, utilityTypes } = identifyDeviceTypes(endpointWithDeviceTypes(OCCUPANCY_SENSOR, POWER_SOURCE));
        strictEqual(appTypes.length, 1);
        strictEqual(appTypes[0].deviceType.id, OCCUPANCY_SENSOR);
        strictEqual(utilityTypes.length, 1);
        strictEqual(utilityTypes[0].deviceType.id, POWER_SOURCE);
    });

    it('prefers an application device type over any utility device type', () => {
        const { primaryDeviceType } = identifyDeviceTypes(
            endpointWithDeviceTypes(BRIDGED_NODE, POWER_SOURCE, OCCUPANCY_SENSOR),
        );
        strictEqual(primaryDeviceType?.deviceType.id, OCCUPANCY_SENSOR);
    });

    it('prefers BridgedNode over another utility type declared first', () => {
        // Aqara M3 declares [PowerSource, BridgedNode]; picking PowerSource loses all child endpoints.
        const { primaryDeviceType } = identifyDeviceTypes(endpointWithDeviceTypes(POWER_SOURCE, BRIDGED_NODE));
        strictEqual(primaryDeviceType?.deviceType.id, BRIDGED_NODE);
    });

    it('treats Aggregator as an application device type', () => {
        const { appTypes, primaryDeviceType } = identifyDeviceTypes(endpointWithDeviceTypes(POWER_SOURCE, AGGREGATOR));
        strictEqual(appTypes[0]?.deviceType.id, AGGREGATOR);
        strictEqual(primaryDeviceType?.deviceType.id, AGGREGATOR);
    });

    it('falls back to the first utility type when no composition type is declared', () => {
        const { primaryDeviceType } = identifyDeviceTypes(endpointWithDeviceTypes(POWER_SOURCE));
        strictEqual(primaryDeviceType?.deviceType.id, POWER_SOURCE);
    });

    it('returns no primary device type for an endpoint without device types', () => {
        const { primaryDeviceType } = identifyDeviceTypes(endpointWithDeviceTypes());
        strictEqual(primaryDeviceType, undefined);
    });
});

describe('childEndpointsAreOwnDevices', () => {
    const forEndpoint = (endpointId: number, ...deviceTypes: number[]): boolean =>
        childEndpointsAreOwnDevices(endpointId, identifyDeviceTypes(endpointWithDeviceTypes(...deviceTypes)));

    it('treats a bridged node as a composition', () => {
        strictEqual(forEndpoint(3, POWER_SOURCE, BRIDGED_NODE), true);
    });

    it('treats an aggregator as a composition', () => {
        strictEqual(forEndpoint(1, AGGREGATOR), true);
    });

    it('treats a utility-only endpoint as a composition', () => {
        strictEqual(forEndpoint(3, POWER_SOURCE), true);
    });

    it('exposes the children of an application device type that composes nothing', () => {
        strictEqual(forEndpoint(3, OCCUPANCY_SENSOR), true);
        strictEqual(forEndpoint(3, BRIDGED_NODE, OCCUPANCY_SENSOR), true);
    });

    it('keeps the parts of a device type that composes a mandatory application device type', () => {
        // Oven composes TemperatureControlledCabinet, VideoDoorbell composes Camera and Doorbell.
        strictEqual(forEndpoint(1, OVEN), false);
        strictEqual(forEndpoint(1, VIDEO_DOORBELL), false);
        strictEqual(forEndpoint(3, BRIDGED_NODE, OVEN), false);
    });

    it('exposes the children of a device type that only offers optional application device types', () => {
        strictEqual(forEndpoint(1, AIR_PURIFIER), true);
        strictEqual(forEndpoint(1, ROOM_AIR_CONDITIONER), true);
        strictEqual(forEndpoint(1, BRIDGED_NODE, AIR_PURIFIER), true);
    });

    it('exposes the children of a device type whose mandatory child is a utility device type', () => {
        // SmokeCoAlarm composes a mandatory PowerSource, which is handled outside of the device mapping.
        strictEqual(forEndpoint(1, SMOKE_CO_ALARM), true);
    });

    it('exposes the children of a device type whose application children are conditionally required', () => {
        // MeterReferencePoint declares its ElectricalMeter children with a choice conformance, not with `M`.
        strictEqual(forEndpoint(1, METER_REFERENCE_POINT), true);
        // ElectricalUtilityMeter declares no children of its own and inherits those of MeterReferencePoint.
        strictEqual(forEndpoint(1, ELECTRICAL_UTILITY_METER), true);
    });

    it('keeps the parts when any of several application device types composes a mandatory child', () => {
        strictEqual(forEndpoint(1, AIR_PURIFIER, OVEN), false);
    });

    it('leaves the children of the root endpoint to the caller', () => {
        strictEqual(forEndpoint(0, AGGREGATOR), false);
    });

    it('claims nothing for an endpoint without a known device type', () => {
        strictEqual(forEndpoint(3), false);
    });
});
