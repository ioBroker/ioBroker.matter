import { DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import ElectricityDataDevice from './ElectricityDataDevice';
import { DetectedDevice, DeviceOptions, StateAccessType } from './GenericDevice';

class Light extends ElectricityDataDevice {
    #setPowerState?: DeviceStateObject<boolean>;
    #getPowerState?: DeviceStateObject<boolean>;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._construction.push(
            this.addDeviceStates([
                // actual value first, as it will be read first
                {
                    name: 'ON_ACTUAL',
                    valueType: ValueType.Boolean,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Power,
                    callback: state => (this.#getPowerState = state),
                },
                {
                    name: 'SET',
                    valueType: ValueType.Boolean,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.Power,
                    callback: state => (this.#setPowerState = state),
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

    async setPower(value: boolean): Promise<void> {
        if (!this.#setPowerState) {
            throw new Error('Level state not found');
        }
        await this.#setPowerState.setValue(value);
    }
}

export default Light;
