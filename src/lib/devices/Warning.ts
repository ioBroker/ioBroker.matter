import { DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import GenericDevice, { DetectedDevice, DeviceOptions, StateAccessType } from './GenericDevice';

class Warning extends GenericDevice {
    #getWarningState?: DeviceStateObject<number>;
    #getTitleState?: DeviceStateObject<string>;
    #getInfoState?: DeviceStateObject<string>;
    #getStartState?: DeviceStateObject<string>;
    #getEndState?: DeviceStateObject<string>;
    #getIconState?: DeviceStateObject<string>;
    #getDescState?: DeviceStateObject<string>;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._construction.push(
            this.addDeviceStates([
                {
                    name: 'LEVEL',
                    valueType: ValueType.Number,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Warning,
                    callback: state => (this.#getWarningState = state),
                },
                {
                    name: 'TITLE',
                    valueType: ValueType.String,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Title,
                    callback: state => (this.#getTitleState = state),
                },
                {
                    name: 'INFO',
                    valueType: ValueType.String,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Info,
                    callback: state => (this.#getInfoState = state),
                },
                {
                    name: 'START',
                    valueType: ValueType.String,
                    accessType: StateAccessType.Read,
                    type: PropertyType.StartTime,
                    callback: state => (this.#getStartState = state),
                },
                {
                    name: 'END',
                    valueType: ValueType.String,
                    accessType: StateAccessType.Read,
                    type: PropertyType.EndTime,
                    callback: state => (this.#getEndState = state),
                },
                {
                    name: 'ICON',
                    valueType: ValueType.String,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Icon,
                    callback: state => (this.#getIconState = state),
                },
                {
                    name: 'DESC',
                    valueType: ValueType.String,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Description,
                    callback: state => (this.#getDescState = state),
                },
            ]),
        );
    }

    getWarning(): number | undefined {
        if (!this.#getWarningState) {
            throw new Error('Warning state not found');
        }
        return this.#getWarningState.value;
    }

    getTitle(): string | undefined {
        if (!this.#getTitleState) {
            throw new Error('Title state not found');
        }
        return this.#getTitleState.value;
    }

    getInfo(): string | undefined {
        if (!this.#getInfoState) {
            throw new Error('Info state not found');
        }
        return this.#getInfoState.value;
    }

    getStartTime(): string | undefined {
        if (!this.#getStartState) {
            throw new Error('Start state not found');
        }
        return this.#getStartState.value;
    }

    getEndTime(): string | undefined {
        if (!this.#getEndState) {
            throw new Error('End state not found');
        }
        return this.#getEndState.value;
    }

    getIcon(): string | undefined {
        if (!this.#getIconState) {
            throw new Error('Icon state not found');
        }
        return this.#getIconState.value;
    }

    getDescription(): string | undefined {
        if (!this.#getDescState) {
            throw new Error('Desc state not found');
        }
        return this.#getDescState.value;
    }
}

export default Warning;
