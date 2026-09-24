/**
 * Test fixture: a Matter bridge that exposes one endpoint per Matter device type the controller direction maps,
 * plus the device types it does not map yet.
 *
 * Run as its own process so it is a real Matter peer on the network:
 *   npx ts-node --project tsconfig.test.json test/fixtures/TestBridgeDevice.ts --storage-path=<path> --port=<port>
 */

import { CommonAreaNamespaceTag, Endpoint, Environment, MutableEndpoint, ServerNode, VendorId } from '@matter/main';
import type { Behavior, SupportedBehaviors } from '@matter/main';
import {
    ActivatedCarbonFilterMonitoringServer,
    BridgedDeviceBasicInformationServer,
    CarbonDioxideConcentrationMeasurementServer,
    CarbonMonoxideConcentrationMeasurementServer,
    ColorControlServer,
    FanControlServer,
    FlowMeasurementServer,
    FormaldehydeConcentrationMeasurementServer,
    HepaFilterMonitoringServer,
    LevelControlServer,
    OccupancySensingServer,
    OnOffServer,
    Pm25ConcentrationMeasurementServer,
    DoorLockServer,
    PowerSourceServer,
    PressureMeasurementServer,
    PumpConfigurationAndControlServer,
    RelativeHumidityMeasurementServer,
    RvcCleanModeServer,
    RvcOperationalStateServer,
    RvcRunModeServer,
    ServiceAreaServer,
    SmokeCoAlarmServer,
    SwitchServer,
    TemperatureControlServer,
    TemperatureMeasurementServer,
    ThermostatServer,
    TotalVolatileOrganicCompoundsConcentrationMeasurementServer,
    WindowCoveringServer,
} from '@matter/main/behaviors';
import { AggregatorEndpoint, PowerSourceEndpoint } from '@matter/main/endpoints';
import { OperationalStateUtils } from '@matter/main/behaviors';
import {
    AirQuality,
    ColorControl,
    ConcentrationMeasurement,
    DoorLock,
    FanControl,
    OccupancySensing,
    PowerSource,
    PumpConfigurationAndControl,
    ResourceMonitoring,
    RvcCleanMode,
    RvcOperationalState,
    RvcRunMode,
    ServiceArea,
    SmokeCoAlarm,
    Thermostat,
    WindowCovering,
} from '@matter/main/clusters';
import * as Devices from '@matter/main/devices';
import { BRIDGE_DISCRIMINATOR, BRIDGE_PASSCODE, BRIDGE_PORT_BASE, READY_MARKER } from './bridgeConstants';

/**
 * A robot that accepts the optional operational-state commands. Matter derives the accepted command list from the
 * methods a behavior implements, so the default server would advertise none of them.
 */
class CommandingRvcOperationalStateServer extends RvcOperationalStateServer {
    override pause(): RvcOperationalState.OperationalCommandResponse {
        return OperationalStateUtils.assertRvcPause(this.state.operationalState);
    }

    override resume(): RvcOperationalState.OperationalCommandResponse {
        return OperationalStateUtils.assertRvcResume(this.state.operationalState);
    }

    override goHome(): RvcOperationalState.OperationalCommandResponse {
        return OperationalStateUtils.assertRvcGoHome(this.state.operationalState);
    }
}

const args = process.argv.slice(2);
const argValue = (name: string): string | undefined => args.find(a => a.startsWith(`--${name}=`))?.split('=')[1];

const storagePath = argValue('storage-path') ?? '.bridge-storage';
const portArg = argValue('port');
const port = portArg !== undefined ? Number.parseInt(portArg, 10) : BRIDGE_PORT_BASE;

/** Loose shape of a matter.js device definition; the fixture only ever calls `with()` on it. */
type DeviceDefinition = { with: (...behaviors: SupportedBehaviors.List) => MutableEndpoint };

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
        extraBehaviors: Behavior.Type[] = new Array<Behavior.Type>(),
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
    await addBridged(
        'doorlock',
        Devices.DoorLockDevice,
        {
            doorLock: {
                lockState: DoorLock.LockState.Locked,
                lockType: DoorLock.LockType.DeadBolt,
                actuatorEnabled: true,
                operatingMode: DoorLock.OperatingMode.Normal,
                doorState: DoorLock.DoorState.DoorClosed,
            },
        },
        // `doorState` is conformant only with the door position sensor
        [DoorLockServer.with('DoorPositionSensor')],
    );
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
        [WindowCoveringServer.with('Lift', 'PositionAwareLift')],
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

    // Not mapped by the adapter, so it exercises the UtilityOnlyToIoBroker fallback
    await addBridged('onoffsensor', Devices.OnOffSensorDevice, { onOff: { onOff: false } });

    // Device types the adapter maps back from Matter through their own controller converters.
    await addBridged('flow', Devices.FlowSensorDevice, { flowMeasurement: { measuredValue: 120 } });
    await addBridged('pressure', Devices.PressureSensorDevice, { pressureMeasurement: { measuredValue: 1013 } });
    await addBridged(
        'airquality',
        Devices.AirQualitySensorDevice,
        {
            airQuality: { airQuality: AirQuality.AirQualityEnum.Good },
            carbonDioxideConcentrationMeasurement: {
                measuredValue: 800,
                levelValue: ConcentrationMeasurement.LevelValue.Medium,
                measurementMedium: ConcentrationMeasurement.MeasurementMedium.Air,
                measurementUnit: ConcentrationMeasurement.MeasurementUnit.Ppm,
            },
            pm25ConcentrationMeasurement: {
                measuredValue: 12,
                measurementMedium: ConcentrationMeasurement.MeasurementMedium.Air,
                measurementUnit: ConcentrationMeasurement.MeasurementUnit.Ugm3,
            },
            // Reports in mg/m³ against the pattern's µg/m³ default - a Dyson air purifier does exactly this for
            // formaldehyde, and the controller mapping must scale it rather than record the raw mg value.
            formaldehydeConcentrationMeasurement: {
                measuredValue: 0.02,
                measurementMedium: ConcentrationMeasurement.MeasurementMedium.Air,
                measurementUnit: ConcentrationMeasurement.MeasurementUnit.Mgm3,
            },
            // Reports in µg/m³ (mass family) against the ppm-family default: no molar mass is available to
            // convert between the two families, so the mapping must drop this reading rather than guess.
            carbonMonoxideConcentrationMeasurement: {
                measuredValue: 5,
                measurementMedium: ConcentrationMeasurement.MeasurementMedium.Air,
                measurementUnit: ConcentrationMeasurement.MeasurementUnit.Ugm3,
            },
            // TVOC has no type-detector default unit because devices legitimately differ; the mapping's
            // canonical choice for it is ppb, so a ppm reading must scale up by 1000.
            totalVolatileOrganicCompoundsConcentrationMeasurement: {
                measuredValue: 0.5,
                measurementMedium: ConcentrationMeasurement.MeasurementMedium.Air,
                measurementUnit: ConcentrationMeasurement.MeasurementUnit.Ppm,
            },
            temperatureMeasurement: { measuredValue: 2150 },
            relativeHumidityMeasurement: { measuredValue: 4800 },
            // Not part of the AirQualitySensor device type, but the IKEA ALPSTUGA co-locates it anyway - the
            // same way real devices co-locate Pressure/Temperature/Humidity below.
            onOff: { onOff: true },
        },
        [
            CarbonDioxideConcentrationMeasurementServer.with(
                'NumericMeasurement',
                'LevelIndication',
                'MediumLevel',
                'CriticalLevel',
            ),
            Pm25ConcentrationMeasurementServer.with('NumericMeasurement'),
            FormaldehydeConcentrationMeasurementServer.with('NumericMeasurement'),
            CarbonMonoxideConcentrationMeasurementServer.with('NumericMeasurement'),
            TotalVolatileOrganicCompoundsConcentrationMeasurementServer.with('NumericMeasurement'),
            TemperatureMeasurementServer,
            RelativeHumidityMeasurementServer,
            OnOffServer,
        ],
    );
    await addBridged(
        'fan',
        Devices.FanDevice,
        {
            onOff: { onOff: true },
            fanControl: {
                fanMode: FanControl.FanMode.Medium,
                fanModeSequence: FanControl.FanModeSequence.OffLowMedHigh,
                percentCurrent: 50,
                percentSetting: 50,
                rockSupport: { rockLeftRight: true, rockUpDown: false, rockRound: false },
                rockSetting: { rockLeftRight: true, rockUpDown: false, rockRound: false },
                airflowDirection: FanControl.AirflowDirection.Forward,
            },
        },
        [OnOffServer, FanControlServer.with('Rocking', 'AirflowDirection')],
    );
    // OnOff is optional on a Fan; this one omits it, so POWER has to be derived from fanMode instead.
    await addBridged(
        'fannoonoff',
        Devices.FanDevice,
        {
            fanControl: {
                fanMode: FanControl.FanMode.Medium,
                fanModeSequence: FanControl.FanModeSequence.OffLowMedHigh,
                percentCurrent: 66,
                percentSetting: 66,
            },
        },
        [FanControlServer],
    );
    await addBridged(
        'airpurifier',
        Devices.AirPurifierDevice,
        {
            onOff: { onOff: true },
            fanControl: {
                fanMode: FanControl.FanMode.Low,
                fanModeSequence: FanControl.FanModeSequence.OffLowMedHigh,
                percentCurrent: 33,
                percentSetting: 33,
            },
            // Only the carbon filter warns, so the shared ioBroker flag must be raised by that cluster
            hepaFilterMonitoring: {
                condition: 75,
                degradationDirection: ResourceMonitoring.DegradationDirection.Down,
                changeIndication: ResourceMonitoring.ChangeIndication.Ok,
            },
            activatedCarbonFilterMonitoring: {
                condition: 60,
                degradationDirection: ResourceMonitoring.DegradationDirection.Down,
                changeIndication: ResourceMonitoring.ChangeIndication.Warning,
            },
        },
        [
            OnOffServer,
            HepaFilterMonitoringServer.with('Condition', 'Warning'),
            ActivatedCarbonFilterMonitoringServer.with('Condition', 'Warning'),
        ],
    );
    // Only the carbon filter monitors, so the state the two monitoring clusters share has to be owned by that one
    await addBridged(
        'airpurifiercarbon',
        Devices.AirPurifierDevice,
        {
            onOff: { onOff: true },
            fanControl: {
                fanMode: FanControl.FanMode.High,
                fanModeSequence: FanControl.FanModeSequence.OffLowMedHigh,
                percentCurrent: 90,
                percentSetting: 90,
            },
            activatedCarbonFilterMonitoring: {
                condition: 40,
                degradationDirection: ResourceMonitoring.DegradationDirection.Down,
                changeIndication: ResourceMonitoring.ChangeIndication.Warning,
            },
        },
        [OnOffServer, ActivatedCarbonFilterMonitoringServer.with('Condition', 'Warning')],
    );
    await addBridged(
        'pump',
        Devices.PumpDevice,
        {
            onOff: { onOff: false },
            levelControl: { currentLevel: 127, minLevel: 0 },
            pumpConfigurationAndControl: {
                effectiveOperationMode: PumpConfigurationAndControl.OperationMode.Normal,
                effectiveControlMode: PumpConfigurationAndControl.ControlMode.ConstantSpeed,
                capacity: null,
                operationMode: PumpConfigurationAndControl.OperationMode.Normal,
            },
            temperatureMeasurement: { measuredValue: 4550 },
            pressureMeasurement: { measuredValue: 2000 },
            flowMeasurement: { measuredValue: 250 },
        },
        [
            PumpConfigurationAndControlServer.with('ConstantSpeed'),
            LevelControlServer,
            TemperatureMeasurementServer,
            PressureMeasurementServer,
            FlowMeasurementServer,
        ],
    );

    // A robot with all five RVC clusters. Its mode numbers are deliberately not the ioBroker ones: they are vendor
    // defined, so only the mode tags may decide what a mode means.
    await addBridged(
        'roboticvacuum',
        Devices.RoboticVacuumCleanerDevice,
        {
            rvcRunMode: {
                supportedModes: [
                    { label: 'Idle', mode: 7, modeTags: [{ value: RvcRunMode.ModeTag.Idle }] },
                    { label: 'Cleaning', mode: 3, modeTags: [{ value: RvcRunMode.ModeTag.Cleaning }] },
                    { label: 'Mapping', mode: 9, modeTags: [{ value: RvcRunMode.ModeTag.Mapping }] },
                ],
                currentMode: 3,
            },
            rvcCleanMode: {
                supportedModes: [
                    { label: 'Vacuuming', mode: 5, modeTags: [{ value: RvcCleanMode.ModeTag.Vacuum }] },
                    { label: 'Deep Clean', mode: 2, modeTags: [{ value: RvcCleanMode.ModeTag.DeepClean }] },
                ],
                currentMode: 2,
            },
            rvcOperationalState: {
                operationalStateList: [
                    { operationalStateId: RvcOperationalState.OperationalState.Running },
                    { operationalStateId: RvcOperationalState.OperationalState.Paused },
                    { operationalStateId: RvcOperationalState.OperationalState.Error },
                    { operationalStateId: RvcOperationalState.OperationalState.SeekingCharger },
                    { operationalStateId: RvcOperationalState.OperationalState.Charging },
                    { operationalStateId: RvcOperationalState.OperationalState.Docked },
                ],
                operationalState: RvcOperationalState.OperationalState.Running,
                phaseList: ['Sweeping', 'Mopping'],
                currentPhase: 0,
            },
            serviceArea: {
                supportedMaps: [{ mapId: 0, name: 'Ground Floor' }],
                supportedAreas: [
                    {
                        areaId: 0,
                        mapId: 0,
                        areaInfo: {
                            locationInfo: {
                                locationName: 'Kitchen',
                                floorNumber: 0,
                                areaType: CommonAreaNamespaceTag.Kitchen.tag,
                            },
                            landmarkInfo: null,
                        },
                    },
                    {
                        areaId: 1,
                        mapId: 0,
                        areaInfo: {
                            locationInfo: {
                                locationName: 'Living Room',
                                floorNumber: 0,
                                areaType: CommonAreaNamespaceTag.LivingRoom.tag,
                            },
                            landmarkInfo: null,
                        },
                    },
                ],
                selectedAreas: [0, 1],
                currentArea: 1,
                // One of the two selected areas is done, so the ioBroker progress percentage must be 50.
                progress: [
                    { areaId: 0, status: ServiceArea.OperationalStatus.Completed },
                    { areaId: 1, status: ServiceArea.OperationalStatus.Operating },
                ],
            },
        },
        [
            RvcRunModeServer,
            CommandingRvcOperationalStateServer,
            RvcCleanModeServer,
            ServiceAreaServer.with('SelectWhileRunning', 'ProgressReporting', 'Maps'),
        ],
    );

    // A robot that accepts no optional command and reports no clean mode, so the states behind those must not exist.
    // Its ServiceArea reports no progress at all, which is not the same as no progress having been made.
    await addBridged(
        'roboticvacuumbasic',
        Devices.RoboticVacuumCleanerDevice,
        {
            rvcRunMode: {
                supportedModes: [
                    { label: 'Idle', mode: 0, modeTags: [{ value: RvcRunMode.ModeTag.Idle }] },
                    { label: 'Cleaning', mode: 1, modeTags: [{ value: RvcRunMode.ModeTag.Cleaning }] },
                ],
                currentMode: 0,
            },
            rvcOperationalState: {
                operationalStateList: [
                    { operationalStateId: RvcOperationalState.OperationalState.Running },
                    { operationalStateId: RvcOperationalState.OperationalState.Error },
                    { operationalStateId: RvcOperationalState.OperationalState.Docked },
                ],
                operationalState: RvcOperationalState.OperationalState.Docked,
            },
            // matter.js 0.17.9 asserts supportedMaps unconditionally, so the Maps feature cannot be left out here
            serviceArea: { supportedMaps: [], supportedAreas: [], selectedAreas: [], progress: [] },
        },
        [RvcRunModeServer, RvcOperationalStateServer, ServiceAreaServer.with('ProgressReporting', 'Maps')],
    );

    /**
     * Composed devices: the children live in the parent's partsList, the way a Dyson air purifier exposes its
     * sensors. `addComposed` differs from `addBridged` only in handing the endpoint back so parts can be added.
     */
    const addComposed = async (
        id: string,
        definition: DeviceDefinition,
        state: Record<string, unknown> = {},
        extraBehaviors: Behavior.Type[] = new Array<Behavior.Type>(),
    ): Promise<Endpoint> => {
        serial++;
        return aggregator.add(definition.with(BridgedDeviceBasicInformationServer, ...extraBehaviors), {
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

    const composedPurifier = await addComposed(
        'airpurifiercomposed',
        Devices.AirPurifierDevice,
        {
            onOff: { onOff: true },
            fanControl: {
                fanMode: FanControl.FanMode.High,
                fanModeSequence: FanControl.FanModeSequence.OffLowMedHigh,
                percentCurrent: 80,
                percentSetting: 80,
            },
            hepaFilterMonitoring: {
                condition: 90,
                degradationDirection: ResourceMonitoring.DegradationDirection.Down,
                changeIndication: ResourceMonitoring.ChangeIndication.Ok,
            },
        },
        [OnOffServer, HepaFilterMonitoringServer.with('Condition', 'Warning')],
    );
    await composedPurifier.add(
        Devices.AirQualitySensorDevice.with(
            Pm25ConcentrationMeasurementServer.with('NumericMeasurement'),
            CarbonDioxideConcentrationMeasurementServer.with('NumericMeasurement'),
        ),
        {
            id: 'purifierairquality',
            airQuality: { airQuality: AirQuality.AirQualityEnum.Good },
            pm25ConcentrationMeasurement: {
                measuredValue: 7,
                measurementMedium: ConcentrationMeasurement.MeasurementMedium.Air,
                measurementUnit: ConcentrationMeasurement.MeasurementUnit.Ugm3,
            },
            carbonDioxideConcentrationMeasurement: {
                measuredValue: 620,
                measurementMedium: ConcentrationMeasurement.MeasurementMedium.Air,
                measurementUnit: ConcentrationMeasurement.MeasurementUnit.Ppm,
            },
        },
    );
    await composedPurifier.add(Devices.TemperatureSensorDevice, {
        id: 'purifiertemperature',
        temperatureMeasurement: { measuredValue: 2350 },
    });
    await composedPurifier.add(Devices.HumiditySensorDevice, {
        id: 'purifierhumidity',
        relativeHumidityMeasurement: { measuredValue: 4200 },
    });

    // Counter case: a Refrigerator composes a mandatory TemperatureControlledCabinet, so the cabinet is a part of
    // the fridge and must not turn into a device of its own.
    const composedFridge = await addComposed('fridgecomposed', Devices.RefrigeratorDevice);
    await composedFridge.add(
        Devices.TemperatureControlledCabinetDevice.with(
            TemperatureControlServer.with('TemperatureLevel'),
            TemperatureMeasurementServer,
        ),
        {
            id: 'fridgecabinet',
            temperatureControl: { selectedTemperatureLevel: 0, supportedTemperatureLevels: ['cold', 'colder'] },
            temperatureMeasurement: { measuredValue: 500 },
        },
    );

    // A mandatory child of a utility device type does not make the alarm a composition either. The two alarms
    // above pin the on-endpoint and the root-endpoint battery paths, so this case needs its own endpoint.
    const composedAlarm = await addComposed('smokecoalarmcomposed', Devices.SmokeCoAlarmDevice, smokeCoAlarmState, [
        SmokeCoAlarmServer.with('SmokeAlarm'),
    ]);
    await composedAlarm.add(PowerSourceEndpoint.with(PowerSourceServer.with('Battery')), {
        id: 'alarmpowersource',
        powerSource: {
            status: PowerSource.PowerSourceStatus.Active,
            order: 0,
            description: 'Battery',
            batChargeLevel: PowerSource.BatChargeLevel.Ok,
            batPercentRemaining: 140,
            batReplacementNeeded: false,
            batReplaceability: PowerSource.BatReplaceability.UserReplaceable,
        },
    });

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
