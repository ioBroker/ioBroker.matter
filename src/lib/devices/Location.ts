import { DeviceStateObject, PropertyType, ValueType } from './DeviceStateObject';
import GenericDevice, { DetectedDevice, DeviceOptions, StateAccessType } from './GenericDevice';

class Location extends GenericDevice {
    #getLongitudeState?: DeviceStateObject<number>;
    #getLatitudeState?: DeviceStateObject<number>;
    #getElevationState?: DeviceStateObject<number>;
    #getRadiusState?: DeviceStateObject<number>;
    #getAccuracyState?: DeviceStateObject<number>;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter, options?: DeviceOptions) {
        super(detectedDevice, adapter, options);

        this._construction.push(
            this.addDeviceStates([
                {
                    name: 'LONGITUDE',
                    valueType: ValueType.Number,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Longitude,
                    callback: state => (this.#getLongitudeState = state),
                },
                {
                    name: 'LATITUDE',
                    valueType: ValueType.Number,
                    accessType: StateAccessType.Read,
                    type: PropertyType.Latitude,
                    callback: state => (this.#getLatitudeState = state),
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

    getLongitude(): number | undefined {
        if (!this.#getLongitudeState) {
            throw new Error('Longitude state not found');
        }
        return this.#getLongitudeState.value;
    }

    getLatitude(): number | undefined {
        if (!this.#getLatitudeState) {
            throw new Error('Latitude state not found');
        }
        return this.#getLatitudeState.value;
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

export default Location;
