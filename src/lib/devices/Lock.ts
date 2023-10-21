import GenericDevice, {
    PropertyType,
    DetectedDevice,
    DeviceStateObject,
    StateAccessType,
    ValueType
} from './GenericDevice';

class Lock extends GenericDevice {
    private _setPowerState: DeviceStateObject<boolean> | undefined;
    private _getPowerState: DeviceStateObject<boolean> | undefined;
    private _setOpenState: DeviceStateObject<boolean> | undefined;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter) {
        super(detectedDevice, adapter);

        this._ready.push(this.addDeviceStates([
            // actual value first, as it will be read first
            { name: 'ACTUAL', valueType: ValueType.Boolean, accessType: StateAccessType.Read, type: PropertyType.Power, callback: state => this._getPowerState = state },
            { name: 'SET', valueType: ValueType.Boolean, accessType: StateAccessType.ReadWrite, type: PropertyType.Power, callback: state => this._setPowerState = state },
            { name: 'OPEN', valueType: ValueType.Button, accessType: StateAccessType.Write, type: PropertyType.Open, callback: state => this._setOpenState = state },
        ]));
    }

    getPower(): boolean | undefined {
        if (!this._getPowerState && !this._setPowerState) {
            throw new Error('Level state not found');
        }
        return (this._getPowerState || this._setPowerState)?.value;
    }

    async setPower(value: boolean): Promise<void> {
        if (!this._setPowerState) {
            throw new Error('Level state not found');
        }
        return this._setPowerState.setValue(value);
    }

    async setOpen(): Promise<void> {
        if (!this._setOpenState) {
            throw new Error('Open state not found');
        }
        return this._setOpenState.setValue(true);
    }
}

export default Lock;