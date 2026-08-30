/**
 * Test fixture: a Matter bridge that exposes one endpoint per Matter device type the controller direction maps,
 * plus the device types it does not map yet.
 *
 * Run as its own process so it is a real Matter peer on the network:
 *   npx ts-node --project tsconfig.test.json test/fixtures/TestBridgeDevice.ts --storage-path=<path> --port=<port>
 */

import { Endpoint, Environment, ServerNode, VendorId } from '@matter/main';
import {
    BridgedDeviceBasicInformationServer,
    ColorControlServer,
    OccupancySensingServer,
    PowerSourceServer,
    PumpConfigurationAndControlServer,
    SmokeCoAlarmServer,
    SwitchServer,
    ThermostatServer,
    WindowCoveringServer,
} from '@matter/main/behaviors';
import { AggregatorEndpoint } from '@matter/main/endpoints';
import {
    AirQuality,
    ColorControl,
    DoorLock,
    FanControl,
    OccupancySensing,
    PowerSource,
    PumpConfigurationAndControl,
    SmokeCoAlarm,
    Thermostat,
    WindowCovering,
} from '@matter/main/clusters';
import * as Devices from '@matter/main/devices';
import { BRIDGE_DISCRIMINATOR, BRIDGE_PASSCODE, BRIDGE_PORT_BASE, READY_MARKER } from './bridgeConstants';

const args = process.argv.slice(2);
const argValue = (name: string): string | undefined => args.find(a => a.startsWith(`--${name}=`))?.split('=')[1];

const storagePath = argValue('storage-path') ?? '.bridge-storage';
const portArg = argValue('port');
const port = portArg !== undefined ? Number.parseInt(portArg, 10) : BRIDGE_PORT_BASE;

/** Loose shape of a matter.js device definition; the fixture only ever calls `with()` on it. */
type DeviceDefinition = { with: (...behaviors: any[]) => any };

async function main(): Promise<void> {
    const env = Environment.default;
    env.vars.set('storage.path', storagePath);
    // Without this, mDNS may announce only VPN/tunnel addresses the controller cannot reach
    const mdnsInterface = process.env.MATTER_MDNS_NETWORK_INTERFACE;
    if (mdnsInterface) {
        env.vars.set('mdns.networkInterface', mdnsInterface);
    }

    const node = await ServerNode.create({
        network: { port },
        commissioning: { passcode: BRIDGE_PASSCODE, discriminator: BRIDGE_DISCRIMINATOR },
        productDescription: { name: 'ioBroker Mapping Test Bridge', deviceType: AggregatorEndpoint.deviceType },
        basicInformation: {
            vendorName: 'ioBroker Test',
            vendorId: VendorId(0xfff1),
            productName: 'Mapping Test Bridge',
            productId: 0x8000,
            serialNumber: 'MAPPING-TEST-BRIDGE',
            uniqueId: 'iobroker-mapping-test-bridge',
        },
        subscriptions: { persistenceEnabled: false },
    });

    const aggregator = new Endpoint(AggregatorEndpoint, { id: 'bridge' });
    await node.add(aggregator);

    let serial = 0;
    const addBridged = async (
        id: string,
        definition: DeviceDefinition,
        state: Record<string, unknown> = {},
        extraBehaviors = new Array<unknown>(),
    ): Promise<void> => {
        serial++;
        await aggregator.add(definition.with(BridgedDeviceBasicInformationServer, ...extraBehaviors), {
            id,
            bridgedDeviceBasicInformation: {
                nodeLabel: id,
                productName: id,
                productLabel: id,
                serialNumber: `TEST-${String(serial).padStart(3, '0')}`,
                uniqueId: `unique-${id}`,
                reachable: true,
            },
            ...state,
        });
    };

    await addBridged('contact', Devices.ContactSensorDevice, { booleanState: { stateValue: true } });
    await addBridged('onofflight', Devices.OnOffLightDevice, { onOff: { onOff: true } });
    await addBridged('dimmable', Devices.DimmableLightDevice, {
        onOff: { onOff: true },
        levelControl: { currentLevel: 128 },
    });
    await addBridged('colortemp', Devices.ColorTemperatureLightDevice, {
        onOff: { onOff: true },
        levelControl: { currentLevel: 200 },
        colorControl: {
            colorTempPhysicalMinMireds: 147,
            colorTempPhysicalMaxMireds: 500,
            coupleColorTempToLevelMinMireds: 147,
            colorTemperatureMireds: 250,
            colorMode: ColorControl.ColorMode.ColorTemperatureMireds,
        },
    });
    await addBridged(
        'extendedcolor',
        Devices.ExtendedColorLightDevice,
        {
            onOff: { onOff: true },
            levelControl: { currentLevel: 254 },
            colorControl: {
                currentHue: 100,
                currentSaturation: 200,
                colorTempPhysicalMinMireds: 147,
                colorTempPhysicalMaxMireds: 500,
                coupleColorTempToLevelMinMireds: 147,
                colorTemperatureMireds: 300,
                colorMode: ColorControl.ColorMode.CurrentHueAndCurrentSaturation,
            },
        },
        [ColorControlServer.with('HueSaturation', 'ColorTemperature', 'Xy')],
    );
    await addBridged('onoffplug', Devices.OnOffPlugInUnitDevice, { onOff: { onOff: false } });
    await addBridged('dimmableplug', Devices.DimmablePlugInUnitDevice, {
        onOff: { onOff: true },
        levelControl: { currentLevel: 64 },
    });
    await addBridged('doorlock', Devices.DoorLockDevice, {
        doorLock: {
            lockState: DoorLock.LockState.Locked,
            lockType: DoorLock.LockType.DeadBolt,
            actuatorEnabled: true,
            operatingMode: DoorLock.OperatingMode.Normal,
            wrongCodeEntryLimit: 5,
            userCodeTemporaryDisableTime: 10,
        },
    });
    await addBridged(
        'windowcovering',
        Devices.WindowCoveringDevice,
        {
            windowCovering: {
                type: WindowCovering.WindowCoveringType.Rollershade,
                endProductType: WindowCovering.EndProductType.RollerShade,
                currentPositionLiftPercent100ths: 3000,
            },
        },
        [WindowCoveringServer.with('Lift', 'PositionAwareLift', 'AbsolutePosition')],
    );
    await addBridged(
        'occupancy',
        Devices.OccupancySensorDevice,
        {
            occupancySensing: {
                occupancy: { occupied: true },
                occupancySensorType: OccupancySensing.OccupancySensorType.Pir,
                occupancySensorTypeBitmap: { pir: true },
            },
        },
        [OccupancySensingServer.with('PassiveInfrared')],
    );
    await addBridged('temperature', Devices.TemperatureSensorDevice, {
        temperatureMeasurement: { measuredValue: 2150 },
    });
    await addBridged('humidity', Devices.HumiditySensorDevice, {
        relativeHumidityMeasurement: { measuredValue: 5500 },
    });
    await addBridged('lightsensor', Devices.LightSensorDevice, { illuminanceMeasurement: { measuredValue: 5000 } });
    await addBridged(
        'genericswitch',
        Devices.GenericSwitchDevice,
        { switch: { numberOfPositions: 2, currentPosition: 0 } },
        [SwitchServer.with('MomentarySwitch', 'MomentarySwitchRelease', 'MomentarySwitchLongPress')],
    );
    await addBridged(
        'genericswitchlatching',
        Devices.GenericSwitchDevice,
        { switch: { numberOfPositions: 2, currentPosition: 0 } },
        [SwitchServer.with('LatchingSwitch')],
    );
    await addBridged('speaker', Devices.SpeakerDevice, {
        onOff: { onOff: false },
        levelControl: { currentLevel: 100 },
    });
    await addBridged('waterleak', Devices.WaterLeakDetectorDevice, { booleanState: { stateValue: false } });
    await addBridged(
        'thermostat',
        Devices.ThermostatDevice,
        {
            thermostat: {
                localTemperature: 2100,
                occupiedHeatingSetpoint: 2200,
                systemMode: Thermostat.SystemMode.Heat,
                controlSequenceOfOperation: Thermostat.ControlSequenceOfOperation.HeatingOnly,
            },
        },
        [ThermostatServer.with('Heating')],
    );
    const smokeCoAlarmState = {
        smokeCoAlarm: {
            expressedState: SmokeCoAlarm.ExpressedState.Normal,
            smokeState: SmokeCoAlarm.AlarmState.Normal,
            batteryAlert: SmokeCoAlarm.AlarmState.Normal,
            testInProgress: false,
            hardwareFaultAlert: false,
            endOfServiceAlert: SmokeCoAlarm.EndOfService.Normal,
        },
    };
    await addBridged(
        'smokecoalarm',
        Devices.SmokeCoAlarmDevice,
        {
            ...smokeCoAlarmState,
            powerSource: {
                status: PowerSource.PowerSourceStatus.Active,
                order: 0,
                description: 'Battery',
                batChargeLevel: PowerSource.BatChargeLevel.Ok,
                batPercentRemaining: 180,
                batReplacementNeeded: false,
                batReplaceability: PowerSource.BatReplaceability.UserReplaceable,
            },
        },
        [SmokeCoAlarmServer.with('SmokeAlarm'), PowerSourceServer.with('Battery')],
    );
    // Same alarm without a PowerSource cluster: the converter takes its root-endpoint fallback path there.
    await addBridged('smokecoalarmmains', Devices.SmokeCoAlarmDevice, smokeCoAlarmState, [
        SmokeCoAlarmServer.with('SmokeAlarm'),
    ]);
    await addBridged(
        'airconditioner',
        Devices.RoomAirConditionerDevice,
        {
            onOff: { onOff: true },
            thermostat: {
                localTemperature: 2400,
                occupiedCoolingSetpoint: 2000,
                systemMode: Thermostat.SystemMode.Cool,
                controlSequenceOfOperation: Thermostat.ControlSequenceOfOperation.CoolingOnly,
            },
        },
        [ThermostatServer.with('Cooling')],
    );

    // Device types the adapter maps towards Matter but not back from Matter.
    await addBridged('flow', Devices.FlowSensorDevice, { flowMeasurement: { measuredValue: 120 } });
    await addBridged('pressure', Devices.PressureSensorDevice, { pressureMeasurement: { measuredValue: 1013 } });
    await addBridged('airquality', Devices.AirQualitySensorDevice, {
        airQuality: { airQuality: AirQuality.AirQualityEnum.Good },
    });
    await addBridged('fan', Devices.FanDevice, {
        fanControl: {
            fanMode: FanControl.FanMode.Off,
            fanModeSequence: FanControl.FanModeSequence.OffLowMedHigh,
            percentCurrent: 0,
            percentSetting: 0,
        },
    });
    await addBridged('airpurifier', Devices.AirPurifierDevice, {
        fanControl: {
            fanMode: FanControl.FanMode.Off,
            fanModeSequence: FanControl.FanModeSequence.OffLowMedHigh,
            percentCurrent: 0,
            percentSetting: 0,
        },
    });
    await addBridged(
        'pump',
        Devices.PumpDevice,
        {
            onOff: { onOff: false },
            pumpConfigurationAndControl: {
                effectiveOperationMode: PumpConfigurationAndControl.OperationMode.Normal,
                effectiveControlMode: PumpConfigurationAndControl.ControlMode.ConstantSpeed,
                capacity: null,
                operationMode: PumpConfigurationAndControl.OperationMode.Normal,
            },
        },
        [PumpConfigurationAndControlServer.with('ConstantSpeed')],
    );

    console.log(`Storage path: ${storagePath}`);
    console.log(`Bridge endpoints: ${[...aggregator.parts].map(part => part.id).join(', ')}`);

    // Only announce readiness once the node is online: before that it is not yet advertising over mDNS and a
    // controller starting immediately would search for a device that cannot answer.
    node.lifecycle.online.on(() => console.log(READY_MARKER));

    const shutdown = (signal: string): void => {
        console.log(`Received ${signal}, shutting down...`);
        node.cancel()
            .then(() => process.exit(0))
            .catch(() => process.exit(1));
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    await node.run();
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
