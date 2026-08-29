import { Endpoint, type Behavior, type MaybePromise, type Transitions } from '@matter/main';
import { PumpDevice } from '@matter/main/devices';
import { PumpConfigurationAndControl, type LevelControl } from '@matter/main/clusters';
import {
    FlowMeasurementServer,
    LevelControlServer,
    OnOffServer,
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

/**
 * Pump's LevelControl (unlike the Dimmer/Volume lighting- or speaker-flavored ones) does not enable the
 * Lighting feature, so 0 is a representable speed setpoint once minLevel is lowered to it. Otherwise identical to
 * EventedLightingLevelControlServer/EventedSpeakerLevelControlServer: collapse a transition into one event with
 * the target level so intermediate Move/Step steps don't each turn into a separate ioBroker write.
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

const MIN_LEVEL_VALUE = 0;
const MAX_LEVEL_VALUE = 0xfe;

/** Mapping Logic to map an ioBroker Pump device to a Matter PumpDevice. */
export class PumpToMatter extends GenericElectricityDataDeviceToMatter {
    readonly #ioBrokerDevice: Pump;
    readonly #matterEndpoint: Endpoint<IoBrokerPumpDevice>;

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
            // The cluster schema defaults minLevel to 1, which would reject a stopped pump's level of 0
            this.#matterEndpoint.behaviors.require(EventedPumpLevelControlServer, { minLevel: MIN_LEVEL_VALUE });
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

        await this.#initializeOnOff();
        this.#initializeOperationAndControlMode();
        if (this.#ioBrokerDevice.hasLevel()) {
            await this.#initializeLevel();
        }
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
                    await this.#matterEndpoint.setStateOf(OnOffServer, { onOff: !!event.value });
                    await this.#updatePumpStatus();
                    break;
                case PropertyType.Level: {
                    if (!this.#ioBrokerDevice.hasLevel() || typeof event.value !== 'number') {
                        break;
                    }
                    const value = this.#ioBrokerDevice.cropValue(event.value, 0, 100);
                    await this.#matterEndpoint.setStateOf(EventedPumpLevelControlServer, {
                        currentLevel: this.#asMatterLevel(value),
                    });
                    await this.#updatePumpStatus();
                    break;
                }
                case PropertyType.Temperature:
                    if (this.#ioBrokerDevice.hasTemperature() && typeof event.value === 'number') {
                        await this.#matterEndpoint.setStateOf(TemperatureMeasurementServer, {
                            measuredValue: this.#toMatterTemperature(event.value),
                        });
                    }
                    break;
                case PropertyType.Pressure:
                    if (this.#ioBrokerDevice.hasPressure() && typeof event.value === 'number') {
                        await this.#matterEndpoint.setStateOf(PressureMeasurementServer, {
                            measuredValue: this.#toMatterPressure(event.value),
                        });
                    }
                    break;
                case PropertyType.Flow:
                    if (this.#ioBrokerDevice.hasFlow() && typeof event.value === 'number') {
                        await this.#matterEndpoint.setStateOf(FlowMeasurementServer, {
                            measuredValue: this.#toMatterFlow(event.value),
                        });
                    }
                    break;
            }
        });
    }

    /** Updates the PumpStatus.running bit from the current on/off and (if present) level state. */
    async #updatePumpStatus(): Promise<void> {
        const on = !!this.#ioBrokerDevice.getPower();
        const level = this.#ioBrokerDevice.hasLevel() ? this.#ioBrokerDevice.getLevel() : undefined;
        await this.#matterEndpoint.setStateOf(PumpConfigurationAndControlServer, {
            pumpStatus: { running: on && (level === undefined || level > 0) },
        });
    }

    async #initializeOnOff(): Promise<void> {
        await this.#matterEndpoint.setStateOf(OnOffServer, { onOff: !!this.#ioBrokerDevice.getPower() });
        await this.#updatePumpStatus();

        const onOffEvents = this.#matterEndpoint.eventsOf(OnOffServer);
        if (onOffEvents?.onOff$Changed !== undefined) {
            this.matterEvents.on(onOffEvents.onOff$Changed, async (value, _oldValue, context) => {
                if (hasLocalActor(context)) {
                    return;
                }
                await this.#ioBrokerDevice.setPower(!!value);
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

    async #initializeLevel(): Promise<void> {
        const ioBrokerDevice = this.#ioBrokerDevice;
        const level = ioBrokerDevice.cropValue(ioBrokerDevice.getLevel() ?? 100, 0, 100);
        await this.#matterEndpoint.setStateOf(EventedPumpLevelControlServer, {
            currentLevel: this.#asMatterLevel(level),
        });

        this.matterEvents.on(this.#matterEndpoint.eventsOf(IoBrokerEvents).dimmerLevelControlled, async level => {
            await ioBrokerDevice.setLevel(this.#asIoBrokerLevel(level));
            await this.#updatePumpStatus();
        });
    }

    async #initializeTemperature(): Promise<void> {
        const value = this.#ioBrokerDevice.getTemperature();
        await this.#matterEndpoint.setStateOf(TemperatureMeasurementServer, {
            measuredValue: typeof value === 'number' ? this.#toMatterTemperature(value) : null,
        });
    }

    async #initializePressure(): Promise<void> {
        const value = this.#ioBrokerDevice.getPressure();
        await this.#matterEndpoint.setStateOf(PressureMeasurementServer, {
            measuredValue: typeof value === 'number' ? this.#toMatterPressure(value) : null,
        });
    }

    async #initializeFlow(): Promise<void> {
        const value = this.#ioBrokerDevice.getFlow();
        await this.#matterEndpoint.setStateOf(FlowMeasurementServer, {
            measuredValue: typeof value === 'number' ? this.#toMatterFlow(value) : null,
        });
    }

    /** Converts the given value in 0..100 range to a valid Level Matter value. */
    #asMatterLevel(value: number): number {
        return this.#ioBrokerDevice.cropValue(Math.round((value / 100) * 254), MIN_LEVEL_VALUE, MAX_LEVEL_VALUE);
    }

    /** Converts the given Matter Level value (0..254) to a 0..100 percent value. */
    #asIoBrokerLevel(value: number): number {
        return this.#ioBrokerDevice.cropValue(Math.round((value / 254) * 100), 0, 100);
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
