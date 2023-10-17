import GenericDevice, { DetectedDevice, DeviceStateObject, PropertyType } from "./GenericDevice";

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

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter) {
        super(detectedDevice, adapter);

        this.addDeviceStates([
            {name: 'FILE', type: PropertyType.File, callback: state => this._getFileState = state},
            {name: 'AUTOFOCUS', type: PropertyType.AutoFocus, callback: state => this._autoFocusState = state},
            {name: 'AUTOWHITEBALANCE', type: PropertyType.AutoWhiteBalance, callback: state => this._autoWhiteBalanceState = state},
            {name: 'BRIGHTNESS', type: PropertyType.Brightness, callback: state => this._brightnessState = state},
            {name: 'NIGHTMODE', type: PropertyType.NightMode, callback: state => this._nightModeState = state},
            {name: 'PTZ', type: PropertyType.PTZ, callback: state => this._ptzState = state},
        ]);
    }

    getFile(): string | undefined {
        if (!this._getFileState) {
            throw new Error('File state not found');
        }
        return this._getFileState.value;
    }

    async setFile(value: string) {
        if (!this._getFileState) {
            throw new Error('File state not found');
        }
        return this._getFileState.setValue(value);
    }

    getAutoFocus(): boolean | undefined {
        if (!this._autoFocusState) {
            throw new Error('AutoFocus state not found');
        }
        return this._autoFocusState.value;
    }

    async setAutoFocus(value: boolean) {
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

    async setAutoWhiteBalance(value: boolean) {
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

    async setBrightness(value: boolean) {
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

    async setNightMode(value: boolean) {
        if (!this._nightModeState) {
            throw new Error('NightMode state not found');
        }
        return this._nightModeState.setValue(value);
    }

    getPTZ(): number | undefined {
        if (!this._ptzState) {
            throw new Error('PTZ state not found');
        }
        return this._ptzState.value;
    }

    async setPTZ(value: number) {
        if (!this._ptzState) {
            throw new Error('PTZ state not found');
        }
        return this._ptzState.setValue(value);
    }

}

export default Camera;