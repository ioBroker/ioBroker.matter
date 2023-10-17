import GenericDevice, { DetectedDevice, DeviceStateObject, PropertyType } from './GenericDevice';

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

class BlindsButtons extends GenericDevice {
    protected _setStopState: DeviceStateObject<boolean> | undefined;
    protected _setOpenState: DeviceStateObject<boolean> | undefined;
    protected _setCloseState: DeviceStateObject<boolean> | undefined;
    protected _getTiltState: DeviceStateObject<number> | undefined;
    protected _setTiltState: DeviceStateObject<number> | undefined;
    protected _setTiltStopState: DeviceStateObject<boolean> | undefined;
    protected _setTiltOpenState: DeviceStateObject<boolean> | undefined;
    protected _setTiltCloseState: DeviceStateObject<boolean> | undefined;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter) {
        super(detectedDevice, adapter);

        this.addDeviceStates([
            {name: 'STOP', type: PropertyType.Stop, callback: state => this._setStopState = state},
            {name: 'OPEN', type: PropertyType.Open, callback: state => this._setOpenState = state},
            {name: 'CLOSE', type: PropertyType.Close, callback: state => this._setCloseState = state},
            {name: 'TILT_SET', type: PropertyType.TiltLevel, callback: state => this._setTiltState = state},
            {name: 'TILT_ACTUAL', type: PropertyType.TiltLevel, callback: state => this._getTiltState = state || this._setTiltState},
            {name: 'TILT_STOP', type: PropertyType.TiltStop, callback: state => this._setTiltStopState = state},
            {name: 'TILT_OPEN', type: PropertyType.TiltOpen, callback: state => this._setTiltOpenState = state},
            {name: 'TILT_CLOSE', type: PropertyType.TiltClose, callback: state => this._setTiltCloseState = state},
        ]);
    }

    async stop(): Promise<void> {
        if (!this._setStopState) {
            throw new Error('Stop state not found');
        }
        return this._setStopState.setValue(true);
    }

    async open(): Promise<void> {
        if (!this._setOpenState) {
            throw new Error('Open state not found');
        }
        return this._setOpenState.setValue(true);
    }

    async close(): Promise<void> {
        if (!this._setCloseState) {
            throw new Error('Close state not found');
        }
        return this._setCloseState.setValue(true);
    }

    getTilt(): number | undefined {
        if (!this._getTiltState) {
            throw new Error('Tilt state not found');
        }
        return this._getTiltState.value;
    }

    async setTilt(value: number): Promise<void> {
        if (!this._setTiltState) {
            throw new Error('Tilt state not found');
        }
        return this._setTiltState.setValue(value);
    }

    async stopTilt(): Promise<void> {
        if (!this._setTiltStopState) {
            throw new Error('Tilt stop state not found');
        }
        return this._setTiltStopState.setValue(true);
    }

    async openTilt(): Promise<void> {
        if (!this._setTiltOpenState) {
            throw new Error('Tilt open state not found');
        }
        return this._setTiltOpenState.setValue(true);
    }

    async closeTilt(): Promise<void> {
        if (!this._setTiltCloseState) {
            throw new Error('Tilt close state not found');
        }
        return this._setTiltCloseState.setValue(true);
    }
}

export default BlindsButtons;