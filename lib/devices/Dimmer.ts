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

        this._setLevelState = detectedDevice.states.find(state => state.name === 'SET' && state.id);
        this._getLevelState = detectedDevice.states.find(state => state.name === 'ACTUAL' && state.id) || this._setLevelState;

        this._setPowerState = detectedDevice.states.find(state => state.name === 'ON_SET' && state.id);
        this._getPowerState = detectedDevice.states.find(state => state.name === 'ON_ACTUAL' && state.id) || this._setPowerState;

        this._properties.push(PropertyType.Level);
        this._subsribeIDs.push(this._getLevelState.id);
        this._subsribeIDs.push(this._getPowerState.id);

        this._subsribeIDs = this._subsribeIDs.filter(w => w);

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