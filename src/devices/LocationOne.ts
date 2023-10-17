import GenericDevice, {DetectedDevice, DeviceStateObject, PropertyType} from "./GenericDevice";

class LocationOne extends GenericDevice {
    _getGPSState: DeviceStateObject<string> | undefined;
    _getElevationState: DeviceStateObject<number> | undefined;
    _getRadiusState: DeviceStateObject<number> | undefined;
    _getAccuracyState: DeviceStateObject<number> | undefined;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter) {
        super(detectedDevice, adapter);

        this.addDeviceStates([
            {name: 'GPS', type: PropertyType.GPS, callback: state => this._getGPSState = state},
            {name: 'ELEVATION', type: PropertyType.Elevation, callback: state => this._getElevationState = state},
            {name: 'RADIUS', type: PropertyType.Radius, callback: state => this._getRadiusState = state},
            {name: 'ACCURACY', type: PropertyType.Accuracy, callback: state => this._getAccuracyState = state},
        ]);
    }

    getGPS(): string | undefined {
        if (!this._getGPSState) {
            throw new Error('GPS state not found');
        }
        return this._getGPSState.value;
    }

    getElevation(): number | undefined {
        if (!this._getElevationState) {
            throw new Error('Elevation state not found');
        }
        return this._getElevationState.value;
    }

    getRadius(): number | undefined {
        if (!this._getRadiusState) {
            throw new Error('Radius state not found');
        }
        return this._getRadiusState.value;
    }

    getAccuracy(): number | undefined {
        if (!this._getAccuracyState) {
            throw new Error('Accuracy state not found');
        }
        return this._getAccuracyState.value;
    }
}

export default LocationOne;