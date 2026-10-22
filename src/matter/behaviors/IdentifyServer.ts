import { IdentifyServer } from '@matter/main/behaviors';
import { Identify } from '@matter/main/clusters';
import { Time, MaybePromise, type Timer, type Duration, Seconds } from '@matter/main';
import { IoBrokerContext } from './IoBrokerContext';
import { GenericLightingDevice } from '../../lib/devices/GenericLightingDevice';
import type { MatterAdapter } from '../../main';
import type { GenericDevice } from '../../lib/devices/GenericDevice';

export interface IdentifyState {
    currentState?: boolean;
    initialState?: boolean;
}

export class IoIdentifyServer extends IdentifyServer {
    declare protected internal: IoIdentifyServer.Internal;

    override async initialize(): Promise<void> {
        if (this.state.identifyType === undefined) {
            this.state.identifyType = Identify.IdentifyType.Display;
        }
        super.initialize();

        // Init from context
        const context = await this.agent.load(IoBrokerContext);
        this.internal.adapter = context.state.adapter as MatterAdapter;
        this.internal.device = context.state.device;

        // Register events
        this.reactTo(this.events.startIdentifying, this.startIdentifying);
        this.reactTo(this.events.stopIdentifying, this.stopIdentifying);
    }

    startIdentifying(): void {
        this.internal.identifyHandlerTimeout = Time.getPeriodicTimer('Identify', Seconds(1), () =>
            MaybePromise.then(
                () => this.handleIoIdentify(false),
                () => {},
                error => {
                    this.internal.adapter.log.warn(`Error during identify: ${error.message}`);
                },
            ),
        ).start();
        MaybePromise.then(
            () => this.handleIoIdentify(true),
            () => {},
            error => {
                this.internal.adapter.log.warn(`Error during identify: ${error.message}`);
            },
        );
    }

    stopIdentifying(): void {
        this.internal.identifyHandlerTimeout?.stop();
        this.internal.identifyHandlerTimeout = undefined;
    }

    override async [Symbol.asyncDispose](): Promise<void> {
        this.stopIdentifying();
        await super[Symbol.asyncDispose]();
    }

    handleIoIdentify(startToIdentify: boolean): MaybePromise<void> {
        if (startToIdentify) {
            // push info to UI and show popup, ideally get the name from the device
            //  or when using uuid be aware it could also be a bridged uuid
            this.internal.adapter
                .sendToGui({
                    command: 'identifyPopup',
                    identifyUuid: this.internal.device.uuid,
                })
                .catch(e => {
                    this.internal.adapter.log.info(`Error sending identifyPopup: ${e.message}`);
                });
            this.internal.adapter.log.info(`Identify started for ${this.internal.device.uuid}`);
        } else {
            this.internal.adapter.log.info(`Identify continues for ${this.internal.device.uuid}`);
        }
    }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace IoIdentifyServer {
    export class Internal extends IdentifyServer.Internal {
        identifyHandlerTimeout?: Timer;
        adapter!: MatterAdapter;
        device!: GenericDevice;
    }
}

/**
 * {@link IoIdentifyServer} for device types whose Identify requirement makes TriggerEffect mandatory, such as the
 * On/Off Plug-in Unit. The command runs the inherited implementation, which only emits `effectTriggered`. The plug
 * has no visible effect of its own, although the specification (Identify, TriggerEffect) has the device execute the
 * requested effect.
 */
export const IoPlugInUnitIdentifyServer = IoIdentifyServer.alter({ commands: { triggerEffect: { optional: false } } });

interface EffectStep {
    power: boolean;
    duration: Duration;
}

const EFFECT_STEP = Seconds(1);

function flashSteps(count: number, initialPower: boolean): EffectStep[] {
    const steps = new Array<EffectStep>();
    for (let flash = 0; flash < count; flash++) {
        if (flash > 0) {
            steps.push({ power: initialPower, duration: EFFECT_STEP });
        }
        steps.push({ power: !initialPower, duration: EFFECT_STEP });
    }
    return steps;
}

/**
 * Maps a TriggerEffect effect onto power steps of an ioBroker light; after the last step the light returns to its
 * initial power state. Brightness and color are not used, so the colored variants of the specification examples
 * (Identify, EffectIdentifierEnum) fall back to their non-colored form, and "minimum brightness" is off.
 *
 * | Effect        | Steps                        | Total | Specification example                |
 * |---------------|------------------------------|-------|--------------------------------------|
 * | Blink         | 1 flash                      | 1 s   | on/off once                          |
 * | Breathe       | 7 flashes                    | 13 s  | on/off over 1 s, 15 times            |
 * | Okay          | 2 flashes                    | 3 s   | flashes twice                        |
 * | ChannelChange | on for 1 s, then off for 7 s | 8 s   | maximum 0.5 s, then minimum 7.5 s    |
 *
 * A flash is the inverted power state for 1 s; between two flashes the initial power state holds for 1 s. The last
 * flash ends with the return to the initial power state.
 *
 * The steps are 1 s long, not 0.5 s as in the examples, and Breathe has 7 flashes instead of 15 to stay near the
 * 15 s of the example: every step is a write to the ioBroker light, and this keeps the number of writes low.
 * Identify 1.2.6.2.1 allows this: "Implementors MAY deviate from the example light effects in EffectIdentifierEnum,
 * but they SHOULD indicate during testing how they handle each effect."
 *
 * @returns undefined for FinishEffect, StopEffect and unknown effects, which start no effect
 */
function effectSteps(effect: Identify.EffectIdentifier, initialPower: boolean): EffectStep[] | undefined {
    switch (effect) {
        case Identify.EffectIdentifier.Blink:
            return flashSteps(1, initialPower);
        case Identify.EffectIdentifier.Breathe:
            return flashSteps(7, initialPower);
        case Identify.EffectIdentifier.Okay:
            return flashSteps(2, initialPower);
        case Identify.EffectIdentifier.ChannelChange:
            return [
                { power: true, duration: EFFECT_STEP },
                { power: false, duration: Seconds(7) },
            ];
        default:
            return undefined;
    }
}

interface RunningEffect {
    initialPower: boolean;
    remainingSteps: EffectStep[];
    timer?: Timer;
}

export class IoLightingIdentifyServer extends IoIdentifyServer {
    declare protected internal: IoLightingIdentifyServer.Internal;

    override async initialize(): Promise<void> {
        this.state.identifyType = Identify.IdentifyType.LightOutput;
        return super.initialize();
    }

    #light(): GenericLightingDevice | undefined {
        const device = this.internal.device;
        if (device.isActionAllowedByIdentify && device instanceof GenericLightingDevice && device.hasPower()) {
            return device;
        }
        return undefined;
    }

    /**
     * Queues a power write behind all earlier ones, so a restore can not be overtaken by an older effect step or
     * Identify toggle that is still being written. Rejects when this write fails; the queue goes on.
     */
    #queuePowerWrite(light: GenericLightingDevice, power: boolean): Promise<void> {
        this.internal.queuedPower = power;
        const write = this.internal.powerWrites.then(() => light.setPower(power));
        const end: Promise<void> = write
            .catch(() => {})
            .then(() => {
                if (this.internal.powerWrites === end) {
                    this.internal.queuedPower = undefined;
                }
            });
        this.internal.powerWrites = end;
        return write;
    }

    /**
     * The power state the light ends in once all queued writes are done, so a new effect or Identify does not save a
     * step of the previous effect as the state to restore.
     */
    #power(light: GenericLightingDevice): boolean {
        return this.internal.queuedPower ?? !!light.getPower();
    }

    #setPower(light: GenericLightingDevice, power: boolean): void {
        this.#queuePowerWrite(light, power).catch(error =>
            this.internal.adapter.log.info(
                `Can not set power for identify of ${this.internal.device.uuid}: ${error.message}`,
            ),
        );
    }

    stopIdentifying(): void {
        super.stopIdentifying();

        const initialState = this.internal.identifyState?.initialState;
        this.internal.identifyState = undefined;
        // Also runs on dispose, where internal.device is unset when initialize failed before setting it
        if (initialState === undefined) {
            return;
        }
        const light = this.#light();
        if (light !== undefined) {
            this.#setPower(light, initialState);
        }
    }

    async handleIoIdentify(startToIdentify: boolean): Promise<void> {
        const light = this.#light();
        if (startToIdentify) {
            let currentState = false;
            if (light !== undefined) {
                currentState = this.internal.effect?.initialPower ?? this.#power(light);
                this.#stopEffect();
            }
            this.internal.identifyState = { currentState, initialState: currentState };
        }

        if (!this.internal.identifyState) {
            return;
        }

        if (light !== undefined) {
            this.internal.identifyState.currentState = !this.internal.identifyState.currentState;
            await this.#queuePowerWrite(light, this.internal.identifyState.currentState);
            if (startToIdentify) {
                super.handleIoIdentify(startToIdentify);
            }
        } else {
            super.handleIoIdentify(startToIdentify);
        }
    }

    override triggerEffect({ effectIdentifier }: Identify.TriggerEffectRequest): void {
        const light = this.#light();
        if (light === undefined) {
            this.internal.adapter.log.info(`Triggered identify effect for ${this.internal.device.uuid}`);
            return;
        }
        // Identify and an effect would both toggle the power state
        if (this.state.isIdentifying) {
            return;
        }

        switch (effectIdentifier) {
            case Identify.EffectIdentifier.StopEffect:
                this.#stopEffect();
                return;
            case Identify.EffectIdentifier.FinishEffect:
                if (this.internal.effect !== undefined) {
                    this.internal.effect.remainingSteps = [];
                }
                return;
        }

        const initialPower = this.internal.effect?.initialPower ?? this.#power(light);
        const steps = effectSteps(effectIdentifier, initialPower);
        if (steps === undefined) {
            return;
        }
        this.internal.effect?.timer?.stop();
        this.internal.effect = { initialPower, remainingSteps: steps };
        this.#runNextEffectStep(light);
    }

    #runNextEffectStep(light: GenericLightingDevice): void {
        const effect = this.internal.effect;
        if (effect === undefined) {
            return;
        }
        const step = effect.remainingSteps.shift();
        if (step === undefined) {
            this.#stopEffect();
            return;
        }
        this.#setPower(light, step.power);
        effect.timer = Time.getTimer('Identify effect', step.duration, () => this.#runNextEffectStep(light)).start();
    }

    #stopEffect(): void {
        const effect = this.internal.effect;
        if (effect === undefined) {
            return;
        }
        effect.timer?.stop();
        this.internal.effect = undefined;
        const light = this.#light();
        if (light !== undefined) {
            this.#setPower(light, effect.initialPower);
        }
    }

    /** Resolves after the light's power state is restored, so the adapter does not unload before that write. */
    override async [Symbol.asyncDispose](): Promise<void> {
        this.#stopEffect();
        this.stopIdentifying();
        await this.internal.powerWrites;
        await super[Symbol.asyncDispose]();
    }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace IoLightingIdentifyServer {
    export class Internal extends IoIdentifyServer.Internal {
        identifyState?: IdentifyState;
        effect?: RunningEffect;
        /** End of the queue that every power write of the behavior goes through */
        powerWrites: Promise<void> = Promise.resolve();
        /** Power of the last queued write while the queue is not empty */
        queuedPower?: boolean;
    }
}
