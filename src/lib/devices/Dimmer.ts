import { DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import ElectricityDataDevice from './ElectricityDataDevice';
import { DetectedDevice, DeviceOptions, StateAccessType } from './GenericDevice';

class Dimmer extends ElectricityDataDevice {
    #setLevelState?: DeviceStateObject<number>;
    #getLevelState?: DeviceStateObject<number>;
    #setPowerState?: DeviceStateObject<boolean>;
    #getPowerState?: DeviceStateObject<boolean>;
    #lastNotZeroLevel?: number;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._construction.push(
            this.addDeviceStates([
                // actual value first, as it will be read first
                {
                    name: 'ACTUAL',
                    valueType: ValueType.NumberPercent,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Level,
                    callback: state => (this.#getLevelState = state),
                },
                {
                    name: 'SET',
                    valueType: ValueType.NumberPercent,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.Level,
                    callback: state => (this.#setLevelState = state),
                },
                // actual value first, as it will be read first
                {
                    name: 'ON_ACTUAL',
                    valueType: ValueType.Boolean,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Power,
                    callback: state => (this.#getPowerState = state),
                },
                {
                    name: 'ON_SET',
                    valueType: ValueType.Boolean,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.Power,
                    callback: state => (this.#setPowerState = state),
                },
            ]),
        );
    }

    getLevel(): number | undefined {
        if (!this.#setLevelState && !this.#getLevelState) {
            throw new Error('Level state not found');
        }

        if (this.options?.dimmerUseLastLevelForOn && (this.#getLevelState?.value || 0) > 10) {
            this.#lastNotZeroLevel = this.#getLevelState?.value || 100;
        }

        return (this.#getLevelState || this.#setLevelState)?.value;
    }

    async setLevel(value: number): Promise<void> {
        if (!this.#setLevelState) {
            throw new Error('Level state not found');
        }
        return this.#setLevelState.setValue(value);
    }

    getPower(): boolean | undefined {
        if (!this.#getPowerState && !this.#setPowerState && !this.#setLevelState && !this.#getLevelState) {
            throw new Error('Power state not found');
        }
        if (this.#getPowerState || this.#setPowerState) {
            return (this.#getPowerState || this.#setPowerState)?.value;
        }
        const state = this.#getLevelState || this.#setLevelState;
        if (state) {
            return (state.value || 0) > 0;
        }
        return undefined;
    }

    async setPower(value: boolean): Promise<void> {
        if (!this.#setPowerState && !this.#setLevelState) {
            throw new Error('Power state not found');
        }
        if (this.#setPowerState) {
            return this.#setPowerState.setValue(value);
        }
        if (this.#setLevelState) {
            if (value) {
                if (this.options?.dimmerUseLastLevelForOn) {
                    return this.#setLevelState.setValue(this.#lastNotZeroLevel || 100);
                } else {
                    return this.#setLevelState.setValue(this.options?.dimmerOnLevel || 100);
                }
            }
            if (this.options?.dimmerUseLastLevelForOn) {
                this.#lastNotZeroLevel = this.#getLevelState?.value || this.#lastNotZeroLevel || 100;
            }
            return this.#setLevelState.setValue(0);
        }
    }
}

export default Dimmer;
