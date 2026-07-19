import { type DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import { GenericDevice, type DetectedDevice, type DeviceOptions, StateAccessType } from './GenericDevice';

export class Camera extends GenericDevice {
    #getUrlState?: DeviceStateObject<string>;
    #autoFocusState?: DeviceStateObject<boolean>;
    #autoWhiteBalanceState?: DeviceStateObject<boolean>;
    #brightnessState?: DeviceStateObject<boolean>;
    #nightModeState?: DeviceStateObject<boolean>;
    #ptzState?: DeviceStateObject<number>;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._construction.push(
            this.addDeviceStates([
                {
                    name: 'URL',
                    valueType: ValueType.String,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Url,
                    callback: state => (this.#getUrlState = state),
                },
                {
                    name: 'AUTOFOCUS',
                    valueType: ValueType.Boolean,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.AutoFocus,
                    callback: state => (this.#autoFocusState = state),
                },
                {
                    name: 'AUTOWHITEBALANCE',
                    valueType: ValueType.Boolean,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.AutoWhiteBalance,
                    callback: state => (this.#autoWhiteBalanceState = state),
                },
                {
                    name: 'BRIGHTNESS',
                    valueType: ValueType.Boolean,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.Brightness,
                    callback: state => (this.#brightnessState = state),
                },
                {
                    name: 'NIGHTMODE',
                    valueType: ValueType.Boolean,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.NightMode,
                    callback: state => (this.#nightModeState = state),
                },
                {
                    name: 'PTZ',
                    valueType: ValueType.Number,
                    accessType: StateAccessType.ReadWrite,
                    type: PropertyType.PTZ,
                    callback: state => (this.#ptzState = state),
                },
            ]),
        );
    }

    getUrl(): string | undefined {
        if (!this.#getUrlState) {
            throw new Error('URL state not found');
        }
        return this.#getUrlState.value;
    }

    getAutoFocus(): boolean | undefined {
        if (!this.#autoFocusState) {
            throw new Error('AutoFocus state not found');
        }
        return this.#autoFocusState.value;
    }

    setAutoFocus(value: boolean): Promise<void> {
        if (!this.#autoFocusState) {
            throw new Error('AutoFocus state not found');
        }
        return this.#autoFocusState.setValue(value);
    }

    getAutoWhiteBalance(): boolean | undefined {
        if (!this.#autoWhiteBalanceState) {
            throw new Error('AutoWhiteBalance state not found');
        }
        return this.#autoWhiteBalanceState.value;
    }

    setAutoWhiteBalance(value: boolean): Promise<void> {
        if (!this.#autoWhiteBalanceState) {
            throw new Error('AutoWhiteBalance state not found');
        }
        return this.#autoWhiteBalanceState.setValue(value);
    }

    getBrightness(): boolean | undefined {
        if (!this.#brightnessState) {
            throw new Error('Brightness state not found');
        }
        return this.#brightnessState.value;
    }

    setBrightness(value: boolean): Promise<void> {
        if (!this.#brightnessState) {
            throw new Error('Brightness state not found');
        }
        return this.#brightnessState.setValue(value);
    }

    getNightMode(): boolean | undefined {
        if (!this.#nightModeState) {
            throw new Error('NightMode state not found');
        }
        return this.#nightModeState.value;
    }

    setNightMode(value: boolean): Promise<void> {
        if (!this.#nightModeState) {
            throw new Error('NightMode state not found');
        }
        return this.#nightModeState.setValue(value);
    }

    getPtz(): number | undefined {
        if (!this.#ptzState) {
            throw new Error('PTZ state not found');
        }
        return this.#ptzState.value;
    }

    setPtz(value: number): Promise<void> {
        if (!this.#ptzState) {
            throw new Error('PTZ state not found');
        }
        return this.#ptzState.setValue(value);
    }
}
