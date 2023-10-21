import GenericDevice, {
    DetectedDevice,
    DeviceStateObject,
    PropertyType,
    StateAccessType,
    ValueType
} from './GenericDevice';

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

class VacuumCleaner extends GenericDevice {
    protected _powerState: DeviceStateObject<boolean> | undefined;
    protected _modeState: DeviceStateObject<VacuumCleanerMode> | undefined;
    protected _getMapBase64State: DeviceStateObject<string> | undefined;
    protected _getMapUrlState: DeviceStateObject<string> | undefined;
    protected _workModeState: DeviceStateObject<VacuumCleanerWorkMode> | undefined;
    protected _getWaterState: DeviceStateObject<number> | undefined;
    protected _getWasteState: DeviceStateObject<number> | undefined;
    protected _getBatteryState: DeviceStateObject<number> | undefined;
    protected _getStateState: DeviceStateObject<VacuumCleanerState> | undefined;
    protected _pauseState: DeviceStateObject<boolean> | undefined;
    protected _getWasteAlarmState: DeviceStateObject<boolean> | undefined;
    protected _getWaterAlarmState: DeviceStateObject<boolean> | undefined;
    protected _getFilterState: DeviceStateObject<number> | undefined;
    protected _getBrushState: DeviceStateObject<number> | undefined;
    protected _getSensorsState: DeviceStateObject<number> | undefined;
    protected _getSideBrushState: DeviceStateObject<number> | undefined;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter) {
        super(detectedDevice, adapter);

        this._ready.push(this.addDeviceStates([
            { name: 'POWER', valueType: ValueType.Boolean, accessType: StateAccessType.ReadWrite, type: PropertyType.Power, callback: state => this._powerState = state },
            { name: 'MODE', valueType: ValueType.Enum, accessType: StateAccessType.ReadWrite, type: PropertyType.Mode, callback: state => this._modeState = state },
            { name: 'MAP_BASE64', valueType: ValueType.String, accessType: StateAccessType.Read, type: PropertyType.MapBase64, callback: state => this._getMapBase64State = state },
            { name: 'MAP_URL', valueType: ValueType.String, accessType: StateAccessType.Read, type: PropertyType.MapUrl, callback: state => this._getMapUrlState = state },
            { name: 'WORK_MODE', valueType: ValueType.Enum, accessType: StateAccessType.ReadWrite, type: PropertyType.WorkMode, callback: state => this._workModeState = state },
            { name: 'WATER', valueType: ValueType.NumberPercent, accessType: StateAccessType.Read, type: PropertyType.Water, callback: state => this._getWaterState = state },
            { name: 'WASTE', valueType: ValueType.NumberPercent, accessType: StateAccessType.Read, type: PropertyType.Waste, callback: state => this._getWasteState = state },
            { name: 'BATTERY', valueType: ValueType.NumberPercent, accessType: StateAccessType.Read, type: PropertyType.Battery, callback: state => this._getBatteryState = state },
            { name: 'STATE', valueType: ValueType.Enum, accessType: StateAccessType.Read, type: PropertyType.State, callback: state => this._getStateState = state },
            { name: 'PAUSE', valueType: ValueType.Button, accessType: StateAccessType.Write, type: PropertyType.Pause, callback: state => this._pauseState = state },
            { name: 'WASTE_ALARM', valueType: ValueType.Boolean, accessType: StateAccessType.Read, type: PropertyType.WasteAlarm, callback: state => this._getWasteAlarmState = state },
            { name: 'WATER_ALARM', valueType: ValueType.Boolean, accessType: StateAccessType.Read, type: PropertyType.WaterAlarm, callback: state => this._getWaterAlarmState = state },
            { name: 'FILTER', valueType: ValueType.NumberPercent, accessType: StateAccessType.Read, type: PropertyType.Filter, callback: state => this._getFilterState = state },
            { name: 'BRUSH', valueType: ValueType.NumberPercent, accessType: StateAccessType.Read, type: PropertyType.Brush, callback: state => this._getBrushState = state },
            { name: 'SENSORS', valueType: ValueType.NumberPercent, accessType: StateAccessType.Read, type: PropertyType.Sensors, callback: state => this._getSensorsState = state },
            { name: 'SIDE_BRUSH', valueType: ValueType.NumberPercent, accessType: StateAccessType.Read, type: PropertyType.SideBrush, callback: state => this._getSideBrushState = state },
        ]));
    }

    getPower(): boolean | undefined {
        if (!this._powerState) {
            throw new Error('Power state not found');
        }
        return this._powerState.value;
    }

    async setPower(value: boolean): Promise<void> {
        if (!this._powerState) {
            throw new Error('Power state not found');
        }
        return this._powerState.setValue(value);
    }

    getMode(): VacuumCleanerMode | undefined {
        if (!this._modeState) {
            throw new Error('Mode state not found');
        }
        return this._modeState.value;
    }

    async setMode(mode: VacuumCleanerMode): Promise<void> {
        if (!this._modeState) {
            throw new Error('Mode state not found');
        }
        return this._modeState.setValue(mode);
    }

    getModes(): Promise<VacuumCleanerMode[]> {
        if (!this._modeState) {
            throw new Error('Mode state not found');
        }
        return this._modeState.getModes();
    }

    getMapBase64(): string | undefined {
        if (!this._getMapBase64State) {
            throw new Error('MapBase64 state not found');
        }
        return this._getMapBase64State.value;
    }

    getMapUrl(): string | undefined {
        if (!this._getMapUrlState) {
            throw new Error('MapUrl state not found');
        }
        return this._getMapUrlState.value;
    }

    getWorkMode(): VacuumCleanerWorkMode | undefined {
        if (!this._workModeState) {
            throw new Error('WorkMode state not found');
        }
        return this._workModeState.value;
    }

    async setWorkMode(mode: VacuumCleanerWorkMode): Promise<void> {
        if (!this._workModeState) {
            throw new Error('WorkMode state not found');
        }
        return this._workModeState.setValue(mode);
    }

    getWorkModes(): Promise<VacuumCleanerWorkMode[]> {
        if (!this._workModeState) {
            throw new Error('WorkMode state not found');
        }
        return this._workModeState.getModes();
    }

    getWater(): number | undefined {
        if (!this._getWaterState) {
            throw new Error('Water state not found');
        }
        return this._getWaterState.value;
    }

    getWaste(): number | undefined {
        if (!this._getWasteState) {
            throw new Error('Waste state not found');
        }
        return this._getWasteState.value;
    }

    getBattery(): number | undefined {
        if (!this._getBatteryState) {
            throw new Error('Battery state not found');
        }
        return this._getBatteryState.value;
    }

    getState(): VacuumCleanerState | undefined {
        if (!this._getStateState) {
            throw new Error('State state not found');
        }
        return this._getStateState.value;
    }

    getStateModes(): Promise<VacuumCleanerState[]> {
        if (!this._getStateState) {
            throw new Error('State state not found');
        }
        return this._getStateState.getModes();
    }

    async setPause(value: boolean): Promise<void> {
        if (!this._pauseState) {
            throw new Error('Pause state not found');
        }
        return this._pauseState.setValue(value);
    }

    getWasteAlarm(): boolean | undefined {
        if (!this._getWasteAlarmState) {
            throw new Error('WasteAlarm state not found');
        }
        return this._getWasteAlarmState.value;
    }

    getWaterAlarm(): boolean | undefined {
        if (!this._getWaterAlarmState) {
            throw new Error('WaterAlarm state not found');
        }
        return this._getWaterAlarmState.value;
    }

    getFilter(): number | undefined {
        if (!this._getFilterState) {
            throw new Error('Filter state not found');
        }
        return this._getFilterState.value;
    }

    getBrush(): number | undefined {
        if (!this._getBrushState) {
            throw new Error('Brush state not found');
        }
        return this._getBrushState.value;
    }

    getSensors(): number | undefined {
        if (!this._getSensorsState) {
            throw new Error('Sensors state not found');
        }
        return this._getSensorsState.value;
    }

    getSideBrush(): number | undefined {
        if (!this._getSideBrushState) {
            throw new Error('SideBrush state not found');
        }
        return this._getSideBrushState.value;
    }
}

export default VacuumCleaner;