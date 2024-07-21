import GenericDevice, {
    DetectedDevice,
    DeviceOptions,
    DeviceStateObject,
    PropertyType,
    StateAccessType,
    ValueType,
} from './GenericDevice';

class Dimmer extends GenericDevice {
    private _setLevelState: DeviceStateObject<number> | undefined;
    private _getLevelState: DeviceStateObject<number> | undefined;
    private _setPowerState: DeviceStateObject<boolean> | undefined;
    private _getPowerState: DeviceStateObject<boolean> | undefined;
    private _lastNotZeroLevel: number | undefined;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._ready.push(
            this.addDeviceStates([
                // actual value first, as it will be read first
                {
                    name: 'ACTUAL',
                    valueType: ValueType.NumberPercent,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Level,
                    callback: state => (this._getLevelState = state),
                },
                {
                    name: 'SET',
                    valueType: ValueType.NumberPercent,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.Level,
                    callback: state => (this._setLevelState = state),
                },
                // actual value first, as it will be read first
                {
                    name: 'ON_ACTUAL',
                    valueType: ValueType.Boolean,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Power,
                    callback: state => (this._getPowerState = state),
                },
                {
                    name: 'ON_SET',
                    valueType: ValueType.Boolean,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.Power,
                    callback: state => (this._setPowerState = state),
                },
            ]),
        );
    }

    getLevel(): number | undefined {
        if (!this._setLevelState && !this._getLevelState) {
            throw new Error('Level state not found');
        }

        if (this.options?.dimmerUseLastLevelForOn && (this._getLevelState?.value || 0) > 10) {
            this._lastNotZeroLevel = this._getLevelState?.value || 100;
        }

        return (this._getLevelState || this._setLevelState)?.value;
    }

    async setLevel(value: number): Promise<void> {
        if (!this._setLevelState) {
            throw new Error('Level state not found');
        }
        return this._setLevelState.setValue(value);
    }

    getPower(): boolean | undefined {
        if (!this._getPowerState && !this._setPowerState && !this._setLevelState && !this._getLevelState) {
            throw new Error('Power state not found');
        }
        if (this._getPowerState || this._setPowerState) {
            return (this._getPowerState || this._setPowerState)?.value;
        }
        const state = this._getLevelState || this._setLevelState;
        if (state) {
            return (state.value || 0) > 0;
        }
        return undefined;
    }

    async setPower(value: boolean): Promise<void> {
        if (!this._setPowerState && !this._setLevelState) {
            throw new Error('Power state not found');
        }
        if (this._setPowerState) {
            return this._setPowerState.setValue(value);
        }
        if (this._setLevelState) {
            if (value) {
                if (this.options?.dimmerUseLastLevelForOn) {
                    return this._setLevelState.setValue(this._lastNotZeroLevel || 100);
                } else {
                    return this._setLevelState.setValue(this.options?.dimmerOnLevel || 100);
                }
            }
            if (this.options?.dimmerUseLastLevelForOn) {
                this._lastNotZeroLevel = this._getLevelState?.value || this._lastNotZeroLevel || 100;
            }
            return this._setLevelState.setValue(0);
        }
    }
}

export default Dimmer;
