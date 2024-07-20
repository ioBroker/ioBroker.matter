import GenericDevice, {
    DetectedDevice,
    DeviceOptions,
    DeviceStateObject,
    PropertyType,
    StateAccessType,
    ValueType,
} from './GenericDevice';

class Warning extends GenericDevice {
    protected _getWarningState: DeviceStateObject<number> | undefined;
    protected _getTitleState: DeviceStateObject<string> | undefined;
    protected _getInfoState: DeviceStateObject<string> | undefined;
    protected _getStartState: DeviceStateObject<string> | undefined;
    protected _getEndState: DeviceStateObject<string> | undefined;
    protected _getIconState: DeviceStateObject<string> | undefined;
    protected _getDescState: DeviceStateObject<string> | undefined;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._ready.push(
            this.addDeviceStates([
                {
                    name: 'LEVEL',
                    valueType: ValueType.Number,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Warning,
                    callback: state => (this._getWarningState = state),
                },
                {
                    name: 'TITLE',
                    valueType: ValueType.String,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Title,
                    callback: state => (this._getTitleState = state),
                },
                {
                    name: 'INFO',
                    valueType: ValueType.String,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Info,
                    callback: state => (this._getInfoState = state),
                },
                {
                    name: 'START',
                    valueType: ValueType.String,
                    accessType: StateAccessType.Read,
                    type: PropertyType.StartTime,
                    callback: state => (this._getStartState = state),
                },
                {
                    name: 'END',
                    valueType: ValueType.String,
                    accessType: StateAccessType.Read,
                    type: PropertyType.EndTime,
                    callback: state => (this._getEndState = state),
                },
                {
                    name: 'ICON',
                    valueType: ValueType.String,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Icon,
                    callback: state => (this._getIconState = state),
                },
                {
                    name: 'DESC',
                    valueType: ValueType.String,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Description,
                    callback: state => (this._getDescState = state),
                },
            ]),
        );
    }

    getWarning(): number | undefined {
        if (!this._getWarningState) {
            throw new Error('Warning state not found');
        }
        return this._getWarningState.value;
    }

    getTitle(): string | undefined {
        if (!this._getTitleState) {
            throw new Error('Title state not found');
        }
        return this._getTitleState.value;
    }

    getInfo(): string | undefined {
        if (!this._getInfoState) {
            throw new Error('Info state not found');
        }
        return this._getInfoState.value;
    }

    getStartTime(): string | undefined {
        if (!this._getStartState) {
            throw new Error('Start state not found');
        }
        return this._getStartState.value;
    }

    getEndTime(): string | undefined {
        if (!this._getEndState) {
            throw new Error('End state not found');
        }
        return this._getEndState.value;
    }

    getIcon(): string | undefined {
        if (!this._getIconState) {
            throw new Error('Icon state not found');
        }
        return this._getIconState.value;
    }

    getDescription(): string | undefined {
        if (!this._getDescState) {
            throw new Error('Desc state not found');
        }
        return this._getDescState.value;
    }
}

export default Warning;
