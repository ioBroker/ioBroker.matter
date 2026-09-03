import {
    AirConditionerAirflowDirection,
    AirConditionerAirflowDirectionNumbers,
    AirConditionerSpeed,
    AirConditionerSpeedNumbers,
    AirConditionerSwing,
    AirConditionerSwingNumbers,
} from './AirCondition';
import { type DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import { ElectricityDataDevice } from './ElectricityDataDevice';
import { type DetectedDevice, type DeviceOptions, StateAccessType } from './GenericDevice';
import type { CustomStatesRecord } from '../../matter/to-iobroker/custom-states';

export type FanSpeed = AirConditionerSpeed;
export const FanSpeed = AirConditionerSpeed;
export type FanSpeedNumbers = AirConditionerSpeedNumbers;
export const FanSpeedNumbers = AirConditionerSpeedNumbers;

export type FanSwing = AirConditionerSwing;
export const FanSwing = AirConditionerSwing;
export type FanSwingNumbers = AirConditionerSwingNumbers;
export const FanSwingNumbers = AirConditionerSwingNumbers;

export type FanAirflowDirection = AirConditionerAirflowDirection;
export const FanAirflowDirection = AirConditionerAirflowDirection;
export type FanAirflowDirectionNumbers = AirConditionerAirflowDirectionNumbers;
export const FanAirflowDirectionNumbers = AirConditionerAirflowDirectionNumbers;

export class Fan extends ElectricityDataDevice {
    #speedState?: DeviceStateObject<FanSpeed>;
    #powerState?: DeviceStateObject<boolean | number>;
    #speedLevelState?: DeviceStateObject<number>;
    #swingState?: DeviceStateObject<FanSwing | boolean>;
    #airflowDirectionState?: DeviceStateObject<FanAirflowDirection>;
    #onTimeState?: DeviceStateObject<number>;

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
                    name: 'SPEED',
                    valueType: ValueType.Enum,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.Speed,
                    callback: state => (this.#speedState = state),
                },
                {
                    name: 'POWER',
                    valueType: ValueType.Boolean,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.Power,
                    callback: state => (this.#powerState = state),
                },
                {
                    name: 'SPEED_LEVEL',
                    valueType: ValueType.NumberPercent,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.SpeedLevel,
                    callback: state => (this.#speedLevelState = state),
                },
                {
                    name: 'SWING',
                    valueType: ValueType.Enum,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.Swing,
                    callback: state => (this.#swingState = state),
                },
                {
                    name: 'AIRFLOW_DIRECTION',
                    valueType: ValueType.Enum,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.AirflowDirection,
                    callback: state => (this.#airflowDirectionState = state),
                },
                {
                    name: 'ON_TIME',
                    valueType: ValueType.Number,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.OnTime,
                    callback: state => (this.#onTimeState = state),
                },
            ]),
        );
    }

    getSpeed(): FanSpeed | undefined {
        if (!this.#speedState) {
            throw new Error('Speed state not found');
        }
        return this.#speedState.value;
    }

    setSpeed(value: FanSpeed): Promise<void> {
        if (!this.#speedState) {
            throw new Error('Speed state not found');
        }
        return this.#speedState.setValue(value);
    }

    updateSpeed(value: FanSpeed): Promise<void> {
        if (!this.#speedState) {
            throw new Error('Speed state not found');
        }
        return this.#speedState.updateValue(value);
    }

    getSpeedModes(): FanSpeed[] {
        if (!this.#speedState) {
            throw new Error('Speed state not found');
        }
        return this.#speedState.getModes();
    }

    updateSpeedModes(modes: { [key: string]: FanSpeed }): Promise<void> {
        if (!this.#speedState) {
            throw new Error('Speed state not found');
        }
        return this.#speedState.updateModes(modes);
    }

    hasSpeed(): boolean {
        return !!this.#speedState;
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

    hasPower(): boolean {
        return !!this.#powerState;
    }

    getSpeedLevel(): number | undefined {
        if (!this.#speedLevelState) {
            throw new Error('Speed level state not found');
        }
        return this.#speedLevelState.value;
    }

    setSpeedLevel(value: number): Promise<void> {
        if (!this.#speedLevelState) {
            throw new Error('Speed level state not found');
        }
        return this.#speedLevelState.setValue(value);
    }

    updateSpeedLevel(value: number): Promise<void> {
        if (!this.#speedLevelState) {
            throw new Error('Speed level state not found');
        }
        return this.#speedLevelState.updateValue(value);
    }

    hasSpeedLevel(): boolean {
        return !!this.#speedLevelState;
    }

    getSwing(): FanSwing | boolean | undefined {
        if (!this.#swingState) {
            throw new Error('Swing state not found');
        }
        return this.#swingState.value;
    }

    setSwing(value: FanSwing | boolean): Promise<void> {
        if (!this.#swingState) {
            throw new Error('Swing state not found');
        }
        return this.#swingState.setValue(value);
    }

    updateSwing(value: FanSwing | boolean): Promise<void> {
        if (!this.#swingState) {
            throw new Error('Swing state not found');
        }
        return this.#swingState.updateValue(value);
    }

    getSwingModes(): (FanSwing | boolean)[] {
        if (!this.#swingState) {
            throw new Error('Swing state not found');
        }
        return this.#swingState.getModes();
    }

    updateSwingModes(modes: { [key: string]: FanSwing | boolean }): Promise<void> {
        if (!this.#swingState) {
            throw new Error('Swing state not found');
        }
        return this.#swingState.updateModes(modes);
    }

    hasSwing(): boolean {
        return !!this.#swingState;
    }

    getAirflowDirection(): FanAirflowDirection | undefined {
        if (!this.#airflowDirectionState) {
            throw new Error('Airflow direction state not found');
        }
        return this.#airflowDirectionState.value;
    }

    setAirflowDirection(value: FanAirflowDirection): Promise<void> {
        if (!this.#airflowDirectionState) {
            throw new Error('Airflow direction state not found');
        }
        return this.#airflowDirectionState.setValue(value);
    }

    updateAirflowDirection(value: FanAirflowDirection): Promise<void> {
        if (!this.#airflowDirectionState) {
            throw new Error('Airflow direction state not found');
        }
        return this.#airflowDirectionState.updateValue(value);
    }

    getAirflowDirectionModes(): FanAirflowDirection[] {
        if (!this.#airflowDirectionState) {
            throw new Error('Airflow direction state not found');
        }
        return this.#airflowDirectionState.getModes();
    }

    updateAirflowDirectionModes(modes: { [key: string]: FanAirflowDirection }): Promise<void> {
        if (!this.#airflowDirectionState) {
            throw new Error('Airflow direction state not found');
        }
        return this.#airflowDirectionState.updateModes(modes);
    }

    hasAirflowDirection(): boolean {
        return !!this.#airflowDirectionState;
    }

    getOnTime(): number | undefined {
        if (!this.#onTimeState) {
            throw new Error('On time state not found');
        }
        return this.#onTimeState.value;
    }

    setOnTime(value: number): Promise<void> {
        if (!this.#onTimeState) {
            throw new Error('On time state not found');
        }
        return this.#onTimeState.setValue(value);
    }

    updateOnTime(value: number): Promise<void> {
        if (!this.#onTimeState) {
            throw new Error('On time state not found');
        }
        return this.#onTimeState.updateValue(value);
    }

    hasOnTime(): boolean {
        return !!this.#onTimeState;
    }
}
