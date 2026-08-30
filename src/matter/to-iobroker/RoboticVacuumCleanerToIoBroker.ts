import ChannelDetector from '@iobroker/type-detector';
import type { Endpoint } from '@matter/main';
import {
    ModeBase,
    OperationalState,
    RvcCleanMode,
    RvcOperationalState,
    RvcRunMode,
    ServiceArea,
} from '@matter/main/clusters';
import { RvcCleanModeClient, RvcOperationalStateClient, RvcRunModeClient } from '@matter/main/behaviors';
import type { PairedNode } from '@project-chip/matter.js/device';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { DetectedDevice, DeviceOptions } from '../../lib/devices/GenericDevice';
import {
    VacuumCleaner,
    VacuumCleanerRunMode,
    VacuumCleanerRunModeNumbers,
    VacuumCleanerState,
    VacuumCleanerStateNumbers,
} from '../../lib/devices/VacuumCleaner';
import { GenericDeviceToIoBroker } from './GenericDeviceToIoBroker';
import type { MatterAdapter } from '../../main';

type ModeOption = {
    readonly label: string;
    readonly mode: number;
    readonly modeTags: readonly { readonly value: number }[];
};

const RUN_MODE_BY_TAG = new Map<number, VacuumCleanerRunMode>([
    [RvcRunMode.ModeTag.Idle, VacuumCleanerRunMode.Idle],
    [RvcRunMode.ModeTag.Cleaning, VacuumCleanerRunMode.Cleaning],
    [RvcRunMode.ModeTag.Mapping, VacuumCleanerRunMode.Mapping],
]);

const RUN_MODE_KEYS: Record<VacuumCleanerRunMode, number> = {
    [VacuumCleanerRunMode.Idle]: VacuumCleanerRunModeNumbers.IDLE,
    [VacuumCleanerRunMode.Cleaning]: VacuumCleanerRunModeNumbers.CLEANING,
    [VacuumCleanerRunMode.Mapping]: VacuumCleanerRunModeNumbers.MAPPING,
};

/**
 * The three ioBroker states a robot can report. Matter names more, and each of them is either the robot working, the
 * robot halted, or one of the many ways of being at the dock, which is as much as the ioBroker state can express.
 */
const STATE_BY_OPERATIONAL_STATE = new Map<number, VacuumCleanerState>([
    [RvcOperationalState.OperationalState.Running, VacuumCleanerState.CLEANING],
    [RvcOperationalState.OperationalState.Paused, VacuumCleanerState.PAUSE],
    [RvcOperationalState.OperationalState.Stopped, VacuumCleanerState.PAUSE],
    [RvcOperationalState.OperationalState.SeekingCharger, VacuumCleanerState.HOME],
    [RvcOperationalState.OperationalState.Charging, VacuumCleanerState.HOME],
    [RvcOperationalState.OperationalState.Docked, VacuumCleanerState.HOME],
    [RvcOperationalState.OperationalState.EmptyingDustBin, VacuumCleanerState.HOME],
    [RvcOperationalState.OperationalState.CleaningMop, VacuumCleanerState.HOME],
    [RvcOperationalState.OperationalState.FillingWaterTank, VacuumCleanerState.HOME],
    [RvcOperationalState.OperationalState.UpdatingMaps, VacuumCleanerState.HOME],
]);

/** Turns a vendor mode label into an ioBroker enum value, which may not contain the separators a label can. */
function modeLabelToEnumValue(label: string, mode: number): string {
    const value = label
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    return value.length > 0 ? value : `MODE_${mode}`;
}

export class RoboticVacuumCleanerToIoBroker extends GenericDeviceToIoBroker {
    readonly #adapter: MatterAdapter;
    readonly #ioBrokerDevice: VacuumCleaner;

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

        this.#adapter = adapter;
        this.#ioBrokerDevice = new VacuumCleaner(
            { ...ChannelDetector.getPatterns().vacuumCleaner, isIoBrokerDevice: false } as DetectedDevice,
            adapter,
            this.enableDeviceTypeStates(),
        );
    }

    #runModeOptions(): readonly ModeOption[] {
        return this.appEndpoint.maybeStateOf(RvcRunModeClient)?.supportedModes ?? [];
    }

    #cleanModeOptions(): readonly ModeOption[] {
        return this.appEndpoint.maybeStateOf(RvcCleanModeClient)?.supportedModes ?? [];
    }

    /** The ioBroker run mode a Matter mode stands for, taken from its tags because the mode numbers are vendor defined. */
    #runModeOf(mode: number | undefined): VacuumCleanerRunMode | undefined {
        if (mode === undefined) {
            return undefined;
        }
        const option = this.#runModeOptions().find(({ mode: supported }) => supported === mode);
        for (const { value } of option?.modeTags ?? []) {
            const runMode = RUN_MODE_BY_TAG.get(value);
            if (runMode !== undefined) {
                return runMode;
            }
        }
        return undefined;
    }

    /** The first Matter mode carrying the tag for an ioBroker run mode. A robot may offer several cleaning modes. */
    #matterRunModeFor(runMode: VacuumCleanerRunMode): number | undefined {
        for (const option of this.#runModeOptions()) {
            for (const { value } of option.modeTags ?? []) {
                if (RUN_MODE_BY_TAG.get(value) === runMode) {
                    return option.mode;
                }
            }
        }
        return undefined;
    }

    #runModes(): { [key: number]: VacuumCleanerRunMode } {
        const modes: { [key: number]: VacuumCleanerRunMode } = {};
        for (const option of this.#runModeOptions()) {
            const runMode = this.#runModeOf(option.mode);
            if (runMode !== undefined) {
                modes[RUN_MODE_KEYS[runMode]] = runMode;
            }
        }
        return modes;
    }

    async #changeRunMode(runMode: VacuumCleanerRunMode): Promise<void> {
        const newMode = this.#matterRunModeFor(runMode);
        if (newMode === undefined) {
            this.#adapter.log.info(`${this.baseId}: Device offers no ${runMode} run mode`);
            return;
        }
        const response = await this.appEndpoint.commandsOf(RvcRunModeClient)?.changeToMode({ newMode });
        if (response !== undefined && response.status !== ModeBase.ModeChangeStatus.Success) {
            this.#adapter.log.info(
                `${this.baseId}: Device rejected run mode ${runMode}: ${response.statusText ?? response.status}`,
            );
        }
    }

    /** Pause, Resume and GoHome are optional, so only a robot that accepts them can be driven with them. */
    #acceptsCommands(...commandNames: string[]): boolean {
        if (!this.appEndpoint.behaviors.has(RvcOperationalStateClient)) {
            return false;
        }
        let commands: ReadonlySet<string>;
        try {
            commands = this.appEndpoint.behaviors.elementsOf(RvcOperationalStateClient).commands;
        } catch (error) {
            // Reading the element list this early throws while the behavior is still initializing
            this.#adapter.log.info(`${this.baseId}: Cannot read the accepted commands of the robot: ${error}`);
            return false;
        }
        return commandNames.every(name => commands.has(name));
    }

    /** Idle is the robot doing nothing, which is what POWER off means for a device type that has no OnOff cluster. */
    #powerOf(mode: number): boolean | undefined {
        const runMode = this.#runModeOf(mode);
        return runMode === undefined ? undefined : runMode !== VacuumCleanerRunMode.Idle;
    }

    /** An empty phase says the robot is in no phase, which a stale phase name would misreport. */
    #phaseOf(currentPhase: number | null | undefined): string {
        if (currentPhase === null || currentPhase === undefined) {
            return '';
        }
        return this.appEndpoint.maybeStateOf(RvcOperationalStateClient)?.phaseList?.[currentPhase] ?? '';
    }

    /**
     * Matter reports a per-area status list rather than a percentage, so the share of areas the robot is done with is
     * the only percentage the cluster backs. Skipped areas count as done because the robot will not return to them.
     */
    #progressOf(progress: ServiceArea.Progress[] | undefined): number | undefined {
        if (!Array.isArray(progress) || progress.length === 0) {
            return undefined;
        }
        const finished = progress.filter(
            ({ status }) =>
                status === ServiceArea.OperationalStatus.Completed || status === ServiceArea.OperationalStatus.Skipped,
        ).length;
        return Math.round((finished / progress.length) * 100);
    }

    protected enableDeviceTypeStates(): DeviceOptions {
        const endpointId = this.appEndpoint.number;

        // A robotic vacuum cleaner has no OnOff cluster, and the ioBroker device type requires POWER, so the run mode
        // is what backs it: idle is off, and any other run mode is the robot doing something.
        this.enableDeviceTypeStateForAttribute(PropertyType.Power, {
            endpointId,
            clusterId: RvcRunMode.id,
            attributeName: 'currentMode',
            convertValue: (value: number) => this.#powerOf(value),
            changeHandler: async (value: boolean) =>
                this.#changeRunMode(value ? VacuumCleanerRunMode.Cleaning : VacuumCleanerRunMode.Idle),
        });

        // Only one property may be mapped to an attribute path, and the one registered last wins it, so POWER is
        // updated from here rather than from its own registration - which then only serves the initial read.
        this.enableDeviceTypeStateForAttribute(PropertyType.RunMode, {
            endpointId,
            clusterId: RvcRunMode.id,
            attributeName: 'currentMode',
            modes: this.#runModes(),
            convertValue: async (value: number) => {
                const power = this.#powerOf(value);
                if (power !== undefined) {
                    await this.ioBrokerDevice.updatePower(power);
                }
                return this.#runModeOf(value);
            },
            changeHandler: async (value: VacuumCleanerRunMode) => this.#changeRunMode(value),
        });

        // RvcCleanMode modes are vendor defined and its tags (Vacuum, Mop, DeepClean) have no ioBroker counterpart,
        // so the device's own labels are the only faithful values to offer.
        const cleanModes: { [key: number]: string } = {};
        const usedCleanModeValues = new Set<string>();
        for (const option of this.#cleanModeOptions()) {
            // Two labels can normalize to the same value, and the reverse lookup a write does needs them distinct
            let value = modeLabelToEnumValue(option.label, option.mode);
            if (usedCleanModeValues.has(value)) {
                value = `${value}_${option.mode}`;
            }
            usedCleanModeValues.add(value);
            cleanModes[option.mode] = value;
        }
        this.enableDeviceTypeStateForAttribute(PropertyType.Mode, {
            endpointId,
            clusterId: RvcCleanMode.id,
            attributeName: 'currentMode',
            modes: cleanModes,
            convertValue: (value: number) => cleanModes[value],
            changeHandler: async (value: string) => {
                const newMode = Number(
                    Object.keys(cleanModes).find(mode => cleanModes[Number(mode)] === value) ?? Number.NaN,
                );
                if (Number.isNaN(newMode)) {
                    this.#adapter.log.info(`${this.baseId}: Device offers no ${value} clean mode`);
                    return;
                }
                const response = await this.appEndpoint.commandsOf(RvcCleanModeClient)?.changeToMode({ newMode });
                if (response !== undefined && response.status !== ModeBase.ModeChangeStatus.Success) {
                    this.#adapter.log.info(
                        `${this.baseId}: Device rejected clean mode ${value}: ${response.statusText ?? response.status}`,
                    );
                }
            },
        });

        this.enableDeviceTypeStateForAttribute(PropertyType.State, {
            endpointId,
            clusterId: RvcOperationalState.id,
            attributeName: 'operationalState',
            modes: {
                [VacuumCleanerStateNumbers.HOME]: VacuumCleanerState.HOME,
                [VacuumCleanerStateNumbers.CLEANING]: VacuumCleanerState.CLEANING,
                [VacuumCleanerStateNumbers.PAUSE]: VacuumCleanerState.PAUSE,
            },
            // Error has no ioBroker counterpart here; it surfaces through ERROR, and STATE keeps what it last knew
            convertValue: (value: number) => STATE_BY_OPERATIONAL_STATE.get(value),
        });

        // The detector types ERROR as a string, so the robot's own error name says more than a raised flag would
        this.enableDeviceTypeStateForAttribute(PropertyType.Error, {
            endpointId,
            clusterId: RvcOperationalState.id,
            attributeName: 'operationalError',
            convertValue: (value: RvcOperationalState.ErrorStateStruct) => {
                const errorStateId = value?.errorStateId;
                if (errorStateId === undefined || errorStateId === OperationalState.ErrorState.NoError) {
                    return '';
                }
                return value.errorStateLabel ?? RvcOperationalState.ErrorState[errorStateId] ?? String(errorStateId);
            },
        });

        this.enableDeviceTypeStateForAttribute(PropertyType.Phase, {
            endpointId,
            clusterId: RvcOperationalState.id,
            attributeName: 'currentPhase',
            convertValue: (value: number | null) => this.#phaseOf(value),
        });
        // The phase name comes from phaseList, so replacing that list renames the phase the robot is in
        this.registerStateChangeHandlerForAttribute({
            endpointId,
            clusterId: RvcOperationalState.id,
            attributeName: 'phaseList',
            matterValueChanged: () =>
                this.updateIoBrokerState(
                    PropertyType.Phase,
                    this.appEndpoint.maybeStateOf(RvcOperationalStateClient)?.currentPhase,
                ),
        });

        this.enableDeviceTypeStateForAttribute(PropertyType.Progress, {
            endpointId,
            clusterId: ServiceArea.id,
            attributeName: 'progress',
            convertValue: (value: ServiceArea.Progress[]) => this.#progressOf(value),
        });

        // Pause and GoHome are commands, so they have no attribute to bind to and no value to read back
        if (this.#acceptsCommands('pause', 'resume')) {
            this.enableDeviceTypeStateForAttribute(PropertyType.Pause, {
                changeHandler: async (value: boolean) => {
                    const commands = this.appEndpoint.commandsOf(RvcOperationalStateClient);
                    const response = value ? await commands?.pause() : await commands?.resume();
                    const errorStateId = response?.commandResponseState?.errorStateId;
                    if (errorStateId !== undefined && errorStateId !== OperationalState.ErrorState.NoError) {
                        this.#adapter.log.info(
                            `${this.baseId}: Device rejected ${value ? 'pause' : 'resume'}: ${errorStateId}`,
                        );
                    }
                },
            });
        }
        if (this.#acceptsCommands('goHome')) {
            this.enableDeviceTypeStateForAttribute(PropertyType.Home, {
                changeHandler: async (value: boolean) => {
                    if (!value) {
                        return;
                    }
                    const response = await this.appEndpoint.commandsOf(RvcOperationalStateClient)?.goHome();
                    const errorStateId = response?.commandResponseState?.errorStateId;
                    if (errorStateId !== undefined && errorStateId !== OperationalState.ErrorState.NoError) {
                        this.#adapter.log.info(`${this.baseId}: Device rejected go home: ${errorStateId}`);
                    }
                },
            });
        }

        return super.enableDeviceTypeStates();
    }

    get ioBrokerDevice(): VacuumCleaner {
        return this.#ioBrokerDevice;
    }
}
