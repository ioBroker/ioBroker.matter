import { AsyncObservable, MaybePromise } from '@matter/main';
import {
    OperationalStateUtils,
    RvcCleanModeServer,
    RvcOperationalStateServer,
    RvcRunModeServer,
} from '@matter/main/behaviors';
import { ModeBase, OperationalState, RvcOperationalState } from '@matter/main/clusters';

/** The states in which a cleaning operation is in progress; leaving them ends it. */
const OPERATION_IN_PROGRESS = new Set<RvcOperationalState.OperationalState>([
    RvcOperationalState.OperationalState.Running,
    RvcOperationalState.OperationalState.Paused,
]);

const CompletingRvcOperationalStateServer = RvcOperationalStateServer.alter({
    events: { operationCompletion: { optional: false } },
});

/**
 * The events are awaited, so a command response only goes out once the ioBroker side has taken the change. Matter
 * derives the accepted command list from the methods a behavior implements, so a robot that cannot be paused or sent
 * home must be served by a class that does not carry the method at all.
 *
 * The Robotic Vacuum Cleaner device type makes the OperationCompletion event mandatory. It is reported when the
 * robot leaves Running or Paused, with the operational error when it ends in Error. ioBroker cannot tell an error
 * the robot resumes from, which the specification (device type, "Device Error Handling") has the device report as
 * Paused, from one that ends the run, so entering Error always ends it. Any other state ends the run as well,
 * Docked and Charging included, so a robot that docks to recharge in the middle of a run reports a completion.
 * A run that continues afterwards reports its own completion.
 */

export class IoRvcOperationalStateServer extends CompletingRvcOperationalStateServer {
    declare events: IoRvcOperationalStateServer.Events;

    override initialize(): MaybePromise {
        const result = super.initialize();
        this.reactTo(this.events.operationalState$Changed, this.#reportOperationCompletion);
        return result;
    }

    #reportOperationCompletion(
        operationalState: RvcOperationalState.OperationalState,
        previousState: RvcOperationalState.OperationalState,
    ): void {
        if (!OPERATION_IN_PROGRESS.has(previousState) || OPERATION_IN_PROGRESS.has(operationalState)) {
            return;
        }
        const completionErrorCode =
            operationalState === RvcOperationalState.OperationalState.Error
                ? this.state.operationalError.errorStateId
                : OperationalState.ErrorState.NoError;
        this.events.operationCompletion.emit({ completionErrorCode }, this.context);
    }

    protected emitAndRespond(
        result: OperationalState.OperationalCommandResponse,
        emit: (events: IoRvcOperationalStateServer.Events) => MaybePromise<void> | undefined,
    ): MaybePromise<OperationalState.OperationalCommandResponse> {
        if (result.commandResponseState.errorStateId !== OperationalState.ErrorState.NoError) {
            return result;
        }
        return MaybePromise.then(emit(this.events), () => result);
    }

    protected triggerGoHome(): MaybePromise<RvcOperationalState.OperationalCommandResponse> {
        return this.emitAndRespond(OperationalStateUtils.assertRvcGoHome(this.state.operationalState), events =>
            events.rvcGoHomeTriggered.emit(),
        );
    }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace IoRvcOperationalStateServer {
    export class Events extends CompletingRvcOperationalStateServer.Events {
        rvcPauseTriggered = AsyncObservable();
        rvcResumeTriggered = AsyncObservable();
        rvcGoHomeTriggered = AsyncObservable();
    }
}

export class IoRvcOperationalStateServerWithPause extends IoRvcOperationalStateServer {
    override pause(): MaybePromise<RvcOperationalState.OperationalCommandResponse> {
        return this.emitAndRespond(OperationalStateUtils.assertRvcPause(this.state.operationalState), events =>
            events.rvcPauseTriggered.emit(),
        );
    }

    override resume(): MaybePromise<RvcOperationalState.OperationalCommandResponse> {
        return this.emitAndRespond(OperationalStateUtils.assertRvcResume(this.state.operationalState), events =>
            events.rvcResumeTriggered.emit(),
        );
    }
}

export class IoRvcOperationalStateServerWithGoHome extends IoRvcOperationalStateServer {
    override goHome(): MaybePromise<RvcOperationalState.OperationalCommandResponse> {
        return this.triggerGoHome();
    }
}

export class IoRvcOperationalStateServerWithPauseAndGoHome extends IoRvcOperationalStateServerWithPause {
    override goHome(): MaybePromise<RvcOperationalState.OperationalCommandResponse> {
        return this.triggerGoHome();
    }
}

export class IoRvcRunModeServer extends RvcRunModeServer {
    declare events: IoRvcRunModeServer.Events;

    override changeToMode(request: ModeBase.ChangeToModeRequest): MaybePromise<ModeBase.ChangeToModeResponse> {
        return MaybePromise.then(super.changeToMode(request), result =>
            result.status === ModeBase.ModeChangeStatus.Success
                ? MaybePromise.then(this.events.rvcRunModeControlled.emit(request.newMode), () => result)
                : result,
        );
    }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace IoRvcRunModeServer {
    export class Events extends RvcRunModeServer.Events {
        rvcRunModeControlled = AsyncObservable<[mode: number]>();
    }
}

export class IoRvcCleanModeServer extends RvcCleanModeServer {
    declare events: IoRvcCleanModeServer.Events;

    override changeToMode(request: ModeBase.ChangeToModeRequest): MaybePromise<ModeBase.ChangeToModeResponse> {
        return MaybePromise.then(super.changeToMode(request), result =>
            result.status === ModeBase.ModeChangeStatus.Success
                ? MaybePromise.then(this.events.rvcCleanModeControlled.emit(request.newMode), () => result)
                : result,
        );
    }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace IoRvcCleanModeServer {
    export class Events extends RvcCleanModeServer.Events {
        rvcCleanModeControlled = AsyncObservable<[mode: number]>();
    }
}
