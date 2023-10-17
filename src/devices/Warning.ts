import GenericDevice, { DetectedDevice, DeviceStateObject, PropertyType } from "./GenericDevice";

class Warning extends GenericDevice {
    protected _getWarningState: DeviceStateObject<number> | undefined;
    protected _getTitleState: DeviceStateObject<string> | undefined;
    protected _getInfoState: DeviceStateObject<string> | undefined;
    protected _getStartState: DeviceStateObject<string> | undefined;
    protected _getEndState: DeviceStateObject<string> | undefined;
    protected _getIconState: DeviceStateObject<string> | undefined;
    protected _getDescState: DeviceStateObject<string> | undefined;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter) {
        super(detectedDevice, adapter);

        this.addDeviceStates([
            {name: 'LEVEL', type: PropertyType.Warning, callback: state => this._getWarningState = state},
            {name: 'TITLE', type: PropertyType.Warning, callback: state => this._getTitleState = state},
            {name: 'INFO', type: PropertyType.Warning, callback: state => this._getInfoState = state},
            {name: 'START', type: PropertyType.Warning, callback: state => this._getStartState = state},
            {name: 'END', type: PropertyType.Warning, callback: state => this._getEndState = state},
            {name: 'ICON', type: PropertyType.Warning, callback: state => this._getIconState = state},
            {name: 'DESC', type: PropertyType.Warning, callback: state => this._getDescState = state},
        ]);
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

    getStart(): string | undefined { 
        if (!this._getStartState) {
            throw new Error('Start state not found');
        }
        return this._getStartState.value;
    }

    getEnd(): string | undefined { 
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

    getDesc(): string | undefined { 
        if (!this._getDescState) {
            throw new Error('Desc state not found');
        }
        return this._getDescState.value;
    }
}

export default Warning;