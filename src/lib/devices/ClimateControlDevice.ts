import { type DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import { ElectricityDataDevice } from './ElectricityDataDevice';
import { type DetectedDevice, type DeviceOptions, StateAccessType } from './GenericDevice';
import type { CustomStatesRecord } from '../../matter/to-iobroker/custom-states';

/** The two setpoints a climate control can hold, independent of which ioBroker state backs them. */
export enum SetpointKind {
    Heating = 'heating',
    Cooling = 'cooling',
}

/** Mode values that identify the kind of setpoint a device is currently working towards. */
const HEATING_MODE = 'HEAT';
const COOLING_MODE = 'COOL';

const fahrenheitConversion = {
    '°F': (value: number, toDefaultUnit: boolean): number => (toDefaultUnit ? (value - 32) / 1.8 : value * 1.8 + 32),
};

/**
 * Shared setpoint and mode handling for the device types that control a room temperature.
 *
 * The type detector puts `SET`, `SET_HEATING` and `SET_COOLING` into one `requiredOneOf` group, so a device
 * is detected with any non-empty subset of them. The dedicated states name their kind in the role, the plain
 * `SET` does not and has to be read together with the mode. Consumers ask for a {@link SetpointKind} and get
 * whichever state currently backs it, so they never have to know which of the three a device exposes.
 */
export abstract class ClimateControlDevice<
    TMode extends string,
    TWorkingMode extends string,
> extends ElectricityDataDevice {
    #levelState?: DeviceStateObject<number>;
    #levelHeatingState?: DeviceStateObject<number>;
    #levelCoolingState?: DeviceStateObject<number>;
    #modeState?: DeviceStateObject<TMode>;
    #workingModeState?: DeviceStateObject<TWorkingMode>;

    constructor(
        detectedDevice: DetectedDevice,
        adapter: ioBroker.Adapter,
        options?: DeviceOptions,
        customStateDefinitions?: CustomStatesRecord,
    ) {
        super(detectedDevice, adapter, options, customStateDefinitions);

        this._construction.push(
            this.addDeviceStates([
                {
                    name: 'SET',
                    valueType: ValueType.NumberMinMax,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.Level,
                    unitConversionMap: fahrenheitConversion,
                    callback: state => (this.#levelState = state),
                },
                {
                    name: 'SET_HEATING',
                    valueType: ValueType.NumberMinMax,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.LevelHeating,
                    unitConversionMap: fahrenheitConversion,
                    callback: state => (this.#levelHeatingState = state),
                },
                {
                    name: 'SET_COOLING',
                    valueType: ValueType.NumberMinMax,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.LevelCooling,
                    unitConversionMap: fahrenheitConversion,
                    callback: state => (this.#levelCoolingState = state),
                },
                {
                    name: 'MODE',
                    valueType: ValueType.Enum,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.Mode,
                    callback: state => (this.#modeState = state),
                },
                {
                    name: 'WORKING_MODE',
                    valueType: ValueType.Enum,
                    accessType: StateAccessType.Read,
                    type: PropertyType.WorkingMode,
                    callback: state => (this.#workingModeState = state),
                },
            ]),
        );
    }

    /**
     * The setpoint kinds this device can work towards, derived from the dedicated setpoint states and from the
     * modes it offers. An empty result means the device exposes a single setpoint of unknown kind — deciding
     * what to do with that is the caller's policy, not the device's.
     *
     * This is the stable capability of the device, unlike {@link hasSetpoint} which answers which state backs a
     * kind right now and changes with the mode.
     */
    supportedSetpointKinds(): SetpointKind[] {
        const kinds = new Array<SetpointKind>();
        const modes = this.#modeState ? this.#modeState.getModes() : [];
        if (this.#levelHeatingState || modes.some(mode => mode === HEATING_MODE)) {
            kinds.push(SetpointKind.Heating);
        }
        if (this.#levelCoolingState || modes.some(mode => mode === COOLING_MODE)) {
            kinds.push(SetpointKind.Cooling);
        }
        return kinds;
    }

    /** Whether the plain `SET` state stands for `kind` right now. */
    #levelRepresents(kind: SetpointKind): boolean {
        const mode = this.#modeState?.value;
        if (mode === HEATING_MODE) {
            return kind === SetpointKind.Heating;
        }
        if (mode === COOLING_MODE) {
            return kind === SetpointKind.Cooling;
        }
        const supported = this.supportedSetpointKinds();
        return supported.length === 0 || supported.includes(kind);
    }

    #setpointState(kind: SetpointKind): DeviceStateObject<number> | undefined {
        const dedicated = kind === SetpointKind.Heating ? this.#levelHeatingState : this.#levelCoolingState;
        if (dedicated) {
            return dedicated;
        }
        return this.#levelState && this.#levelRepresents(kind) ? this.#levelState : undefined;
    }

    #requireSetpointState(kind: SetpointKind): DeviceStateObject<number> {
        const state = this.#setpointState(kind);
        if (!state) {
            throw new Error(`No ${kind} setpoint state found`);
        }
        return state;
    }

    hasSetpoint(kind: SetpointKind): boolean {
        return !!this.#setpointState(kind);
    }

    getSetpoint(kind: SetpointKind): number | undefined {
        return this.#requireSetpointState(kind).value;
    }

    async setSetpoint(kind: SetpointKind, value: number): Promise<void> {
        await this.#requireSetpointState(kind).setValue(value);
    }

    async updateSetpoint(kind: SetpointKind, value: number): Promise<void> {
        await this.#requireSetpointState(kind).updateValue(value);
    }

    getSetpointMinMax(kind: SetpointKind): { min: number; max: number } | null {
        return this.#requireSetpointState(kind).getMinMax();
    }

    async updateSetpointMinMax(
        kind: SetpointKind,
        min: number | undefined,
        max: number | undefined,
        step = 0.5,
    ): Promise<void> {
        await this.#requireSetpointState(kind).updateMinMax({ min, max, step });
    }

    getLevel(): number | undefined {
        if (!this.#levelState) {
            throw new Error('Level state not found');
        }
        return this.#levelState.value;
    }

    setLevel(value: number): Promise<void> {
        if (!this.#levelState) {
            throw new Error('Level state not found');
        }
        return this.#levelState.setValue(value);
    }

    updateLevel(value: number): Promise<void> {
        if (!this.#levelState) {
            throw new Error('Level state not found');
        }
        return this.#levelState.updateValue(value);
    }

    hasLevel(): boolean {
        return !!this.#levelState;
    }

    getLevelMinMax(): { min: number; max: number } | null {
        if (!this.#levelState) {
            throw new Error('Level state not found');
        }
        return this.#levelState.getMinMax();
    }

    updateLevelMinMax(min: number | undefined, max: number | undefined, step = 0.5): Promise<void> {
        if (!this.#levelState) {
            throw new Error('Level state not found');
        }
        return this.#levelState.updateMinMax({ min, max, step });
    }

    getLevelHeating(): number | undefined {
        if (!this.#levelHeatingState) {
            throw new Error('Heating level state not found');
        }
        return this.#levelHeatingState.value;
    }

    setLevelHeating(value: number): Promise<void> {
        if (!this.#levelHeatingState) {
            throw new Error('Heating level state not found');
        }
        return this.#levelHeatingState.setValue(value);
    }

    updateLevelHeating(value: number): Promise<void> {
        if (!this.#levelHeatingState) {
            throw new Error('Heating level state not found');
        }
        return this.#levelHeatingState.updateValue(value);
    }

    hasLevelHeating(): boolean {
        return !!this.#levelHeatingState;
    }

    getLevelCooling(): number | undefined {
        if (!this.#levelCoolingState) {
            throw new Error('Cooling level state not found');
        }
        return this.#levelCoolingState.value;
    }

    setLevelCooling(value: number): Promise<void> {
        if (!this.#levelCoolingState) {
            throw new Error('Cooling level state not found');
        }
        return this.#levelCoolingState.setValue(value);
    }

    updateLevelCooling(value: number): Promise<void> {
        if (!this.#levelCoolingState) {
            throw new Error('Cooling level state not found');
        }
        return this.#levelCoolingState.updateValue(value);
    }

    hasLevelCooling(): boolean {
        return !!this.#levelCoolingState;
    }

    getModes(): TMode[] {
        if (!this.#modeState) {
            throw new Error('Mode state not found');
        }
        return this.#modeState.getModes();
    }

    updateModes(modes: { [key: string]: TMode }): Promise<void> {
        if (!this.#modeState) {
            throw new Error('Mode state not found');
        }
        return this.#modeState.updateModes(modes);
    }

    setMode(mode: TMode): Promise<void> {
        if (!this.#modeState) {
            throw new Error('Mode state not found');
        }
        return this.#modeState.setValue(mode);
    }

    getMode(): TMode | undefined {
        if (!this.#modeState) {
            throw new Error('Mode state not found');
        }
        return this.#modeState.value;
    }

    updateMode(mode: TMode): Promise<void> {
        if (!this.#modeState) {
            throw new Error('Mode state not found');
        }
        return this.#modeState.updateValue(mode);
    }

    hasMode(): boolean {
        return !!this.#modeState;
    }

    getWorkingMode(): TWorkingMode | undefined {
        if (!this.#workingModeState) {
            throw new Error('Working mode state not found');
        }
        return this.#workingModeState.value;
    }

    updateWorkingMode(mode: TWorkingMode): Promise<void> {
        if (!this.#workingModeState) {
            throw new Error('Working mode state not found');
        }
        return this.#workingModeState.updateValue(mode);
    }

    getWorkingModes(): TWorkingMode[] {
        if (!this.#workingModeState) {
            throw new Error('Working mode state not found');
        }
        return this.#workingModeState.getModes();
    }

    updateWorkingModes(modes: { [key: string]: TWorkingMode }): Promise<void> {
        if (!this.#workingModeState) {
            throw new Error('Working mode state not found');
        }
        return this.#workingModeState.updateModes(modes);
    }

    hasWorkingMode(): boolean {
        return !!this.#workingModeState;
    }
}
