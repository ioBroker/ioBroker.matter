import { Endpoint } from '@matter/main';
import { RoboticVacuumCleanerDevice } from '@matter/main/devices';
import { ModeBase, OperationalState, RvcCleanMode, RvcOperationalState, RvcRunMode } from '@matter/main/clusters';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import {
    type VacuumCleaner,
    type VacuumCleanerMode,
    VacuumCleanerRunMode,
    VacuumCleanerRunModeNumbers,
    VacuumCleanerState,
} from '../../lib/devices/VacuumCleaner';
import { GenericDeviceToMatter } from './GenericDeviceToMatter';
import { IoIdentifyServer } from '../behaviors/IdentifyServer';
import { IoBrokerContext } from '../behaviors/IoBrokerContext';
import {
    IoRvcCleanModeServer,
    IoRvcOperationalStateServer,
    IoRvcOperationalStateServerWithGoHome,
    IoRvcOperationalStateServerWithPause,
    IoRvcOperationalStateServerWithPauseAndGoHome,
    IoRvcRunModeServer,
} from '../behaviors/EventedRvcServers';

const OPERATIONAL_STATE_LIST = [
    { operationalStateId: RvcOperationalState.OperationalState.Stopped },
    { operationalStateId: RvcOperationalState.OperationalState.Running },
    { operationalStateId: RvcOperationalState.OperationalState.Paused },
    { operationalStateId: RvcOperationalState.OperationalState.Error },
    { operationalStateId: RvcOperationalState.OperationalState.SeekingCharger },
    { operationalStateId: RvcOperationalState.OperationalState.Charging },
    { operationalStateId: RvcOperationalState.OperationalState.Docked },
];

const OPERATIONAL_STATE_BY_IOBROKER_STATE = new Map<VacuumCleanerState, RvcOperationalState.OperationalState>([
    [VacuumCleanerState.HOME, RvcOperationalState.OperationalState.Docked],
    [VacuumCleanerState.CLEANING, RvcOperationalState.OperationalState.Running],
    [VacuumCleanerState.PAUSE, RvcOperationalState.OperationalState.Paused],
]);

/**
 * A discriminated form of a value that is not taken yet. The discriminator keeps counting because the form it
 * produces can collide with a value the device already uses.
 */
function uniqueValue(
    base: string,
    taken: ReadonlySet<string>,
    discriminate: (base: string, n: number) => string,
): string {
    if (!taken.has(base)) {
        return base;
    }
    let discriminator = 2;
    let candidate = discriminate(base, discriminator);
    while (taken.has(candidate)) {
        candidate = discriminate(base, ++discriminator);
    }
    return candidate;
}

/** Matter constrains a mode label to 64 characters, while an ioBroker state may name its modes freely. */
const MAX_MODE_LABEL_LENGTH = 64;

/** RvcCleanMode needs at least two modes, and needs one of them tagged Vacuum or Mop. */
const MIN_CLEAN_MODES = 2;

/** The upper bound the cluster puts on supportedModes. */
const MAX_CLEAN_MODES = 255;

const CLEAN_MODE_TAGS: Record<string, ModeBase.ModeTag> = {
    AUTO: ModeBase.ModeTag.Auto,
    QUIET: ModeBase.ModeTag.Quiet,
    ECO: ModeBase.ModeTag.LowEnergy,
    EXPRESS: ModeBase.ModeTag.Quick,
};

/** Mapping Logic to map an ioBroker Vacuum Cleaner device to a Matter RoboticVacuumCleanerDevice. */
export class VacuumCleanerToMatter extends GenericDeviceToMatter {
    readonly #ioBrokerDevice: VacuumCleaner;
    readonly #matterEndpoint: Endpoint;
    readonly #operationalStateServer;
    readonly #cleanModes: VacuumCleanerMode[];
    readonly #hasMapping: boolean;

    constructor(ioBrokerDevice: VacuumCleaner, name: string, uuid: string) {
        super(name, uuid);
        this.#ioBrokerDevice = ioBrokerDevice;
        // A write carries the ioBroker mode name, and a name reverse-maps to the first state holding it, so a mode
        // repeating a name could never be selected. Offering it anyway would advertise a mode that does nothing.
        const cleanModes = [...new Set(ioBrokerDevice.hasMode() ? ioBrokerDevice.getModes() : [])].slice(
            0,
            MAX_CLEAN_MODES,
        );
        this.#cleanModes = cleanModes.length >= MIN_CLEAN_MODES ? cleanModes : [];
        this.#hasMapping =
            ioBrokerDevice.hasRunMode() && ioBrokerDevice.getRunModeModes().includes(VacuumCleanerRunMode.Mapping);

        const hasPause = ioBrokerDevice.hasPause();
        const hasHome = ioBrokerDevice.hasHome();
        this.#operationalStateServer = hasPause
            ? hasHome
                ? IoRvcOperationalStateServerWithPauseAndGoHome
                : IoRvcOperationalStateServerWithPause
            : hasHome
              ? IoRvcOperationalStateServerWithGoHome
              : IoRvcOperationalStateServer;

        const deviceType = RoboticVacuumCleanerDevice.with(
            IoIdentifyServer,
            IoBrokerContext,
            IoRvcRunModeServer,
            this.#operationalStateServer,
        );

        this.#matterEndpoint = new Endpoint(
            this.#cleanModes.length > 0 ? deviceType.with(IoRvcCleanModeServer) : deviceType,
            {
                id: `${uuid}-VacuumCleaner`,
                ioBrokerContext: { device: ioBrokerDevice, adapter: ioBrokerDevice.adapter },
                rvcRunMode: {
                    supportedModes: this.#supportedRunModes(),
                    currentMode: this.#currentRunMode(),
                },
                rvcOperationalState: {
                    operationalStateList: OPERATIONAL_STATE_LIST,
                    operationalState: this.#currentOperationalState(),
                    operationalError: { errorStateId: this.#currentErrorState() },
                },
                ...(this.#cleanModes.length > 0
                    ? {
                          rvcCleanMode: {
                              supportedModes: this.#supportedCleanModes(),
                              currentMode: this.#currentCleanMode(),
                          },
                      }
                    : {}),
            },
        );
    }

    get matterEndpoints(): Endpoint[] {
        return [this.#matterEndpoint];
    }

    get ioBrokerDevice(): VacuumCleaner {
        return this.#ioBrokerDevice;
    }

    #supportedRunModes(): { label: string; mode: number; modeTags: { value: RvcRunMode.ModeTag }[] }[] {
        const modes = [
            {
                label: 'Idle',
                mode: VacuumCleanerRunModeNumbers.IDLE,
                modeTags: [{ value: RvcRunMode.ModeTag.Idle }],
            },
            {
                label: 'Cleaning',
                mode: VacuumCleanerRunModeNumbers.CLEANING,
                modeTags: [{ value: RvcRunMode.ModeTag.Cleaning }],
            },
        ];
        if (this.#hasMapping) {
            modes.push({
                label: 'Mapping',
                mode: VacuumCleanerRunModeNumbers.MAPPING,
                modeTags: [{ value: RvcRunMode.ModeTag.Mapping }],
            });
        }
        return modes;
    }

    #currentRunMode(): number {
        if (this.#ioBrokerDevice.hasRunMode()) {
            switch (this.#ioBrokerDevice.getRunMode()) {
                case VacuumCleanerRunMode.Cleaning:
                    return VacuumCleanerRunModeNumbers.CLEANING;
                case VacuumCleanerRunMode.Mapping:
                    if (this.#hasMapping) {
                        return VacuumCleanerRunModeNumbers.MAPPING;
                    }
                    return VacuumCleanerRunModeNumbers.CLEANING;
                case VacuumCleanerRunMode.Idle:
                    return VacuumCleanerRunModeNumbers.IDLE;
            }
        }
        return this.#isPowered() ? VacuumCleanerRunModeNumbers.CLEANING : VacuumCleanerRunModeNumbers.IDLE;
    }

    async #setRunMode(currentMode: number): Promise<void> {
        await this.#matterEndpoint.setStateOf(IoRvcRunModeServer, { currentMode });
        await this.#setOperationalState(this.#currentOperationalState());
    }

    /**
     * POWER and RUN_MODE can disagree, and the run mode of a device says nothing about whether it is switched on, so
     * a power change decides on its own. A robot switched on still has to be doing something.
     */
    #runModeForPower(powered: boolean): number {
        if (!powered) {
            return VacuumCleanerRunModeNumbers.IDLE;
        }
        const runMode = this.#currentRunMode();
        return runMode === VacuumCleanerRunModeNumbers.IDLE ? VacuumCleanerRunModeNumbers.CLEANING : runMode;
    }

    #isPowered(): boolean {
        return this.#ioBrokerDevice.hasPower() ? !!this.#ioBrokerDevice.getPower() : false;
    }

    #supportedCleanModes(): {
        label: string;
        mode: number;
        modeTags: { value: RvcCleanMode.ModeTag | ModeBase.ModeTag }[];
    }[] {
        const usedLabels = new Set<string>();
        return this.#cleanModes.map((mode, index) => {
            // Matter rejects a duplicate label outright, and an ioBroker state may name two of its modes alike
            const label = uniqueValue(mode.substring(0, MAX_MODE_LABEL_LENGTH), usedLabels, (base, discriminator) => {
                const suffix = ` ${discriminator}`;
                return `${base.substring(0, MAX_MODE_LABEL_LENGTH - suffix.length)}${suffix}`;
            });
            usedLabels.add(label);

            const semanticTag = CLEAN_MODE_TAGS[mode];
            // One Vacuum or Mop mode is required, and an ioBroker cleaning mode names an intensity rather than a
            // floor treatment, so vacuuming is the only thing every one of them can be said to be doing.
            const modeTags: { value: RvcCleanMode.ModeTag | ModeBase.ModeTag }[] = [
                { value: RvcCleanMode.ModeTag.Vacuum },
            ];
            if (semanticTag !== undefined) {
                modeTags.push({ value: semanticTag });
            }
            return { label, mode: index, modeTags };
        });
    }

    /** The cluster demands a current mode, so a value the device does not list falls back to its first one. */
    #currentCleanMode(): number {
        const mode = this.#ioBrokerDevice.getMode();
        const index = mode === undefined ? -1 : this.#cleanModes.indexOf(mode);
        return index === -1 ? 0 : index;
    }

    /** The operational state and the error attribute have to agree, or a controller sees an error with no cause. */
    #currentErrorState(): OperationalState.ErrorState {
        return this.#ioBrokerDevice.hasError() && this.#ioBrokerDevice.getError()
            ? OperationalState.ErrorState.UnableToCompleteOperation
            : OperationalState.ErrorState.NoError;
    }

    #currentOperationalState(): RvcOperationalState.OperationalState {
        if (this.#ioBrokerDevice.hasError() && this.#ioBrokerDevice.getError()) {
            return RvcOperationalState.OperationalState.Error;
        }
        if (this.#ioBrokerDevice.hasState()) {
            const state = this.#ioBrokerDevice.getState();
            const operationalState = state === undefined ? undefined : OPERATIONAL_STATE_BY_IOBROKER_STATE.get(state);
            if (operationalState !== undefined) {
                return operationalState;
            }
        }
        return this.#isPowered()
            ? RvcOperationalState.OperationalState.Running
            : RvcOperationalState.OperationalState.Docked;
    }

    async #setOperationalState(operationalState: RvcOperationalState.OperationalState): Promise<void> {
        await this.#matterEndpoint.setStateOf(this.#operationalStateServer, { operationalState });
    }

    async registerHandlersAndInitialize(): Promise<void> {
        await super.registerHandlersAndInitialize();

        this.#registerMatterHandlers();
        this.#registerIoBrokerHandlers();
    }

    #registerMatterHandlers(): void {
        this.matterEvents.on(this.#matterEndpoint.eventsOf(IoRvcRunModeServer).rvcRunModeControlled, async mode => {
            await this.#handleMatterRunModeChange(mode);
        });

        if (this.#cleanModes.length > 0) {
            this.matterEvents.on(
                this.#matterEndpoint.eventsOf(IoRvcCleanModeServer).rvcCleanModeControlled,
                async mode => {
                    const cleanMode = this.#cleanModes[mode];
                    if (cleanMode !== undefined) {
                        await this.#ioBrokerDevice.setMode(cleanMode);
                    }
                },
            );
        }

        const operationalStateEvents = this.#matterEndpoint.eventsOf(this.#operationalStateServer);
        if (this.#ioBrokerDevice.hasPause()) {
            this.matterEvents.on(operationalStateEvents.rvcPauseTriggered, async () => {
                await this.#ioBrokerDevice.setPause(true);
                await this.#reportCommandResult(RvcOperationalState.OperationalState.Paused);
            });
            this.matterEvents.on(operationalStateEvents.rvcResumeTriggered, async () => {
                await this.#ioBrokerDevice.setPause(false);
                await this.#reportCommandResult(RvcOperationalState.OperationalState.Running);
            });
        }
        if (this.#ioBrokerDevice.hasHome()) {
            this.matterEvents.on(operationalStateEvents.rvcGoHomeTriggered, async () => {
                await this.#ioBrokerDevice.setHome(true);
                await this.#reportCommandResult(RvcOperationalState.OperationalState.Docked);
            });
        }
    }

    /**
     * Without a STATE state nothing reports back what the command did, and a controller that never sees the robot leave
     * its old state cannot issue the opposite command afterwards.
     */
    async #reportCommandResult(operationalState: RvcOperationalState.OperationalState): Promise<void> {
        if (!this.#ioBrokerDevice.hasState()) {
            await this.#setOperationalState(operationalState);
        }
    }

    async #handleMatterRunModeChange(mode: number): Promise<void> {
        const runMode =
            mode === VacuumCleanerRunModeNumbers.MAPPING
                ? VacuumCleanerRunMode.Mapping
                : mode === VacuumCleanerRunModeNumbers.CLEANING
                  ? VacuumCleanerRunMode.Cleaning
                  : VacuumCleanerRunMode.Idle;

        if (this.#ioBrokerDevice.hasRunMode()) {
            await this.#ioBrokerDevice.setRunMode(runMode);
        }
        const powered = runMode !== VacuumCleanerRunMode.Idle;
        if (this.#ioBrokerDevice.hasPower() && this.#isPowered() !== powered) {
            await this.#ioBrokerDevice.setPower(powered);
        }
        if (!this.#ioBrokerDevice.hasState()) {
            await this.#setOperationalState(
                powered ? RvcOperationalState.OperationalState.Running : RvcOperationalState.OperationalState.Docked,
            );
        }
    }

    #registerIoBrokerHandlers(): void {
        this.#ioBrokerDevice.onChange(async event => {
            switch (event.property) {
                case PropertyType.RunMode:
                    await this.#setRunMode(this.#currentRunMode());
                    break;
                case PropertyType.Power:
                    await this.#setRunMode(this.#runModeForPower(!!event.value));
                    break;
                case PropertyType.Mode:
                    if (this.#cleanModes.length > 0) {
                        const index = this.#cleanModes.findIndex(mode => mode === event.value);
                        if (index !== -1) {
                            await this.#matterEndpoint.setStateOf(IoRvcCleanModeServer, { currentMode: index });
                        }
                    }
                    break;
                case PropertyType.State:
                    await this.#setOperationalState(this.#currentOperationalState());
                    break;
                case PropertyType.Error:
                    if (event.value) {
                        await this.#matterEndpoint.setStateOf(this.#operationalStateServer, {
                            operationalError: {
                                errorStateId: OperationalState.ErrorState.UnableToCompleteOperation,
                            },
                        });
                    } else {
                        // Clearing the error attribute alone leaves the cluster in Error, so the state has to follow
                        await this.#matterEndpoint.setStateOf(this.#operationalStateServer, {
                            operationalError: { errorStateId: OperationalState.ErrorState.NoError },
                        });
                        await this.#setOperationalState(this.#currentOperationalState());
                    }
                    break;
            }
        });
    }
}
