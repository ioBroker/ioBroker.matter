import { IdentifyServer } from '@matter/main/behaviors';
import { Identify } from '@matter/main/clusters';
import { Time, MaybePromise, type Timer } from '@matter/main';
import { IoBrokerContext } from './IoBrokerContext';
import { GenericLightingDevice } from '../../lib/devices/GenericLightingDevice';
import type { MatterAdapter } from '../../main';
import type { GenericDevice } from '../../lib/devices/GenericDevice';

export interface IdentifyState {
    currentState?: boolean;
    initialState?: boolean;
}

export class IoIdentifyServer extends IdentifyServer {
    protected declare internal: IoIdentifyServer.Internal;

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
        this.internal.identifyHandlerTimeout = Time.getPeriodicTimer('Identify', 1000, () =>
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

    handleIoIdentify(startToIdentify: boolean): MaybePromise<void> {
        if (startToIdentify) {
            // TODO push info to UI and show popup, ideally get the name from the device
            //  or when using uuid be aware it could also be a bridged uuid
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

export class IoLightingIdentifyServer extends IoIdentifyServer {
    protected declare internal: IoLightingIdentifyServer.Internal;

    override async initialize(): Promise<void> {
        this.state.identifyType = Identify.IdentifyType.LightOutput;
        return super.initialize();
    }

    stopIdentifying(): void {
        super.stopIdentifying();

        if (this.internal.identifyState === undefined) {
            return;
        }
        const initialState = this.internal.identifyState.initialState;
        this.internal.identifyState = undefined;
        if (initialState !== undefined) {
            if (
                initialState &&
                this.internal.device.isActionAllowedByIdentify &&
                this.internal.device instanceof GenericLightingDevice &&
                this.internal.device.hasPower()
            ) {
                this.internal.device
                    .setPower(initialState)
                    .catch(error =>
                        this.internal.adapter.log.info(`Can not reset state after identify: ${error.message}`),
                    );
            }
        }
    }

    async handleIoIdentify(startToIdentify: boolean): Promise<void> {
        if (startToIdentify) {
            let currentState = false;
            if (
                this.internal.device.isActionAllowedByIdentify &&
                this.internal.device instanceof GenericLightingDevice &&
                this.internal.device.hasPower()
            ) {
                currentState = !!this.internal.device.getPower();
            }
            this.internal.identifyState = { currentState, initialState: currentState };
        }

        if (!this.internal.identifyState) {
            return;
        }

        if (
            this.internal.device.isActionAllowedByIdentify &&
            this.internal.device instanceof GenericLightingDevice &&
            this.internal.device.hasPower()
        ) {
            this.internal.identifyState.currentState = !this.internal.identifyState.currentState;
            await this.internal.device.setPower(this.internal.identifyState.currentState);
            if (startToIdentify) {
                super.handleIoIdentify(startToIdentify);
            }
        } else {
            super.handleIoIdentify(startToIdentify);
        }
    }

    override async triggerEffect(): Promise<void> {
        if (this.internal.identifyTimer?.isRunning) {
            return;
        }
        if (
            this.internal.device.isActionAllowedByIdentify &&
            this.internal.device instanceof GenericLightingDevice &&
            this.internal.device.hasPower()
        ) {
            const currentState = !!this.internal.device.getPower();
            await this.internal.device.setPower(!currentState);
            this.internal.identifyTimer = Time.getTimer('Identify effect', 1000, () =>
                (this.internal.device as GenericLightingDevice)
                    .setPower(currentState)
                    .catch(error =>
                        this.internal.adapter.log.info(`Can not reset state after identify: ${error.message}`),
                    ),
            ).start();
        } else {
            this.internal.adapter.log.info(`Triggered identify effect for ${this.internal.device.uuid}`);
        }
    }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace IoLightingIdentifyServer {
    export class Internal extends IoIdentifyServer.Internal {
        identifyState?: IdentifyState;
    }
}
