import { type DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import { GenericDevice, type DetectedDevice, type DeviceOptions, StateAccessType } from './GenericDevice';

enum VacuumCleanerMode {
    AUTO = 'AUTO',
    ECO = 'ECO',
    EXPRESS = 'EXPRESS',
    NORMAL = 'NORMAL',
    QUIET = 'QUIET',
}

enum VacuumCleanerWorkMode {
    AUTO = 'AUTO',
    FAST = 'FAST',
    MEDIUM = 'MEDIUM',
    SLOW = 'SLOW',
    TURBO = 'TURBO',
}

enum VacuumCleanerState {
    HOME = 'HOME',
    CLEANING = 'CLEANING',
    PAUSE = 'PAUSE',
}

export enum VacuumCleanerRunMode {
    Idle = 'IDLE',
    Cleaning = 'CLEANING',
    Mapping = 'MAPPING',
}

export enum VacuumCleanerRunModeNumbers {
    IDLE = 0,
    CLEANING = 1,
    MAPPING = 2,
}

export class VacuumCleaner extends GenericDevice {
    #powerState?: DeviceStateObject<boolean | number>;
    #modeState?: DeviceStateObject<VacuumCleanerMode>;
    #getMapBase64State?: DeviceStateObject<string>;
    #getMapUrlState?: DeviceStateObject<string>;
    #workModeState?: DeviceStateObject<VacuumCleanerWorkMode>;
    #getWaterState?: DeviceStateObject<number>;
    #getWasteState?: DeviceStateObject<number>;
    #getStateState?: DeviceStateObject<VacuumCleanerState>;
    #pauseState?: DeviceStateObject<boolean>;
    #getWasteAlarmState?: DeviceStateObject<boolean>;
    #getWaterAlarmState?: DeviceStateObject<boolean>;
    #getFilterState?: DeviceStateObject<number>;
    #getBrushState?: DeviceStateObject<number>;
    #getSensorsState?: DeviceStateObject<number>;
    #getSideBrushState?: DeviceStateObject<number>;
    #homeState?: DeviceStateObject<boolean>;
    #runModeState?: DeviceStateObject<VacuumCleanerRunMode>;
    #getProgressState?: DeviceStateObject<number>;
    #getPhaseState?: DeviceStateObject<string>;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._construction.push(
            this.addDeviceStates([
                {
                    name: 'POWER',
                    valueType: ValueType.Boolean,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.Power,
                    callback: state => (this.#powerState = state),
                },
                {
                    name: 'MODE',
                    valueType: ValueType.Enum,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.Mode,
                    callback: state => (this.#modeState = state),
                },
                {
                    name: 'MAP_BASE64',
                    valueType: ValueType.String,
                    accessType: StateAccessType.Read,
                    type: PropertyType.MapBase64,
                    callback: state => (this.#getMapBase64State = state),
                },
                {
                    name: 'MAP_URL',
                    valueType: ValueType.String,
                    accessType: StateAccessType.Read,
                    type: PropertyType.MapUrl,
                    callback: state => (this.#getMapUrlState = state),
                },
                {
                    name: 'WORK_MODE',
                    valueType: ValueType.Enum,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.WorkMode,
                    callback: state => (this.#workModeState = state),
                },
                {
                    name: 'WATER',
                    valueType: ValueType.NumberPercent,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Water,
                    callback: state => (this.#getWaterState = state),
                },
                {
                    name: 'WASTE',
                    valueType: ValueType.NumberPercent,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Waste,
                    callback: state => (this.#getWasteState = state),
                },
                {
                    name: 'STATE',
                    valueType: ValueType.Enum,
                    accessType: StateAccessType.Read,
                    type: PropertyType.State,
                    callback: state => (this.#getStateState = state),
                },
                {
                    name: 'PAUSE',
                    valueType: ValueType.Button,
                    accessType: StateAccessType.Write,
                    type: PropertyType.Pause,
                    callback: state => (this.#pauseState = state),
                },
                {
                    name: 'WASTE_ALARM',
                    valueType: ValueType.Boolean,
                    accessType: StateAccessType.Read,
                    type: PropertyType.WasteAlarm,
                    callback: state => (this.#getWasteAlarmState = state),
                },
                {
                    name: 'WATER_ALARM',
                    valueType: ValueType.Boolean,
                    accessType: StateAccessType.Read,
                    type: PropertyType.WaterAlarm,
                    callback: state => (this.#getWaterAlarmState = state),
                },
                {
                    name: 'FILTER',
                    valueType: ValueType.NumberPercent,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Filter,
                    callback: state => (this.#getFilterState = state),
                },
                {
                    name: 'BRUSH',
                    valueType: ValueType.NumberPercent,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Brush,
                    callback: state => (this.#getBrushState = state),
                },
                {
                    name: 'SENSORS',
                    valueType: ValueType.NumberPercent,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Sensors,
                    callback: state => (this.#getSensorsState = state),
                },
                {
                    name: 'SIDE_BRUSH',
                    valueType: ValueType.NumberPercent,
                    accessType: StateAccessType.Read,
                    type: PropertyType.SideBrush,
                    callback: state => (this.#getSideBrushState = state),
                },
                {
                    name: 'HOME',
                    valueType: ValueType.Button,
                    accessType: StateAccessType.Write,
                    type: PropertyType.Home,
                    callback: state => (this.#homeState = state),
                },
                {
                    name: 'RUN_MODE',
                    valueType: ValueType.Enum,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.RunMode,
                    callback: state => (this.#runModeState = state),
                },
                {
                    name: 'PROGRESS',
                    valueType: ValueType.NumberPercent,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Progress,
                    callback: state => (this.#getProgressState = state),
                },
                {
                    name: 'PHASE',
                    valueType: ValueType.String,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Phase,
                    callback: state => (this.#getPhaseState = state),
                },
            ]),
        );
    }

    getPower(): boolean | undefined {
        if (!this.#powerState) {
            throw new Error('Power state not found');
        }
        const value = this.#powerState.value;
        return typeof value === 'number' ? value !== 0 : value;
    }

    setPower(value: boolean): Promise<void> {
        if (!this.#powerState) {
            throw new Error('Power state not found');
        }
        return this.#powerState.setValue(value);
    }

    updatePower(value: boolean | number): Promise<void> {
        if (!this.#powerState) {
            throw new Error('Power state not found');
        }
        return this.#powerState.updateValue(value);
    }

    getMode(): VacuumCleanerMode | undefined {
        if (!this.#modeState) {
            throw new Error('Mode state not found');
        }
        return this.#modeState.value;
    }

    setMode(mode: VacuumCleanerMode): Promise<void> {
        if (!this.#modeState) {
            throw new Error('Mode state not found');
        }
        return this.#modeState.setValue(mode);
    }

    getModes(): VacuumCleanerMode[] {
        if (!this.#modeState) {
            throw new Error('Mode state not found');
        }
        return this.#modeState.getModes();
    }

    hasMode(): boolean {
        return !!this.#modeState;
    }

    getMapBase64(): string | undefined {
        if (!this.#getMapBase64State) {
            throw new Error('MapBase64 state not found');
        }
        return this.#getMapBase64State.value;
    }

    getMapUrl(): string | undefined {
        if (!this.#getMapUrlState) {
            throw new Error('MapUrl state not found');
        }
        return this.#getMapUrlState.value;
    }

    getWorkMode(): VacuumCleanerWorkMode | undefined {
        if (!this.#workModeState) {
            throw new Error('WorkMode state not found');
        }
        return this.#workModeState.value;
    }

    setWorkMode(mode: VacuumCleanerWorkMode): Promise<void> {
        if (!this.#workModeState) {
            throw new Error('WorkMode state not found');
        }
        return this.#workModeState.setValue(mode);
    }

    getWorkModes(): VacuumCleanerWorkMode[] {
        if (!this.#workModeState) {
            throw new Error('WorkMode state not found');
        }
        return this.#workModeState.getModes();
    }

    getWater(): number | undefined {
        if (!this.#getWaterState) {
            throw new Error('Water state not found');
        }
        return this.#getWaterState.value;
    }

    getWaste(): number | undefined {
        if (!this.#getWasteState) {
            throw new Error('Waste state not found');
        }
        return this.#getWasteState.value;
    }

    getState(): VacuumCleanerState | undefined {
        if (!this.#getStateState) {
            throw new Error('State state not found');
        }
        return this.#getStateState.value;
    }

    getStateModes(): VacuumCleanerState[] {
        if (!this.#getStateState) {
            throw new Error('State state not found');
        }
        return this.#getStateState.getModes();
    }

    setPause(value: boolean): Promise<void> {
        if (!this.#pauseState) {
            throw new Error('Pause state not found');
        }
        return this.#pauseState.setValue(value);
    }

    getWasteAlarm(): boolean | undefined {
        if (!this.#getWasteAlarmState) {
            throw new Error('WasteAlarm state not found');
        }
        return this.#getWasteAlarmState.value;
    }

    getWaterAlarm(): boolean | undefined {
        if (!this.#getWaterAlarmState) {
            throw new Error('WaterAlarm state not found');
        }
        return this.#getWaterAlarmState.value;
    }

    getFilter(): number | undefined {
        if (!this.#getFilterState) {
            throw new Error('Filter state not found');
        }
        return this.#getFilterState.value;
    }

    getBrush(): number | undefined {
        if (!this.#getBrushState) {
            throw new Error('Brush state not found');
        }
        return this.#getBrushState.value;
    }

    getSensors(): number | undefined {
        if (!this.#getSensorsState) {
            throw new Error('Sensors state not found');
        }
        return this.#getSensorsState.value;
    }

    getSideBrush(): number | undefined {
        if (!this.#getSideBrushState) {
            throw new Error('SideBrush state not found');
        }
        return this.#getSideBrushState.value;
    }

    setHome(value: boolean): Promise<void> {
        if (!this.#homeState) {
            throw new Error('Home state not found');
        }
        return this.#homeState.setValue(value);
    }

    getRunMode(): VacuumCleanerRunMode | undefined {
        if (!this.#runModeState) {
            throw new Error('RunMode state not found');
        }
        return this.#runModeState.value;
    }

    setRunMode(value: VacuumCleanerRunMode): Promise<void> {
        if (!this.#runModeState) {
            throw new Error('RunMode state not found');
        }
        return this.#runModeState.setValue(value);
    }

    getRunModeModes(): VacuumCleanerRunMode[] {
        if (!this.#runModeState) {
            throw new Error('RunMode state not found');
        }
        return this.#runModeState.getModes();
    }

    updateRunMode(value: VacuumCleanerRunMode): Promise<void> {
        if (!this.#runModeState) {
            throw new Error('RunMode state not found');
        }
        return this.#runModeState.updateValue(value);
    }

    hasRunMode(): boolean {
        return !!this.#runModeState;
    }

    getProgress(): number | undefined {
        if (!this.#getProgressState) {
            throw new Error('Progress state not found');
        }
        return this.#getProgressState.value;
    }

    updateProgress(value: number): Promise<void> {
        if (!this.#getProgressState) {
            throw new Error('Progress state not found');
        }
        return this.#getProgressState.updateValue(value);
    }

    hasProgress(): boolean {
        return !!this.#getProgressState;
    }

    getPhase(): string | undefined {
        if (!this.#getPhaseState) {
            throw new Error('Phase state not found');
        }
        return this.#getPhaseState.value;
    }

    updatePhase(value: string): Promise<void> {
        if (!this.#getPhaseState) {
            throw new Error('Phase state not found');
        }
        return this.#getPhaseState.updateValue(value);
    }

    hasPhase(): boolean {
        return !!this.#getPhaseState;
    }
}
