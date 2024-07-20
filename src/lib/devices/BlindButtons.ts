import GenericDevice, {
    DetectedDevice,
    DeviceOptions,
    DeviceStateObject,
    PropertyType,
    StateAccessType,
    ValueType,
} from './GenericDevice';

/*
Blinds controlled only by buttons [blindButtons]
R	Name	Role	Type	Wr	Ind	Mult	Regex
*	STOP	button.stop.blind	boolean	W			/^button\.stop(\.blind)?$｜^action\.stop$/
*	OPEN	button.open.blind	boolean	W			/^button\.open(\.blind)?$/
*	CLOSE	button.close.blind	boolean	W			/^button\.close(\.blind)?$/
TILT_SET	level.tilt	number	W			/^level\.tilt$/
TILT_ACTUAL	value.tilt	number				/^value\.tilt$/
TILT_STOP	button.stop.tilt	boolean	W			/^button\.stop\.tilt$/
TILT_OPEN	button.open.tilt	boolean	W			/^button\.open\.tilt$/
TILT_CLOSE	button.close.tilt	boolean	W			/^button\.close\.tilt$/
DIRECTION	indicator.direction			X		/^indicator\.direction$/
WORKING	indicator.working			X		/^indicator\.working$/
UNREACH	indicator.maintenance.unreach	boolean		X		/^indicator(\.maintenance)?\.unreach$/
LOWBAT	indicator.maintenance.lowbat	boolean		X		/^indicator(\.maintenance)?\.lowbat$｜^indicator(\.maintenance)?\.battery$/
MAINTAIN	indicator.maintenance	boolean		X		/^indicator\.maintenance$/
ERROR	indicator.error			X		/^indicator\.error$/
*/

class BlindButtons extends GenericDevice {
    protected _setStopState: DeviceStateObject<boolean> | undefined;
    protected _setOpenState: DeviceStateObject<boolean> | undefined;
    protected _setCloseState: DeviceStateObject<boolean> | undefined;
    protected _getTiltState: DeviceStateObject<number> | undefined;
    protected _setTiltState: DeviceStateObject<number> | undefined;
    protected _setTiltStopState: DeviceStateObject<boolean> | undefined;
    protected _setTiltOpenState: DeviceStateObject<boolean> | undefined;
    protected _setTiltCloseState: DeviceStateObject<boolean> | undefined;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._ready.push(
            this.addDeviceStates([
                {
                    name: 'STOP',
                    valueType: ValueType.Button,
                    accessType: StateAccessType.Write,
                    type: PropertyType.Stop,
                    callback: state => (this._setStopState = state),
                },
                {
                    name: 'OPEN',
                    valueType: ValueType.Button,
                    accessType: StateAccessType.Write,
                    type: PropertyType.Open,
                    callback: state => (this._setOpenState = state),
                },
                {
                    name: 'CLOSE',
                    valueType: ValueType.Button,
                    accessType: StateAccessType.Write,
                    type: PropertyType.Close,
                    callback: state => (this._setCloseState = state),
                },
                // actual value first, as it will be read first
                {
                    name: 'TILT_ACTUAL',
                    valueType: ValueType.NumberPercent,
                    accessType: StateAccessType.Read,
                    type: PropertyType.TiltLevel,
                    callback: state => (this._getTiltState = state),
                },
                {
                    name: 'TILT_SET',
                    valueType: ValueType.NumberPercent,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.TiltLevel,
                    callback: state => (this._setTiltState = state),
                },
                {
                    name: 'TILT_STOP',
                    valueType: ValueType.Button,
                    accessType: StateAccessType.Write,
                    type: PropertyType.TiltStop,
                    callback: state => (this._setTiltStopState = state),
                },
                {
                    name: 'TILT_OPEN',
                    valueType: ValueType.Button,
                    accessType: StateAccessType.Write,
                    type: PropertyType.TiltOpen,
                    callback: state => (this._setTiltOpenState = state),
                },
                {
                    name: 'TILT_CLOSE',
                    valueType: ValueType.Button,
                    accessType: StateAccessType.Write,
                    type: PropertyType.TiltClose,
                    callback: state => (this._setTiltCloseState = state),
                },
            ]),
        );
    }

    async setStop(): Promise<void> {
        if (!this._setStopState) {
            throw new Error('Stop state not found');
        }
        return this._setStopState.setValue(true);
    }

    async setOpen(): Promise<void> {
        if (!this._setOpenState) {
            throw new Error('Open state not found');
        }
        return this._setOpenState.setValue(true);
    }

    async setClose(): Promise<void> {
        if (!this._setCloseState) {
            throw new Error('Close state not found');
        }
        return this._setCloseState.setValue(true);
    }

    getTiltLevel(): number | undefined {
        if (!this._getTiltState) {
            throw new Error('Tilt state not found');
        }
        return this._getTiltState.value;
    }

    async setTiltLevel(value: number): Promise<void> {
        if (!this._setTiltState) {
            throw new Error('Tilt state not found');
        }
        return this._setTiltState.setValue(value);
    }

    async setTiltStop(): Promise<void> {
        if (!this._setTiltStopState) {
            throw new Error('Tilt stop state not found');
        }
        return this._setTiltStopState.setValue(true);
    }

    async setTiltOpen(): Promise<void> {
        if (!this._setTiltOpenState) {
            throw new Error('Tilt open state not found');
        }
        return this._setTiltOpenState.setValue(true);
    }

    async setTiltClose(): Promise<void> {
        if (!this._setTiltCloseState) {
            throw new Error('Tilt close state not found');
        }
        return this._setTiltCloseState.setValue(true);
    }
}

export default BlindButtons;
