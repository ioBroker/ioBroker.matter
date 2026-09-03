import { type DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import { ElectricityDataDevice } from './ElectricityDataDevice';
import { type DetectedDevice, type DeviceOptions, StateAccessType } from './GenericDevice';
import type { CustomStatesRecord } from '../../matter/to-iobroker/custom-states';

export abstract class GenericLightingDevice extends ElectricityDataDevice {
    #effectState?: DeviceStateObject<string>;
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
                    name: 'EFFECT',
                    valueType: ValueType.Enum,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.Effect,
                    callback: state => (this.#effectState = state),
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

    abstract hasPower(): boolean;

    abstract getPower(): boolean | undefined;

    abstract setPower(value: boolean): Promise<void>;

    abstract updatePower(value: boolean): Promise<void>;

    hasEffect(): boolean {
        return !!this.#effectState;
    }

    getEffect(): string | undefined {
        if (!this.#effectState) {
            throw new Error('Effect state not found');
        }
        return this.#effectState.value;
    }

    setEffect(value: string): Promise<void> {
        if (!this.#effectState) {
            throw new Error('Effect state not found');
        }
        return this.#effectState.setValue(value);
    }

    updateEffect(value: string): Promise<void> {
        if (!this.#effectState) {
            throw new Error('Effect state not found');
        }
        return this.#effectState.updateValue(value);
    }

    getEffectModes(): string[] {
        if (!this.#effectState) {
            throw new Error('Effect state not found');
        }
        return this.#effectState.getModes();
    }

    hasOnTime(): boolean {
        return !!this.#onTimeState;
    }

    getOnTime(): number | undefined {
        if (!this.#onTimeState) {
            throw new Error('OnTime state not found');
        }
        return this.#onTimeState.value;
    }

    setOnTime(value: number): Promise<void> {
        if (!this.#onTimeState) {
            throw new Error('OnTime state not found');
        }
        return this.#onTimeState.setValue(value);
    }

    updateOnTime(value: number): Promise<void> {
        if (!this.#onTimeState) {
            throw new Error('OnTime state not found');
        }
        return this.#onTimeState.updateValue(value);
    }
}
