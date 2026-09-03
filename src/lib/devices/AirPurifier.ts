import { Fan } from './Fan';
import { type DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import { type DetectedDevice, type DeviceOptions, StateAccessType } from './GenericDevice';
import type { CustomStatesRecord } from '../../matter/to-iobroker/custom-states';

export class AirPurifier extends Fan {
    #filterConditionState?: DeviceStateObject<number>;
    #filterConditionCarbonState?: DeviceStateObject<number>;
    #filterChangeState?: DeviceStateObject<boolean>;

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
                    name: 'FILTER_CONDITION',
                    valueType: ValueType.NumberPercent,
                    accessType: StateAccessType.Read,
                    type: PropertyType.FilterCondition,
                    callback: state => (this.#filterConditionState = state),
                },
                {
                    name: 'FILTER_CONDITION_CARBON',
                    valueType: ValueType.NumberPercent,
                    accessType: StateAccessType.Read,
                    type: PropertyType.FilterConditionCarbon,
                    callback: state => (this.#filterConditionCarbonState = state),
                },
                {
                    name: 'FILTER_CHANGE',
                    valueType: ValueType.Boolean,
                    accessType: StateAccessType.Read,
                    type: PropertyType.FilterChange,
                    callback: state => (this.#filterChangeState = state),
                },
            ]),
        );
    }

    getFilterCondition(): number | undefined {
        if (!this.#filterConditionState) {
            throw new Error('Filter condition state not found');
        }
        return this.#filterConditionState.value;
    }

    updateFilterCondition(value: number): Promise<void> {
        if (!this.#filterConditionState) {
            throw new Error('Filter condition state not found');
        }
        return this.#filterConditionState.updateValue(value);
    }

    hasFilterCondition(): boolean {
        return !!this.#filterConditionState;
    }

    getFilterConditionCarbon(): number | undefined {
        if (!this.#filterConditionCarbonState) {
            throw new Error('Filter condition carbon state not found');
        }
        return this.#filterConditionCarbonState.value;
    }

    updateFilterConditionCarbon(value: number): Promise<void> {
        if (!this.#filterConditionCarbonState) {
            throw new Error('Filter condition carbon state not found');
        }
        return this.#filterConditionCarbonState.updateValue(value);
    }

    hasFilterConditionCarbon(): boolean {
        return !!this.#filterConditionCarbonState;
    }

    getFilterChange(): boolean | undefined {
        if (!this.#filterChangeState) {
            throw new Error('Filter change state not found');
        }
        return this.#filterChangeState.value;
    }

    updateFilterChange(value: boolean): Promise<void> {
        if (!this.#filterChangeState) {
            throw new Error('Filter change state not found');
        }
        return this.#filterChangeState.updateValue(value);
    }

    hasFilterChange(): boolean {
        return !!this.#filterChangeState;
    }
}
