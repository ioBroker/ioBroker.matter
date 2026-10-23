import ChannelDetector from '@iobroker/type-detector';
import {
    FlowMeasurement,
    LevelControl as MatterLevelControl,
    OnOff as MatterOnOff,
    PressureMeasurement,
    TemperatureMeasurement,
} from '@matter/main/clusters';
import { LevelControlClient } from '@matter/main/behaviors';
import type { Endpoint, ClientNode } from '@matter/main';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { DetectedDevice, DeviceOptions } from '../../lib/devices/GenericDevice';
import { Pump } from '../../lib/devices/Pump';
import { GenericElectricityDataDeviceToIoBroker } from './GenericElectricityDataDeviceToIoBroker';
import type { MatterAdapter } from '../../main';
import { MatterConverters, PumpLevel } from '../ConversionUtils';
import { OnOffLevelCommands } from './OnOffLevelCommands';

export class PumpToIoBroker extends GenericElectricityDataDeviceToIoBroker {
    readonly #ioBrokerDevice: Pump;
    readonly #onOffLevel = new OnOffLevelCommands(
        this.onOffLevelTarget,
        PumpLevel,
        percent => this.#ioBrokerDevice.updateLevel(percent),
        { min: PumpLevel.STOPPED, max: PumpLevel.FULL_SPEED },
    );

    constructor(
        node: ClientNode,
        endpoint: Endpoint,
        rootEndpoint: Endpoint,
        adapter: MatterAdapter,
        endpointDeviceBaseId: string,
        deviceTypeName: string,
        defaultConnectionStateId: string,
        defaultName: string,
    ) {
        super(
            adapter,
            node,
            endpoint,
            rootEndpoint,
            endpointDeviceBaseId,
            deviceTypeName,
            defaultConnectionStateId,
            defaultName,
        );

        this.#ioBrokerDevice = new Pump(
            { ...ChannelDetector.getPatterns().pump, isIoBrokerDevice: false } as DetectedDevice,
            adapter,
            this.enableDeviceTypeStates(),
        );
    }

    override async init(delayStateInit = false): Promise<void> {
        await super.init(delayStateInit);

        const levelControl = this.appEndpoint.maybeStateOf(LevelControlClient);
        if (levelControl !== undefined) {
            this.#onOffLevel.levelRange = {
                min: levelControl.minLevel ?? PumpLevel.STOPPED,
                max: levelControl.maxLevel ?? PumpLevel.FULL_SPEED,
            };
        }
    }

    protected enableDeviceTypeStates(): DeviceOptions {
        const endpointId = this.appEndpoint.number;

        this.enableDeviceTypeStateForAttribute(PropertyType.Power, {
            endpointId,
            clusterId: MatterOnOff.id,
            attributeName: 'onOff',
            changeHandler: (value: boolean) => this.#onOffLevel.setPower(value),
        });

        this.enableDeviceTypeStateForAttribute(PropertyType.Level, {
            endpointId,
            clusterId: MatterLevelControl.id,
            attributeName: 'currentLevel',
            convertValue: (value: number | null) => (value === null ? undefined : PumpLevel.toPercent(value)),
            changeHandler: (value: number) => this.#onOffLevel.setLevel(value),
        });

        this.enableDeviceTypeStateForAttribute(PropertyType.Temperature, {
            endpointId,
            clusterId: TemperatureMeasurement.id,
            attributeName: 'measuredValue',
            convertValue: (value: number | null) =>
                value === null ? undefined : MatterConverters.fromMatterHundredths(value),
        });
        this.enableDeviceTypeStateForAttribute(PropertyType.Pressure, {
            endpointId,
            clusterId: PressureMeasurement.id,
            attributeName: 'measuredValue',
            // Matter MeasuredValue = 10 x Pressure[kPa] and 1 kPa = 10 mbar, so the factors cancel out
            convertValue: (value: number | null) => (value === null ? undefined : value),
        });
        this.enableDeviceTypeStateForAttribute(PropertyType.Flow, {
            endpointId,
            clusterId: FlowMeasurement.id,
            attributeName: 'measuredValue',
            // Matter MeasuredValue = 10 x Flow[m³/h], and the ioBroker FLOW state is m³/h
            convertValue: (value: number | null) => (value === null ? undefined : value / 10),
        });

        return super.enableDeviceTypeStates();
    }

    get ioBrokerDevice(): Pump {
        return this.#ioBrokerDevice;
    }
}
