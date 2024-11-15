import { type DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import GenericDevice, { type DetectedDevice, type DeviceOptions, StateAccessType } from './GenericDevice';

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
    #setStopState?: DeviceStateObject<boolean>;
    #setOpenState?: DeviceStateObject<boolean>;
    #setCloseState?: DeviceStateObject<boolean>;
    #getTiltState?: DeviceStateObject<number>;
    #setTiltState?: DeviceStateObject<number>;
    #setTiltStopState?: DeviceStateObject<boolean>;
    #setTiltOpenState?: DeviceStateObject<boolean>;
    #setTiltCloseState?: DeviceStateObject<boolean>;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._construction.push(
            this.addDeviceStates([
                {
                    name: 'STOP',
                    valueType: ValueType.Button,
                    accessType: StateAccessType.Write,
                    type: PropertyType.Stop,
                    callback: state => (this.#setStopState = state),
                },
                {
                    name: 'OPEN',
                    valueType: ValueType.Button,
                    accessType: StateAccessType.Write,
                    type: PropertyType.Open,
                    callback: state => (this.#setOpenState = state),
                },
                {
                    name: 'CLOSE',
                    valueType: ValueType.Button,
                    accessType: StateAccessType.Write,
                    type: PropertyType.Close,
                    callback: state => (this.#setCloseState = state),
                },
                // actual value first, as it will be read first
                {
                    name: 'TILT_ACTUAL',
                    valueType: ValueType.NumberPercent,
                    accessType: StateAccessType.Read,
                    type: PropertyType.TiltLevel,
                    callback: state => (this.#getTiltState = state),
                },
                {
                    name: 'TILT_SET',
                    valueType: ValueType.NumberPercent,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.TiltLevel,
                    callback: state => (this.#setTiltState = state),
                },
                {
                    name: 'TILT_STOP',
                    valueType: ValueType.Button,
                    accessType: StateAccessType.Write,
                    type: PropertyType.TiltStop,
                    callback: state => (this.#setTiltStopState = state),
                },
                {
                    name: 'TILT_OPEN',
                    valueType: ValueType.Button,
                    accessType: StateAccessType.Write,
                    type: PropertyType.TiltOpen,
                    callback: state => (this.#setTiltOpenState = state),
                },
                {
                    name: 'TILT_CLOSE',
                    valueType: ValueType.Button,
                    accessType: StateAccessType.Write,
                    type: PropertyType.TiltClose,
                    callback: state => (this.#setTiltCloseState = state),
                },
            ]),
        );
    }

    async setStop(): Promise<void> {
        if (!this.#setStopState) {
            throw new Error('Stop state not found');
        }
        return this.#setStopState.setValue(true);
    }

    async setOpen(): Promise<void> {
        if (!this.#setOpenState) {
            throw new Error('Open state not found');
        }
        return this.#setOpenState.setValue(true);
    }

    async setClose(): Promise<void> {
        if (!this.#setCloseState) {
            throw new Error('Close state not found');
        }
        return this.#setCloseState.setValue(true);
    }

    getTiltLevel(): number | undefined {
        if (!this.#getTiltState) {
            throw new Error('Tilt state not found');
        }
        return this.#getTiltState.value;
    }

    async setTiltLevel(value: number): Promise<void> {
        if (!this.#setTiltState) {
            throw new Error('Tilt state not found');
        }
        return this.#setTiltState.setValue(value);
    }

    async setTiltStop(): Promise<void> {
        if (!this.#setTiltStopState) {
            throw new Error('Tilt stop state not found');
        }
        return this.#setTiltStopState.setValue(true);
    }

    async setTiltOpen(): Promise<void> {
        if (!this.#setTiltOpenState) {
            throw new Error('Tilt open state not found');
        }
        return this.#setTiltOpenState.setValue(true);
    }

    async setTiltClose(): Promise<void> {
        if (!this.#setTiltCloseState) {
            throw new Error('Tilt close state not found');
        }
        return this.#setTiltCloseState.setValue(true);
    }
}

export default BlindButtons;
