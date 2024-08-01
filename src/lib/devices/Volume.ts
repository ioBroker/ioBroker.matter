import { DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import GenericDevice, { DetectedDevice, DeviceOptions, StateAccessType } from './GenericDevice';

class Volume extends GenericDevice {
    #setLevelState?: DeviceStateObject<number>;
    #getLevelState?: DeviceStateObject<number>;
    #muteState?: DeviceStateObject<boolean>;

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
                {
                    name: 'MUTE',
                    valueType: ValueType.Boolean,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.Mute,
                    callback: state => (this.#muteState = state),
                },
            ]),
        );
    }

    getLevel(): number | undefined {
        if (!this.#getLevelState || !this.#setLevelState) {
            throw new Error('Level state not found');
        }
        return (this.#getLevelState || this.#setLevelState)?.value;
    }

    async setLevel(value: number): Promise<void> {
        if (!this.#setLevelState) {
            throw new Error('Level state not found');
        }
        return this.#setLevelState.setValue(value);
    }

    getMute(): boolean | undefined {
        if (!this.#muteState) {
            throw new Error('Mute state not found');
        }
        return this.#muteState.value;
    }

    async setMute(value: boolean): Promise<void> {
        if (!this.#muteState) {
            throw new Error('Mute state not found');
        }
        return this.#muteState.setValue(value);
    }
}

export default Volume;
