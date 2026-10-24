import { Endpoint, type Behavior, type MaybePromise, type Transitions } from '@matter/main';
import { PumpDevice } from '@matter/main/devices';
import { PumpConfigurationAndControl, type LevelControl } from '@matter/main/clusters';
import {
    FlowMeasurementServer,
    LevelControlServer,
    PressureMeasurementServer,
    PumpConfigurationAndControlServer,
    TemperatureMeasurementServer,
} from '@matter/main/behaviors';
import { hasLocalActor } from '@matter/main/protocol';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { Pump } from '../../lib/devices/Pump';
import { GenericElectricityDataDeviceToMatter } from './GenericElectricityDataDeviceToMatter';
import { IoIdentifyServer } from '../behaviors/IdentifyServer';
import { IoBrokerContext } from '../behaviors/IoBrokerContext';
import { IoBrokerEvents } from '../behaviors/IoBrokerEvents';
import { EventedTransitions } from '../behaviors/EventedTransitions';
import { MatterConverters, PumpLevel } from '../ConversionUtils';
import { OnOffLevelMapping } from './OnOffLevelMapping';
import { MatterOnOffAttribute } from './MatterOnOffAttribute';

/**
 * Like EventedSpeakerLevelControlServer, this server sends each level command to ioBroker as one event with its
 * target level, so the steps of a Move or Step do not each become an ioBroker write. The pump's LevelControl has
 * neither the Lighting nor the OnOff feature: matter.js initializes MinLevel to 0, so the stopped level 0 is
 * representable, and the "with on/off" commands do not switch OnOff.
 */
class EventedPumpLevelControlServer extends LevelControlServer {
    declare protected internal: EventedPumpLevelControlServer.Internal;

    override createTransitions<B extends Behavior>(config: Transitions.Configuration<B>): EventedTransitions<B> {
        const transitions = new EventedTransitions(this.endpoint, config);
        this.reactTo(transitions.currentLevel$Changed, this.#setLevel, { lock: true });
        return transitions;
    }

    override moveToLevelLogic(
        level: number,
        transitionTime: number | null,
        withOnOff: boolean,
        options?: LevelControl.Options,
    ): MaybePromise {
        this.internal.currentTransitionTime = transitionTime;
        return super.moveToLevelLogic(level, transitionTime, withOnOff, options);
    }

    override moveLogic(
        moveMode: LevelControl.MoveMode,
        rate: number | null,
        withOnOff: boolean,
        options?: LevelControl.Options,
    ): MaybePromise {
        this.internal.currentTransitionTime = undefined;
        return super.moveLogic(moveMode, rate, withOnOff, options);
    }

    override stepLogic(
        stepMode: LevelControl.StepMode,
        stepSize: number,
        transitionTime: number | null,
        withOnOff: boolean,
        options?: LevelControl.Options,
    ): MaybePromise {
        this.internal.currentTransitionTime = transitionTime;
        return super.stepLogic(stepMode, stepSize, transitionTime, withOnOff, options);
    }

    override stopLogic(options?: LevelControl.Options): MaybePromise {
        this.internal.currentTransitionTime = undefined;
        return super.stopLogic(options);
    }

    #setLevel(level: number): void {
        const transitionTime = this.internal.currentTransitionTime;
        this.internal.currentTransitionTime = undefined;
        if (transitionTime == undefined || transitionTime === 0) {
            this.state.currentLevel = level;
        }
        this.endpoint.act(agent => agent.get(IoBrokerEvents).events.dimmerLevelControlled.emit(level, transitionTime));
    }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace EventedPumpLevelControlServer {
    export class Internal extends LevelControlServer.Internal {
        currentTransitionTime?: number | null;
    }
}

const IoBrokerPumpDevice = PumpDevice.with(
    PumpConfigurationAndControlServer.with(PumpConfigurationAndControl.Feature.ConstantSpeed),
    IoIdentifyServer,
    IoBrokerContext,
    IoBrokerEvents,
);
type IoBrokerPumpDevice = typeof IoBrokerPumpDevice;

/** Mapping Logic to map an ioBroker Pump device to a Matter PumpDevice. */
export class PumpToMatter extends GenericElectricityDataDeviceToMatter {
    readonly #ioBrokerDevice: Pump;
    readonly #matterEndpoint: Endpoint<IoBrokerPumpDevice>;
    readonly #onOff: MatterOnOffAttribute;
    readonly #onOffLevel: OnOffLevelMapping;

    constructor(ioBrokerDevice: Pump, name: string, uuid: string) {
        super(name, uuid);
        this.#ioBrokerDevice = ioBrokerDevice;
        this.#matterEndpoint = new Endpoint(IoBrokerPumpDevice, {
            id: uuid,
            ioBrokerContext: {
                device: ioBrokerDevice,
                adapter: ioBrokerDevice.adapter,
            },
            pumpConfigurationAndControl: {
                operationMode: PumpConfigurationAndControl.OperationMode.Normal,
                effectiveOperationMode: PumpConfigurationAndControl.OperationMode.Normal,
                // ioBroker gives no signal for which variable a pump regulates (pressure/flow/temperature); it
                // only exposes on/off plus an optional percent speed setpoint, which is what ConstantSpeed means.
                controlMode: PumpConfigurationAndControl.ControlMode.ConstantSpeed,
                effectiveControlMode: PumpConfigurationAndControl.ControlMode.ConstantSpeed,
            },
        });

        if (ioBrokerDevice.hasLevel()) {
            // The default maxLevel 254 would let a controller computing currentLevel / maxLevel read full speed (200)
            // as 79 %
            this.#matterEndpoint.behaviors.require(EventedPumpLevelControlServer, {
                maxLevel: PumpLevel.FULL_SPEED,
            });
        }
        if (ioBrokerDevice.hasTemperature()) {
            this.#matterEndpoint.behaviors.require(TemperatureMeasurementServer);
        }
        if (ioBrokerDevice.hasPressure()) {
            this.#matterEndpoint.behaviors.require(PressureMeasurementServer);
        }
        if (ioBrokerDevice.hasFlow()) {
            this.#matterEndpoint.behaviors.require(FlowMeasurementServer);
        }

        this.addElectricityDataClusters(this.#matterEndpoint, ioBrokerDevice);

        this.#onOff = new MatterOnOffAttribute(this.#matterEndpoint);
        this.#onOffLevel = new OnOffLevelMapping(
            {
                power: { get: () => !!ioBrokerDevice.getPower(), set: on => ioBrokerDevice.setPower(on) },
                level: ioBrokerDevice.hasLevel()
                    ? { get: () => ioBrokerDevice.getLevel(), set: percent => ioBrokerDevice.setLevel(percent) }
                    : undefined,
            },
            {
                setOnOff: async value => {
                    await this.#onOff.write(value);
                    await this.#updatePumpStatus();
                },
                currentLevel: () => this.#matterEndpoint.stateOf(EventedPumpLevelControlServer).currentLevel,
                setCurrentLevel: currentLevel =>
                    this.#matterEndpoint.setStateOf(EventedPumpLevelControlServer, { currentLevel }),
            },
            PumpLevel,
        );
    }

    get matterEndpoints(): Endpoint[] {
        return [this.#matterEndpoint];
    }

    get ioBrokerDevice(): Pump {
        return this.#ioBrokerDevice;
    }

    async registerHandlersAndInitialize(): Promise<void> {
        await super.registerHandlersAndInitialize();

        await this.initializeElectricityStateHandlers(this.#matterEndpoint, this.#ioBrokerDevice);

        await this.#initializeOnOffAndLevel();
        this.#initializeOperationAndControlMode();
        if (this.#ioBrokerDevice.hasTemperature()) {
            await this.#initializeTemperature();
        }
        if (this.#ioBrokerDevice.hasPressure()) {
            await this.#initializePressure();
        }
        if (this.#ioBrokerDevice.hasFlow()) {
            await this.#initializeFlow();
        }

        this.#ioBrokerDevice.onChange(async event => {
            switch (event.property) {
                case PropertyType.Power:
                    await this.#onOffLevel.ioBrokerPowerChanged(!!event.value);
                    break;
                case PropertyType.Level:
                    if (this.#ioBrokerDevice.hasLevel()) {
                        await this.#onOffLevel.ioBrokerLevelChanged(event.value);
                    }
                    break;
                case PropertyType.Temperature:
                    if (this.#ioBrokerDevice.hasTemperature()) {
                        await this.#matterEndpoint.setStateOf(TemperatureMeasurementServer, {
                            measuredValue: MatterConverters.toMatterMeasurement(event.value, v =>
                                this.#toMatterTemperature(v),
                            ),
                        });
                    }
                    break;
                case PropertyType.Pressure:
                    if (this.#ioBrokerDevice.hasPressure()) {
                        await this.#matterEndpoint.setStateOf(PressureMeasurementServer, {
                            measuredValue: MatterConverters.toMatterMeasurement(event.value, v =>
                                this.#toMatterPressure(v),
                            ),
                        });
                    }
                    break;
                case PropertyType.Flow:
                    if (this.#ioBrokerDevice.hasFlow()) {
                        await this.#matterEndpoint.setStateOf(FlowMeasurementServer, {
                            measuredValue: MatterConverters.toMatterMeasurement(event.value, v =>
                                this.#toMatterFlow(v),
                            ),
                        });
                    }
                    break;
            }
        });
    }

    async #updatePumpStatus(): Promise<void> {
        await this.#matterEndpoint.setStateOf(PumpConfigurationAndControlServer, {
            pumpStatus: { running: this.#onOffLevel.onOff },
        });
    }

    async #initializeOnOffAndLevel(): Promise<void> {
        await this.#onOffLevel.initialize();

        this.#onOff.observe(this.matterEvents, async on => {
            await this.#onOffLevel.matterOnOffChanged(on);
            await this.#updatePumpStatus();
        });
        if (this.#ioBrokerDevice.hasLevel()) {
            this.matterEvents.on(this.#matterEndpoint.eventsOf(IoBrokerEvents).dimmerLevelControlled, async level => {
                await this.#onOffLevel.matterLevelControlled(level);
                await this.#updatePumpStatus();
            });
        }
    }

    /**
     * OperationMode/ControlMode are writable and have no ioBroker counterpart, but a controller may still write
     * them; mirror such writes into the Effective* attributes since we don't model a local-override or
     * remote-sensor condition that would otherwise decouple them (spec § 4.2.7.15/4.2.7.16).
     */
    #initializeOperationAndControlMode(): void {
        const events = this.#matterEndpoint.eventsOf(PumpConfigurationAndControlServer);
        if (events?.operationMode$Changed !== undefined) {
            this.matterEvents.on(events.operationMode$Changed, async (value, _oldValue, context) => {
                if (hasLocalActor(context)) {
                    return;
                }
                await this.#matterEndpoint.setStateOf(PumpConfigurationAndControlServer, {
                    effectiveOperationMode: value,
                });
            });
        }
        if (events?.controlMode$Changed !== undefined) {
            this.matterEvents.on(events.controlMode$Changed, async (value, _oldValue, context) => {
                if (hasLocalActor(context)) {
                    return;
                }
                await this.#matterEndpoint.setStateOf(PumpConfigurationAndControlServer, {
                    effectiveControlMode: value,
                });
            });
        }
    }

    async #initializeTemperature(): Promise<void> {
        const value = this.#ioBrokerDevice.getTemperature();
        await this.#matterEndpoint.setStateOf(TemperatureMeasurementServer, {
            measuredValue: MatterConverters.toMatterMeasurement(value, v => this.#toMatterTemperature(v)),
        });
    }

    async #initializePressure(): Promise<void> {
        const value = this.#ioBrokerDevice.getPressure();
        await this.#matterEndpoint.setStateOf(PressureMeasurementServer, {
            measuredValue: MatterConverters.toMatterMeasurement(value, v => this.#toMatterPressure(v)),
        });
    }

    async #initializeFlow(): Promise<void> {
        const value = this.#ioBrokerDevice.getFlow();
        await this.#matterEndpoint.setStateOf(FlowMeasurementServer, {
            measuredValue: MatterConverters.toMatterMeasurement(value, v => this.#toMatterFlow(v)),
        });
    }

    /** Matter TemperatureMeasurement.measuredValue = °C x 100 (int16, -27315..32767 range). */
    #toMatterTemperature(value: number): number {
        return Math.round(this.#ioBrokerDevice.cropValue(value * 100, -27_315, 32_767));
    }

    /**
     * PressureMeasurement.measuredValue = 10 x pressure[kPa]. Since 1 kPa = 10 mbar, that equals the ioBroker
     * mbar value directly; only rounding and clamping to the nullable int16 range (-32767..32767) is needed.
     */
    #toMatterPressure(value: number): number {
        return Math.round(this.#ioBrokerDevice.cropValue(value, -32_767, 32_767));
    }

    /** FlowMeasurement.measuredValue = 10 x flow[m³/h] (nullable uint16, 0..65534). */
    #toMatterFlow(value: number): number {
        return Math.round(this.#ioBrokerDevice.cropValue(value * 10, 0, 65_534));
    }
}
