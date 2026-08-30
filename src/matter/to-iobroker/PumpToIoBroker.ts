import ChannelDetector from '@iobroker/type-detector';
import {
    FlowMeasurement,
    LevelControl as MatterLevelControl,
    OnOff as MatterOnOff,
    PressureMeasurement,
    TemperatureMeasurement,
} from '@matter/main/clusters';
import { LevelControlClient, OnOffClient } from '@matter/main/behaviors';
import type { Endpoint } from '@matter/main';
import type { PairedNode } from '@project-chip/matter.js/device';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { DetectedDevice, DeviceOptions } from '../../lib/devices/GenericDevice';
import { Pump } from '../../lib/devices/Pump';
import { GenericElectricityDataDeviceToIoBroker } from './GenericElectricityDataDeviceToIoBroker';
import type { MatterAdapter } from '../../main';
import { MatterConverters } from '../ConversionUtils';

const MAX_LEVEL_VALUE = 0xfe;

export class PumpToIoBroker extends GenericElectricityDataDeviceToIoBroker {
    readonly #ioBrokerDevice: Pump;
    #minLevel = 0;
    #maxLevel = MAX_LEVEL_VALUE;

    constructor(
        node: PairedNode,
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
            // A pump LevelControl does not use the Lighting feature, so 0 is a valid setpoint unless declared otherwise
            this.#minLevel = levelControl.minLevel ?? 0;
            this.#maxLevel = levelControl.maxLevel ?? MAX_LEVEL_VALUE;
        }
    }

    protected enableDeviceTypeStates(): DeviceOptions {
        const endpointId = this.appEndpoint.number;

        this.enableDeviceTypeStateForAttribute(PropertyType.Power, {
            endpointId,
            clusterId: MatterOnOff.id,
            attributeName: 'onOff',
            changeHandler: async value => {
                if (value) {
                    await this.appEndpoint.commandsOf(OnOffClient)?.on();
                } else {
                    await this.appEndpoint.commandsOf(OnOffClient)?.off();
                }
            },
        });

        this.enableDeviceTypeStateForAttribute(PropertyType.Level, {
            endpointId,
            clusterId: MatterLevelControl.id,
            attributeName: 'currentLevel',
            convertValue: (value: number | null) => (value === null ? undefined : Math.round((value / 254) * 100)),
            changeHandler: async (value: number) => {
                let level = Math.round((value / 100) * 254);
                if (level < this.#minLevel) {
                    level = this.#minLevel;
                } else if (level > this.#maxLevel) {
                    level = this.#maxLevel;
                }
                await this.appEndpoint.commandsOf(LevelControlClient).moveToLevel({
                    level,
                    transitionTime: null,
                    optionsMask: { executeIfOff: true },
                    optionsOverride: { executeIfOff: true },
                });
            },
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
