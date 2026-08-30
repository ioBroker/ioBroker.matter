import { Thermostat as MatterThermostat } from '@matter/main/clusters';
import { SetpointKind } from '../lib/devices/ClimateControlDevice';
import { MatterConverters } from './ConversionUtils';

/** The device modes a Matter Thermostat cluster can represent, named independently of the device's own enum. */
export interface ClimateModeMap<TMode extends string> {
    heat: TMode;
    cool: TMode;
    auto: TMode;
    off: TMode;
    fanOnly: TMode;
    dry: TMode;
}

export interface ThermostatFeatureDerivation<TMode extends string> {
    /** Thermostat cluster features the endpoint has to declare. */
    clusterModes: MatterThermostat.Feature[];
    /** Modes the Matter side can represent, including the ones only a dedicated setpoint state implies. */
    supportedModes: TMode[];
    /** Modes the adapter reacts on when the ioBroker device reports them. */
    validModes: TMode[];
    /** Device modes without a Matter counterpart. */
    ignoredModes: TMode[];
    /** The device offers Auto but not both Heating and Cooling, so AutoMode was left out. */
    autoModeIgnored: boolean;
    /** Neither Heating nor Cooling could be derived, so `fallbackFeature` was declared instead. */
    fallbackApplied: boolean;
}

export interface ThermostatFeatureOptions<TMode extends string> {
    modes: TMode[];
    modeMap: ClimateModeMap<TMode>;
    supportedSetpointKinds: SetpointKind[];
    /** Modes the adapter accepts from ioBroker without a Matter feature of their own. */
    passthroughModes?: TMode[];
    fallbackFeature: MatterThermostat.Feature.Heating | MatterThermostat.Feature.Cooling;
}

/**
 * Derives the Thermostat cluster features from the modes and setpoint states an ioBroker climate device offers.
 *
 * Reports what it had to leave out instead of logging, so each device type keeps its own wording.
 */
export function deriveThermostatFeatures<TMode extends string>(
    options: ThermostatFeatureOptions<TMode>,
): ThermostatFeatureDerivation<TMode> {
    const { modes, modeMap, supportedSetpointKinds, passthroughModes, fallbackFeature } = options;
    const clusterModes = new Array<MatterThermostat.Feature>();
    const supportedModes = new Array<TMode>();
    const validModes = new Array<TMode>();
    const ignoredModes = new Array<TMode>();

    for (const mode of modes) {
        if (mode === modeMap.heat) {
            validModes.push(modeMap.heat);
        } else if (mode === modeMap.cool) {
            validModes.push(modeMap.cool);
        } else if (mode === modeMap.auto) {
            // Handled below, AutoMode additionally requires Heating and Cooling
        } else if (mode === modeMap.off || mode === modeMap.fanOnly || mode === modeMap.dry) {
            supportedModes.push(mode);
            validModes.push(mode);
        } else if (passthroughModes?.includes(mode)) {
            validModes.push(mode);
        } else {
            ignoredModes.push(mode);
        }
    }

    // occupiedHeatingSetpoint/occupiedCoolingSetpoint are conformant to the Heating/Cooling feature, and a
    // setpoint no ioBroker state can back would be advertised but never readable or writable, so the kinds a
    // state resolves to are the authority here rather than the modes the device happens to list.
    for (const kind of supportedSetpointKinds) {
        if (kind === SetpointKind.Heating) {
            clusterModes.push(MatterThermostat.Feature.Heating);
            supportedModes.push(modeMap.heat);
        } else if (kind === SetpointKind.Cooling) {
            clusterModes.push(MatterThermostat.Feature.Cooling);
            supportedModes.push(modeMap.cool);
        }
    }

    const offersAuto = modes.includes(modeMap.auto);
    const canAutoMode =
        clusterModes.includes(MatterThermostat.Feature.Heating) &&
        clusterModes.includes(MatterThermostat.Feature.Cooling);
    if (offersAuto && canAutoMode) {
        clusterModes.push(MatterThermostat.Feature.AutoMode);
        supportedModes.push(modeMap.auto);
        validModes.push(modeMap.auto);
    }

    let fallbackApplied = false;
    if (
        !clusterModes.includes(MatterThermostat.Feature.Heating) &&
        !clusterModes.includes(MatterThermostat.Feature.Cooling)
    ) {
        clusterModes.push(fallbackFeature);
        supportedModes.push(fallbackFeature === MatterThermostat.Feature.Heating ? modeMap.heat : modeMap.cool);
        fallbackApplied = true;
    }

    return {
        clusterModes,
        supportedModes,
        validModes,
        ignoredModes,
        autoModeIgnored: offersAuto && !canAutoMode,
        fallbackApplied,
    };
}

/** What the Thermostat cluster itself permits, and the widest range to publish when the device declares none. */
const ABSOLUTE_SETPOINT_RANGE = { min: 0, max: 50 };

/** Thermostat cluster attributes seeded when the endpoint is created; real values follow during initialization. */
export interface ThermostatInitialState {
    systemMode: MatterThermostat.SystemMode;
    controlSequenceOfOperation: MatterThermostat.ControlSequenceOfOperation;
    minSetpointDeadBand: number | undefined;
    absMinHeatSetpointLimit: number | undefined;
    absMaxHeatSetpointLimit: number | undefined;
    absMinCoolSetpointLimit: number | undefined;
    absMaxCoolSetpointLimit: number | undefined;
}

/**
 * @param clusterModes the Thermostat cluster features the endpoint declares
 * @param preferredSetpointKind which of the two the device is primarily built for, used while no real mode is known
 */
export function thermostatInitialState(
    clusterModes: MatterThermostat.Feature[],
    preferredSetpointKind: SetpointKind,
): ThermostatInitialState {
    const hasHeating = clusterModes.includes(MatterThermostat.Feature.Heating);
    const hasCooling = clusterModes.includes(MatterThermostat.Feature.Cooling);
    const systemMode =
        preferredSetpointKind === SetpointKind.Heating
            ? hasHeating
                ? MatterThermostat.SystemMode.Heat
                : MatterThermostat.SystemMode.Cool
            : hasCooling
              ? MatterThermostat.SystemMode.Cool
              : MatterThermostat.SystemMode.Heat;

    return {
        systemMode,
        controlSequenceOfOperation:
            hasHeating && hasCooling
                ? MatterThermostat.ControlSequenceOfOperation.CoolingAndHeating
                : hasCooling
                  ? MatterThermostat.ControlSequenceOfOperation.CoolingOnly
                  : MatterThermostat.ControlSequenceOfOperation.HeatingOnly,
        minSetpointDeadBand: clusterModes.includes(MatterThermostat.Feature.AutoMode) ? 0 : undefined,
        absMinHeatSetpointLimit: hasHeating
            ? MatterConverters.toMatterHundredths(ABSOLUTE_SETPOINT_RANGE.min)
            : undefined,
        absMaxHeatSetpointLimit: hasHeating
            ? MatterConverters.toMatterHundredths(ABSOLUTE_SETPOINT_RANGE.max)
            : undefined,
        absMinCoolSetpointLimit: hasCooling
            ? MatterConverters.toMatterHundredths(ABSOLUTE_SETPOINT_RANGE.min)
            : undefined,
        absMaxCoolSetpointLimit: hasCooling
            ? MatterConverters.toMatterHundredths(ABSOLUTE_SETPOINT_RANGE.max)
            : undefined,
    };
}

/** The Thermostat attributes the setpoint bridge reads back from its endpoint. */
export interface ThermostatSetpointState {
    systemMode: MatterThermostat.SystemMode;
    occupiedHeatingSetpoint: number | undefined;
    occupiedCoolingSetpoint: number | undefined;
}

/** The Thermostat attributes the setpoint bridge writes. */
export interface ThermostatSetpointPatch {
    occupiedHeatingSetpoint?: number;
    occupiedCoolingSetpoint?: number;
}

/**
 * The part of a climate device the setpoint bridge drives. Structural on purpose: the bridge has no use for the
 * mode enum that makes the device classes differ.
 */
export interface SetpointDevice {
    readonly adapter: ioBroker.Adapter;
    hasSetpoint(kind: SetpointKind): boolean;
    getSetpoint(kind: SetpointKind): number | undefined;
    setSetpoint(kind: SetpointKind, value: number): Promise<void>;
    getSetpointMinMax(kind: SetpointKind): { min: number; max: number } | null;
    hasLevel(): boolean;
    getLevel(): number | undefined;
    hasLevelHeating(): boolean;
    hasLevelCooling(): boolean;
    cropValue(value: number, min: number, max: number, logMinMaxInfo?: boolean): number;
}

export interface ThermostatSetpointBridgeOptions {
    device: SetpointDevice;
    uuid: string;
    /** Whether the endpoint declares the matching cluster feature, so the setpoint attribute exists at all. */
    supportsHeating: boolean;
    supportsCooling: boolean;
    readState: () => ThermostatSetpointState;
    writeState: (patch: ThermostatSetpointPatch) => Promise<void>;
    scheduleDebounce: (callback: () => void, ms: number) => ioBroker.Timeout | undefined;
    cancelDebounce: (timeout: ioBroker.Timeout | undefined) => void;
}

/** Default setpoint range per kind, used while the ioBroker state declares none. */
export type SetpointRangeDefaults = Record<SetpointKind, { min: number; max: number }>;

/**
 * Moves setpoints between the Thermostat cluster attributes of one endpoint and an ioBroker climate device.
 *
 * The endpoint is reached through the two accessors the owning converter supplies, so the different endpoint and
 * behavior types of the device mappings stay where they are declared.
 */
export class ThermostatSetpointBridge {
    readonly #options: ThermostatSetpointBridgeOptions;
    #debounceTimeout?: ioBroker.Timeout;

    constructor(options: ThermostatSetpointBridgeOptions) {
        this.#options = options;
    }

    get #device(): SetpointDevice {
        return this.#options.device;
    }

    get #log(): ioBroker.Logger {
        return this.#options.device.adapter.log;
    }

    #supports(kind: SetpointKind): boolean {
        return kind === SetpointKind.Heating ? this.#options.supportsHeating : this.#options.supportsCooling;
    }

    #patch(kind: SetpointKind, matterValue: number): ThermostatSetpointPatch {
        return kind === SetpointKind.Heating
            ? { occupiedHeatingSetpoint: matterValue }
            : { occupiedCoolingSetpoint: matterValue };
    }

    /** The value the ioBroker side currently holds for `kind`, if any state backs it right now. */
    #setpointValue(kind: SetpointKind): number | undefined {
        if (!this.#device.hasSetpoint(kind)) {
            return undefined;
        }
        const value = this.#device.getSetpoint(kind);
        return typeof value === 'number' ? value : undefined;
    }

    /**
     * Both kinds resolve to the same ioBroker state when the device exposes neither dedicated setpoint, so in
     * Auto only one of them may be written — the second write would just overwrite the first.
     */
    get #setpointStateIsShared(): boolean {
        return !this.#device.hasLevelHeating() && !this.#device.hasLevelCooling();
    }

    /**
     * Puts the value the ioBroker side really holds back on a setpoint attribute. A dropped write would otherwise
     * leave the controller showing a temperature the device never accepted, with nothing to correct it later.
     */
    #restoreSetpointAttribute(kind: SetpointKind): void {
        const value = this.#device.hasLevel() ? this.#device.getLevel() : undefined;
        if (!this.#supports(kind) || typeof value !== 'number') {
            return;
        }
        this.#options
            .writeState(this.#patch(kind, MatterConverters.toMatterHundredths(value)))
            .catch(error => this.#log.warn(`Error restoring ${kind} setpoint: ${error.message}`));
    }

    #writeSetpoint(kind: SetpointKind, matterValue: number): void {
        if (!this.#device.hasSetpoint(kind)) {
            // The shared setpoint state stands for the other kind while the ioBroker mode disagrees with the Matter
            // system mode; writing it anyway would store a temperature meant for one kind under the other
            this.#log.debug(
                `${this.#options.uuid}: Dropping ${kind} setpoint write, no ioBroker state currently represents the ${kind} setpoint`,
            );
            this.#restoreSetpointAttribute(kind);
            return;
        }
        const value = MatterConverters.fromMatterHundredths(matterValue);
        this.#log.debug(`Setting ${kind} setpoint to ${value} after debounce`);
        this.#device
            .setSetpoint(kind, value)
            .catch(error => this.#log.warn(`Error setting ${kind} setpoint: ${error.message}`));
    }

    /** Hands the setpoint attributes a controller wrote to the ioBroker device once the writes settled. */
    scheduleSetpointWrite(delay = 1500): void {
        if (!this.#device.hasSetpoint(SetpointKind.Heating) && !this.#device.hasSetpoint(SetpointKind.Cooling)) {
            return;
        }
        this.#options.cancelDebounce(this.#debounceTimeout);
        this.#debounceTimeout = this.#options.scheduleDebounce(() => {
            this.#debounceTimeout = undefined;
            const state = this.#options.readState();
            const systemMode = state.systemMode;
            if (
                (systemMode === MatterThermostat.SystemMode.Heat || systemMode === MatterThermostat.SystemMode.Auto) &&
                typeof state.occupiedHeatingSetpoint === 'number'
            ) {
                this.#writeSetpoint(SetpointKind.Heating, state.occupiedHeatingSetpoint);
            }
            if (
                (systemMode === MatterThermostat.SystemMode.Cool ||
                    (systemMode === MatterThermostat.SystemMode.Auto && !this.#setpointStateIsShared)) &&
                typeof state.occupiedCoolingSetpoint === 'number'
            ) {
                this.#writeSetpoint(SetpointKind.Cooling, state.occupiedCoolingSetpoint);
            } else if (
                systemMode === MatterThermostat.SystemMode.Auto &&
                this.#setpointStateIsShared &&
                typeof state.occupiedCoolingSetpoint === 'number'
            ) {
                this.#log.debug(
                    `${this.#options.uuid}: Dropping cooling setpoint write, in Auto the single ioBroker setpoint state follows the heating setpoint`,
                );
                this.#restoreSetpointAttribute(SetpointKind.Cooling);
            }
        }, delay);
    }

    /** Setpoint attributes and their limits as the ioBroker device currently has them. */
    initialSetpointState(defaults: SetpointRangeDefaults): Record<string, number> {
        const data: Record<string, number> = {};
        for (const kind of [SetpointKind.Heating, SetpointKind.Cooling]) {
            if (!this.#supports(kind)) {
                continue;
            }
            const setpoint = this.#setpointValue(kind);
            if (setpoint === undefined) {
                continue;
            }
            // A range the ioBroker state does not declare is unknown, not narrow: publishing the display
            // default as a cluster limit would reject setpoints the device itself accepts
            const declaredMinMax = this.#device.getSetpointMinMax(kind);
            const limits = declaredMinMax ?? ABSOLUTE_SETPOINT_RANGE;
            const minMax = declaredMinMax ?? defaults[kind];
            const heating = kind === SetpointKind.Heating;
            data[heating ? 'occupiedHeatingSetpoint' : 'occupiedCoolingSetpoint'] = MatterConverters.toMatterHundredths(
                this.#device.cropValue(setpoint, minMax.min, minMax.max, true),
            );
            data[heating ? 'minHeatSetpointLimit' : 'minCoolSetpointLimit'] = MatterConverters.toMatterHundredths(
                Math.max(limits.min, ABSOLUTE_SETPOINT_RANGE.min),
            );
            data[heating ? 'maxHeatSetpointLimit' : 'maxCoolSetpointLimit'] = MatterConverters.toMatterHundredths(
                Math.min(limits.max, ABSOLUTE_SETPOINT_RANGE.max),
            );
        }
        return data;
    }

    /** Reports the plain `SET` state, which only stands for a kind that has no dedicated state of its own. */
    async applyLevelChange(value: number): Promise<void> {
        const systemMode = this.#options.readState().systemMode;
        const matterValue = MatterConverters.toMatterHundredths(value);
        if (
            !this.#device.hasLevelHeating() &&
            (systemMode === MatterThermostat.SystemMode.Heat || systemMode === MatterThermostat.SystemMode.Auto)
        ) {
            await this.#options.writeState({ occupiedHeatingSetpoint: matterValue });
        }
        if (
            !this.#device.hasLevelCooling() &&
            (systemMode === MatterThermostat.SystemMode.Cool || systemMode === MatterThermostat.SystemMode.Auto)
        ) {
            await this.#options.writeState({ occupiedCoolingSetpoint: matterValue });
        }
    }

    /** Reports a dedicated `SET_HEATING`/`SET_COOLING` state. */
    async applyDedicatedLevelChange(kind: SetpointKind, value: number): Promise<void> {
        await this.#options.writeState(this.#patch(kind, MatterConverters.toMatterHundredths(value)));
    }
}
