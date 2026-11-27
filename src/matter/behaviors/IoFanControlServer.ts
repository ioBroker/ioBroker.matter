import { FanControlServer } from '@matter/main/behaviors';
import { FanControl } from '@matter/main/clusters';
import { hasRemoteActor } from '@matter/main/protocol';
import { Status, StatusResponseError } from '@matter/main/types';
import {
    fanModeForPercent,
    normalizeFanModeWrite,
    normalizeRockSettingWrite,
    percentSettingForFanMode,
} from '../FanControlUtils';

const RockingFanControlServer = FanControlServer.with(FanControl.Feature.Rocking);
type RockingFanControlServer = InstanceType<typeof RockingFanControlServer>;

function hasRocking(server: FanControlServer): server is RockingFanControlServer {
    return server.features.rocking;
}

/**
 * FanControl server that applies the client write rules of the Fan Control cluster before matter.js accepts a write,
 * which the matter.js FanControlServer does not do: it checks FanMode and RockSetting, couples FanMode and
 * PercentSetting by the Percent Rules, refuses Off and speeds the fan cannot do, and sets PercentCurrent to 0 on Off.
 * The checks run in the `$Changing` events, so a refused write returns its status code to the client and is rolled
 * back, and a derived value commits in the same transaction as the write. Both handlers check the Off and Auto-only
 * rules, because a PercentSetting write that keeps the FanMode does not start the FanMode handler. Only writes of a
 * remote actor are checked; local writes are expected to follow the rules already.
 *
 * | Client write                        | Result                                                                      |
 * | ----------------------------------- | --------------------------------------------------------------------------- |
 * | FanMode outside FanModeSequence     | CONSTRAINT_ERROR (4.4.6.1)                                                  |
 * | FanMode On / Smart                  | stored as High / as Auto with an Auto sequence, else High (4.4.6.1.3/4)     |
 * | FanMode, PercentSetting meaning Off | INVALID_IN_STATE when {@link State.offAllowed} is false (4.4.6.1, 4.4.6.3)  |
 * | FanMode, PercentSetting of a step   | INVALID_IN_STATE when {@link State.manualSpeed} is false (4.4.6.1, 4.4.6.3) |
 * | PercentSetting 1..99                | INVALID_IN_STATE when {@link State.variableSpeed} is false (4.4.6.3)        |
 * | FanMode                             | PercentSetting follows, see {@link percentSettingForFanMode} (4.4.6.3.1)    |
 * | PercentSetting number               | FanMode = {@link fanModeForPercent} (4.4.6.3.1)                             |
 * | PercentSetting null                 | value kept (4.4.6.3), but the null of FanMode Auto stays (4.4.6.1.2)        |
 * | Off by either attribute             | PercentCurrent = 0 (4.4.6.1.1)                                              |
 * | RockSetting bit RockSupport lacks   | CONSTRAINT_ERROR (4.4.6.9)                                                  |
 * | RockSetting with several bits       | only the lowest bit stays set (4.4.6.9)                                     |
 */
export class IoFanControlServer extends FanControlServer {
    declare state: IoFanControlServer.State;

    override initialize(): void {
        super.initialize();
        this.reactTo(this.events.fanMode$Changing, this.#fanModeChanging);
        this.reactTo(this.events.percentSetting$Changing, this.#percentSettingChanging);
        if (hasRocking(this)) {
            this.reactTo(this.events.rockSetting$Changing, this.#rockSettingChanging);
        }
    }

    #fanModeChanging(fanMode: FanControl.FanMode): void {
        if (!hasRemoteActor(this.context)) {
            return;
        }
        const { fanModeSequence } = this.state;
        const stored = normalizeFanModeWrite(fanModeSequence, fanMode);
        if (stored === undefined) {
            throw new StatusResponseError(
                `FanMode ${fanMode} is not offered by FanModeSequence ${fanModeSequence}`,
                Status.ConstraintError,
            );
        }
        if (stored === FanControl.FanMode.Off && !this.state.offAllowed) {
            throw new StatusResponseError('The fan cannot be switched off on its own', Status.InvalidInState);
        }
        if (stored !== FanControl.FanMode.Off && stored !== FanControl.FanMode.Auto && !this.state.manualSpeed) {
            throw new StatusResponseError('The fan runs in Auto only', Status.InvalidInState);
        }
        if (stored !== fanMode) {
            this.state.fanMode = stored;
        }
        const percentSetting = percentSettingForFanMode(fanModeSequence, stored, this.state.percentSetting);
        if (percentSetting !== this.state.percentSetting) {
            this.state.percentSetting = percentSetting;
        }
        if (stored === FanControl.FanMode.Off && this.state.percentCurrent !== 0) {
            // PercentCurrent is read-only for the client whose write this is
            this.agent.asLocalActor(() => {
                this.state.percentCurrent = 0;
            });
        }
    }

    #percentSettingChanging(percentSetting: number | null, oldValue: number | null): void {
        if (!hasRemoteActor(this.context)) {
            return;
        }
        if (percentSetting === null) {
            if (this.state.fanMode !== FanControl.FanMode.Auto) {
                this.state.percentSetting = oldValue;
            }
            return;
        }
        if (percentSetting === 0 && !this.state.offAllowed) {
            throw new StatusResponseError('The fan cannot be switched off on its own', Status.InvalidInState);
        }
        if (percentSetting > 0 && !this.state.manualSpeed) {
            throw new StatusResponseError('The fan runs in Auto only', Status.InvalidInState);
        }
        if (!this.state.variableSpeed && percentSetting > 0 && percentSetting < 100) {
            throw new StatusResponseError('The fan runs at one speed only', Status.InvalidInState);
        }
        const fanMode = fanModeForPercent(this.state.fanModeSequence, percentSetting);
        if (fanMode !== this.state.fanMode) {
            this.state.fanMode = fanMode;
        }
    }

    #rockSettingChanging(this: RockingFanControlServer, rockSetting: FanControl.Rock): void {
        if (!hasRemoteActor(this.context)) {
            return;
        }
        const stored = normalizeRockSettingWrite(this.state.rockSupport, rockSetting);
        if (stored === undefined) {
            throw new StatusResponseError('RockSetting sets a bit that RockSupport lacks', Status.ConstraintError);
        }
        if (
            stored.rockLeftRight !== !!rockSetting.rockLeftRight ||
            stored.rockUpDown !== !!rockSetting.rockUpDown ||
            stored.rockRound !== !!rockSetting.rockRound
        ) {
            this.state.rockSetting = stored;
        }
    }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace IoFanControlServer {
    export class State extends FanControlServer.State {
        /**
         * False when the fan cannot be switched off on its own, e.g. the fan of an air conditioner that follows the
         * power of the air conditioner, or a fan with neither a power nor a SPEED_LEVEL state. A client write of Off
         * is then refused.
         */
        offAllowed = true;

        /**
         * False when the fan has no SPEED_LEVEL state and fewer than two speed steps, e.g. an air conditioner that
         * only has a swing state. A client PercentSetting of 1..99 is then refused.
         */
        variableSpeed = true;

        /**
         * False when the ioBroker writes for a step do not always bring the fan to that step, e.g. a SPEED state that
         * lists AUTO but no step. A client write of a step, or of a PercentSetting above 0, is then refused.
         */
        manualSpeed = true;
    }
}
