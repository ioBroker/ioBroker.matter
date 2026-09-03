import ChannelDetector from '@iobroker/type-detector';
import { FanControl as MatterFanControl, OnOff as MatterOnOff } from '@matter/main/clusters';
import { FanControlClient, OnOffClient } from '@matter/main/behaviors';
import type { Endpoint } from '@matter/main';
import type { PairedNode } from '@project-chip/matter.js/device';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { DetectedDevice, DeviceOptions } from '../../lib/devices/GenericDevice';
import {
    Fan,
    FanAirflowDirection,
    FanAirflowDirectionNumbers,
    FanSpeed,
    FanSpeedNumbers,
    FanSwing,
    FanSwingNumbers,
} from '../../lib/devices/Fan';
import { mapFanModeToSpeed, mapSpeedToFanMode } from '../FanControlUtils';
import { GenericElectricityDataDeviceToIoBroker } from './GenericElectricityDataDeviceToIoBroker';
import type { MatterAdapter } from '../../main';

export class FanToIoBroker extends GenericElectricityDataDeviceToIoBroker {
    readonly #ioBrokerDevice: Fan;

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

        this.#ioBrokerDevice = this.createIoBrokerDevice(adapter, this.enableDeviceTypeStates());
    }

    /**
     * Device types that embed a fan build their own ioBroker device on top of the shared FanControl mapping.
     * Called from this constructor, so an override must not touch its own class fields yet.
     */
    protected createIoBrokerDevice(adapter: MatterAdapter, options: DeviceOptions): Fan {
        return new Fan(
            { ...ChannelDetector.getPatterns().fan, isIoBrokerDevice: false } as DetectedDevice,
            adapter,
            options,
        );
    }

    /**
     * The steps a controller may offer follow fanModeSequence, which is what the device renders its own UI from.
     * Matter knows no Quiet or Turbo step, so those two ioBroker speeds can never be reported.
     */
    #speedModes(): { [key: number]: FanSpeed } {
        const sequence = this.appEndpoint.maybeStateOf(FanControlClient)?.fanModeSequence;
        const modes: { [key: number]: FanSpeed } = { [FanSpeedNumbers.HIGH]: FanSpeed.High };
        if (
            sequence === undefined ||
            sequence === MatterFanControl.FanModeSequence.OffLowHigh ||
            sequence === MatterFanControl.FanModeSequence.OffLowHighAuto ||
            sequence === MatterFanControl.FanModeSequence.OffLowMedHigh ||
            sequence === MatterFanControl.FanModeSequence.OffLowMedHighAuto
        ) {
            modes[FanSpeedNumbers.LOW] = FanSpeed.Low;
        }
        if (
            sequence === undefined ||
            sequence === MatterFanControl.FanModeSequence.OffLowMedHigh ||
            sequence === MatterFanControl.FanModeSequence.OffLowMedHighAuto
        ) {
            modes[FanSpeedNumbers.MEDIUM] = FanSpeed.Medium;
        }
        if (
            sequence === undefined ||
            sequence === MatterFanControl.FanModeSequence.OffHighAuto ||
            sequence === MatterFanControl.FanModeSequence.OffLowHighAuto ||
            sequence === MatterFanControl.FanModeSequence.OffLowMedHighAuto
        ) {
            modes[FanSpeedNumbers.AUTO] = FanSpeed.Auto;
        }
        return modes;
    }

    protected enableDeviceTypeStates(): DeviceOptions {
        const endpointId = this.appEndpoint.number;

        this.enableDeviceTypeStateForAttribute(PropertyType.Speed, {
            endpointId,
            clusterId: MatterFanControl.id,
            attributeName: 'fanMode',
            modes: this.#speedModes(),
            convertValue: (value: MatterFanControl.FanMode) => mapFanModeToSpeed(value),
            changeHandler: async (value: FanSpeed) => {
                const fanMode = mapSpeedToFanMode(value, (speed, reportedAs) =>
                    this.#ioBrokerDevice.adapter.log.debug(
                        `${this.baseId}: Matter has no ${speed} fan speed, controlling as ${reportedAs}`,
                    ),
                );
                if (fanMode === undefined) {
                    return;
                }
                await this.appEndpoint.setStateOf(FanControlClient, { fanMode });
            },
        });

        this.enableDeviceTypeStateForAttribute(PropertyType.SpeedLevel, {
            endpointId,
            clusterId: MatterFanControl.id,
            attributeName: 'percentCurrent',
            changeHandler: async (value: number) => {
                const percentSetting = Math.max(0, Math.min(100, Math.round(value)));
                await this.appEndpoint.setStateOf(FanControlClient, { percentSetting });
            },
        });

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
        // OnOff is optional on a Fan; where it is missing this is a no-op, since the call above already owns POWER.
        // fanMode is the authority for off, not percentCurrent: the Percent Rules already tie percentCurrent to
        // fanMode on Off, but a non-Off mode may equally report 0 while ramping up, which is not the fan being off.
        this.enableDeviceTypeStateForAttribute(PropertyType.Power, {
            endpointId,
            clusterId: MatterFanControl.id,
            attributeName: 'fanMode',
            convertValue: (value: MatterFanControl.FanMode) => value !== MatterFanControl.FanMode.Off,
            // High is the one non-off mode every fanModeSequence supports; FanMode.On would fit better semantically
            // but is deprecated and outside every sequence, so a server is free to reject it.
            changeHandler: async (value: boolean) => {
                await this.appEndpoint.setStateOf(FanControlClient, {
                    fanMode: value ? MatterFanControl.FanMode.High : MatterFanControl.FanMode.Off,
                });
            },
        });

        this.enableDeviceTypeStateForAttribute(PropertyType.Swing, {
            endpointId,
            clusterId: MatterFanControl.id,
            attributeName: 'rockSetting',
            // Matter has no Auto rocking, so the ioBroker Auto swing has no counterpart
            modes: {
                [FanSwingNumbers.HORIZONTAL]: FanSwing.Horizontal,
                [FanSwingNumbers.VERTICAL]: FanSwing.Vertical,
                [FanSwingNumbers.STATIONARY]: FanSwing.Stationary,
            },
            convertValue: (value: MatterFanControl.Rock) => {
                if (value?.rockLeftRight) {
                    return FanSwing.Horizontal;
                }
                if (value?.rockUpDown || value?.rockRound) {
                    return FanSwing.Vertical;
                }
                return FanSwing.Stationary;
            },
            changeHandler: async (value: FanSwing) => {
                await this.appEndpoint.setStateOf(FanControlClient, {
                    rockSetting: {
                        rockLeftRight: value === FanSwing.Horizontal,
                        rockUpDown: value === FanSwing.Vertical,
                        rockRound: false,
                    },
                });
            },
        });

        this.enableDeviceTypeStateForAttribute(PropertyType.AirflowDirection, {
            endpointId,
            clusterId: MatterFanControl.id,
            attributeName: 'airflowDirection',
            modes: {
                [FanAirflowDirectionNumbers.FORWARD]: FanAirflowDirection.Forward,
                [FanAirflowDirectionNumbers.REVERSE]: FanAirflowDirection.Reverse,
            },
            convertValue: (value: MatterFanControl.AirflowDirection) =>
                value === MatterFanControl.AirflowDirection.Reverse
                    ? FanAirflowDirection.Reverse
                    : FanAirflowDirection.Forward,
            changeHandler: async (value: FanAirflowDirection) => {
                await this.appEndpoint.setStateOf(FanControlClient, {
                    airflowDirection:
                        value === FanAirflowDirection.Reverse
                            ? MatterFanControl.AirflowDirection.Reverse
                            : MatterFanControl.AirflowDirection.Forward,
                });
            },
        });

        return super.enableDeviceTypeStates();
    }

    get ioBrokerDevice(): Fan {
        return this.#ioBrokerDevice;
    }
}
