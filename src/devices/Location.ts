import GenericDevice, { DetectedDevice, DeviceStateObject, PropertyType } from './GenericDevice';

class Location extends GenericDevice {
    _getLongitudeState: DeviceStateObject<number> | undefined;
    _getLatitudeState: DeviceStateObject<number> | undefined;
    _getElevationState: DeviceStateObject<number> | undefined;
    _getRadiusState: DeviceStateObject<number> | undefined;
    _getAccuracyState: DeviceStateObject<number> | undefined;

    constructor(detectedDevice: DetectedDevice, adapter: ioBroker.Adapter) {
        super(detectedDevice, adapter);

        this.addDeviceStates([
            { name: 'LONGITUDE', type: PropertyType.Longitude, callback: state => this._getLongitudeState = state },
            { name: 'LATITUDE', type: PropertyType.Latitude, callback: state => this._getLatitudeState = state },
            { name: 'ELEVATION', type: PropertyType.Elevation, callback: state => this._getElevationState = state },
            { name: 'RADIUS', type: PropertyType.Radius, callback: state => this._getRadiusState = state },
            { name: 'ACCURACY', type: PropertyType.Accuracy, callback: state => this._getAccuracyState = state },
        ]);
    }

    getLongitude(): number | undefined {
        if (!this._getLongitudeState) {
            throw new Error('Longitude state not found');
        }
        return this._getLongitudeState.value;
    }

    getLatitude(): number | undefined {
        if (!this._getLatitudeState) {
            throw new Error('Latitude state not found');
        }
        return this._getLatitudeState.value;
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

export default Location;