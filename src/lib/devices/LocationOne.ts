import { type DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import { GenericDevice, type DetectedDevice, type DeviceOptions, StateAccessType } from './GenericDevice';

export class LocationOne extends GenericDevice {
    #getGPSState?: DeviceStateObject<string>;
    #getElevationState?: DeviceStateObject<number>;
    #getRadiusState?: DeviceStateObject<number>;
    #getAccuracyState?: DeviceStateObject<number>;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._construction.push(
            this.addDeviceStates([
                {
                    name: 'GPS',
                    valueType: ValueType.String,
                    accessType: StateAccessType.Read,
                    type: PropertyType.GPS,
                    callback: state => (this.#getGPSState = state),
                },
                {
                    name: 'ELEVATION',
                    valueType: ValueType.Number,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Elevation,
                    callback: state => (this.#getElevationState = state),
                },
                {
                    name: 'RADIUS',
                    valueType: ValueType.Number,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Radius,
                    callback: state => (this.#getRadiusState = state),
                },
                {
                    name: 'ACCURACY',
                    valueType: ValueType.Number,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Accuracy,
                    callback: state => (this.#getAccuracyState = state),
                },
            ]),
        );
    }

    getGPS(): string | undefined {
        if (!this.#getGPSState) {
            throw new Error('GPS state not found');
        }
        return this.#getGPSState.value;
    }

    getElevation(): number | undefined {
        if (!this.#getElevationState) {
            throw new Error('Elevation state not found');
        }
        return this.#getElevationState.value;
    }

    getRadius(): number | undefined {
        if (!this.#getRadiusState) {
            throw new Error('Radius state not found');
        }
        return this.#getRadiusState.value;
    }

    getAccuracy(): number | undefined {
        if (!this.#getAccuracyState) {
            throw new Error('Accuracy state not found');
        }
        return this.#getAccuracyState.value;
    }
}
