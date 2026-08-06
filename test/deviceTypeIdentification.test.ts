import { strictEqual } from 'node:assert';
import type { Endpoint } from '@matter/main';
import { childEndpointsAreOwnDevices, identifyDeviceTypes } from '../src/matter/to-iobroker/ioBrokerFactory';

const AGGREGATOR = 0x000e;
const POWER_SOURCE = 0x0011;
const BRIDGED_NODE = 0x0013;
const OCCUPANCY_SENSOR = 0x0107;

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

    it('lets an endpoint with an application device type own its parts', () => {
        strictEqual(forEndpoint(3, OCCUPANCY_SENSOR), false);
        strictEqual(forEndpoint(3, BRIDGED_NODE, OCCUPANCY_SENSOR), false);
    });

    it('leaves the children of the root endpoint to the caller', () => {
        strictEqual(forEndpoint(0, AGGREGATOR), false);
    });

    it('claims nothing for an endpoint without a known device type', () => {
        strictEqual(forEndpoint(3), false);
    });
});
