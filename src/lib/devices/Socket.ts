import { type DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import { ElectricityDataDevice } from './ElectricityDataDevice';
import { type DetectedDevice, type DeviceOptions, StateAccessType } from './GenericDevice';
import type { CustomStatesRecord } from '../../matter/to-iobroker/custom-states';

export class Socket extends ElectricityDataDevice {
    #setPowerState?: DeviceStateObject<boolean>;
    #getPowerState?: DeviceStateObject<boolean>;
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
                // actual value first, as it will be read first
                {
                    name: 'ACTUAL',
                    valueType: ValueType.Boolean,
                    accessType: StateAccessType.Read,
                    type: PropertyType.PowerActual,
                    callback: state => (this.#getPowerState = state),
                },
                {
                    name: 'SET',
                    valueType: ValueType.Boolean,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.Power,
                    callback: state => (this.#setPowerState = state),
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

    getPower(): boolean | undefined {
        if (!this.#getPowerState && !this.#setPowerState) {
            throw new Error('Level state not found');
        }
        return (this.#getPowerState || this.#setPowerState)?.value;
    }

    setPower(value: boolean): Promise<void> {
        if (!this.#setPowerState) {
            throw new Error('Level state not found');
        }
        return this.#setPowerState.setValue(value);
    }

    async updatePower(value: boolean): Promise<void> {
        if (!this.#getPowerState && !this.#setPowerState) {
            throw new Error('Level state not found');
        }
        await this.#getPowerState?.updateValue(value);
        await this.#setPowerState?.updateValue(value);
    }

    getPowerActual(): boolean | undefined {
        if (!this.#getPowerState) {
            throw new Error('Level state not found');
        }
        return this.#getPowerState.value;
    }

    async updatePowerActual(value: boolean): Promise<void> {
        if (!this.#getPowerState) {
            throw new Error('Level state not found');
        }
        await this.#getPowerState.updateValue(value);
    }

    hasPowerActual(): boolean {
        return !!this.#getPowerState;
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
