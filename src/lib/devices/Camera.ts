import GenericDevice, {
    DetectedDevice,
    DeviceStateObject,
    PropertyType,
    StateAccessType,
    ValueType,
    DeviceOptions,
} from './GenericDevice';

/*
*	FILE	camera	file				/^camera(\.\w+)?$/
AUTOFOCUS	switch.camera.autofocus	boolean	W			/^switch(\.camera)?\.autofocus$/
AUTOWHITEBALANCE	switch.camera.autowhitebalance	boolean	W			/^switch(\.camera)?\.autowhitebalance$/
BRIGHTNESS	switch.camera.brightness	boolean	W			/^switch(\.camera)?\.brightness$/
NIGHTMODE	switch.camera.nightmode	boolean	W			/^switch(\.camera)?\.nightmode$/
PTZ	level.camera.position	number	W			/^level(\.camera)?\.position$｜^level(\.camera)?(\.ptz)$/
*/

class Camera extends GenericDevice {
    protected _getFileState: DeviceStateObject<string> | undefined;
    protected _autoFocusState: DeviceStateObject<boolean> | undefined;
    protected _autoWhiteBalanceState: DeviceStateObject<boolean> | undefined;
    protected _brightnessState: DeviceStateObject<boolean> | undefined;
    protected _nightModeState: DeviceStateObject<boolean> | undefined;
    protected _ptzState: DeviceStateObject<number> | undefined;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._ready.push(this.addDeviceStates([
            { name: 'FILE', valueType: ValueType.String, accessType: StateAccessType.Read, type: PropertyType.File, callback: state => this._getFileState = state },
            { name: 'AUTOFOCUS', valueType: ValueType.Boolean, accessType: StateAccessType.ReadWrite, type: PropertyType.AutoFocus, callback: state => this._autoFocusState = state },
            { name: 'AUTOWHITEBALANCE', valueType: ValueType.Boolean, accessType: StateAccessType.ReadWrite, type: PropertyType.AutoWhiteBalance, callback: state => this._autoWhiteBalanceState = state },
            { name: 'BRIGHTNESS', valueType: ValueType.Boolean, accessType: StateAccessType.ReadWrite, type: PropertyType.Brightness, callback: state => this._brightnessState = state },
            { name: 'NIGHTMODE', valueType: ValueType.Boolean, accessType: StateAccessType.ReadWrite, type: PropertyType.NightMode, callback: state => this._nightModeState = state },
            { name: 'PTZ', valueType: ValueType.Number, accessType: StateAccessType.ReadWrite, type: PropertyType.PTZ, callback: state => this._ptzState = state },
        ]));
    }

    getFile(): string | undefined {
        if (!this._getFileState) {
            throw new Error('File state not found');
        }
        return this._getFileState.value;
    }

    getAutoFocus(): boolean | undefined {
        if (!this._autoFocusState) {
            throw new Error('AutoFocus state not found');
        }
        return this._autoFocusState.value;
    }

    async setAutoFocus(value: boolean): Promise<void> {
        if (!this._autoFocusState) {
            throw new Error('AutoFocus state not found');
        }
        return this._autoFocusState.setValue(value);
    }

    getAutoWhiteBalance(): boolean | undefined {
        if (!this._autoWhiteBalanceState) {
            throw new Error('AutoWhiteBalance state not found');
        }
        return this._autoWhiteBalanceState.value;
    }

    async setAutoWhiteBalance(value: boolean): Promise<void> {
        if (!this._autoWhiteBalanceState) {
            throw new Error('AutoWhiteBalance state not found');
        }
        return this._autoWhiteBalanceState.setValue(value);
    }

    getBrightness(): boolean | undefined {
        if (!this._brightnessState) {
            throw new Error('Brightness state not found');
        }
        return this._brightnessState.value;
    }

    async setBrightness(value: boolean): Promise<void> {
        if (!this._brightnessState) {
            throw new Error('Brightness state not found');
        }
        return this._brightnessState.setValue(value);
    }

    getNightMode(): boolean | undefined {
        if (!this._nightModeState) {
            throw new Error('NightMode state not found');
        }
        return this._nightModeState.value;
    }

    async setNightMode(value: boolean): Promise<void> {
        if (!this._nightModeState) {
            throw new Error('NightMode state not found');
        }
        return this._nightModeState.setValue(value);
    }

    getPtz(): number | undefined {
        if (!this._ptzState) {
            throw new Error('PTZ state not found');
        }
        return this._ptzState.value;
    }

    async setPtz(value: number): Promise<void> {
        if (!this._ptzState) {
            throw new Error('PTZ state not found');
        }
        return this._ptzState.setValue(value);
    }
}

export default Camera;