import { type DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import { ElectricityDataDevice } from './ElectricityDataDevice';
import { type DetectedDevice, type DeviceOptions, StateAccessType } from './GenericDevice';
import type { CustomStatesRecord } from '../../matter/to-iobroker/custom-states';

export abstract class GenericLightingDevice extends ElectricityDataDevice {
    #effectState?: DeviceStateObject<string>;

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
}
