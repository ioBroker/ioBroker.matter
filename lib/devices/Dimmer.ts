import GenericDevice, {PropertyType, DetectedDevice, DeviceState} from './GenericDevice';

class Dimmer extends GenericDevice {
    private _setLevelState: DeviceState | undefined;
    private _getLevelState: DeviceState | undefined;

    private _setPowerState: DeviceState | undefined;
    private _getPowerState: DeviceState | undefined;

    private _value: number;
    private _power: boolean;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter) {
        super(detectedDevice, adapter);

        this._setLevelState = this.getDeviceState('SET');
        this._getLevelState = this.getDeviceState('ACTUAL') || this._setLevelState;

        this._setPowerState = this.getDeviceState('ON_SET');
        this._getPowerState = this.getDeviceState('ON_ACTUAL') || this._setPowerState;

        this._properties.push(PropertyType.Level);
        this._subscribeIDs.push(this._getLevelState.id);
        this._subscribeIDs.push(this._getPowerState.id);

        this._subscribeIDs = this._subscribeIDs.filter(w => w);

        this._doSubsribe();
    }

    getLevel(): number {
        return this._value;
    }

    async setLevel(value: number) {
        return this._adapter.setStateAsync(this._setLevelState.id, value);
    }

    getPower(): boolean {
        if (!this._getPowerState) {
            throw new Error('Power state not found');
        }
        return this._power;
    }

    async setPower(value: boolean) {
        if (!this._setPowerState) {
            throw new Error('Power state not found');
        }
        return this._adapter.setStateAsync(this._setPowerState.id, value);
    }
}

export default Dimmer;