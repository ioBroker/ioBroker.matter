import ChannelDetector from '@iobroker/type-detector';
import type { Endpoint } from '@matter/main';
import { ActivatedCarbonFilterMonitoring, HepaFilterMonitoring, ResourceMonitoring } from '@matter/main/clusters';
import { ActivatedCarbonFilterMonitoringClient, HepaFilterMonitoringClient } from '@matter/main/behaviors';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { DetectedDevice, DeviceOptions } from '../../lib/devices/GenericDevice';
import { AirPurifier } from '../../lib/devices/AirPurifier';
import type { Fan } from '../../lib/devices/Fan';
import { FanToIoBroker } from './FanToIoBroker';
import type { MatterAdapter } from '../../main';

function changeIndicated(value: ResourceMonitoring.ChangeIndication | undefined): boolean {
    return value !== undefined && value !== ResourceMonitoring.ChangeIndication.Ok;
}

function hepaChangeIndicated(endpoint: Endpoint): boolean {
    return changeIndicated(endpoint.maybeStateOf(HepaFilterMonitoringClient)?.changeIndication);
}

function carbonChangeIndicated(endpoint: Endpoint): boolean {
    return changeIndicated(endpoint.maybeStateOf(ActivatedCarbonFilterMonitoringClient)?.changeIndication);
}

export class AirPurifierToIoBroker extends FanToIoBroker {
    protected override createIoBrokerDevice(adapter: MatterAdapter, options: DeviceOptions): Fan {
        return new AirPurifier(
            { ...ChannelDetector.getPatterns().airPurifier, isIoBrokerDevice: false } as DetectedDevice,
            adapter,
            options,
        );
    }

    protected override enableDeviceTypeStates(): DeviceOptions {
        const endpointId = this.appEndpoint.number;

        this.enableDeviceTypeStateForAttribute(PropertyType.FilterCondition, {
            endpointId,
            clusterId: HepaFilterMonitoring.id,
            attributeName: 'condition',
        });
        this.enableDeviceTypeStateForAttribute(PropertyType.FilterConditionCarbon, {
            endpointId,
            clusterId: ActivatedCarbonFilterMonitoring.id,
            attributeName: 'condition',
        });

        // The ioBroker device has one maintenance flag for all filters, so either monitoring cluster raises it. The
        // cluster that did not change is read from the endpoint state, where it still holds its current value.
        this.enableDeviceTypeStateForAttribute(PropertyType.FilterChange, {
            endpointId,
            clusterId: HepaFilterMonitoring.id,
            attributeName: 'changeIndication',
            convertValue: (value: ResourceMonitoring.ChangeIndication) =>
                changeIndicated(value) || carbonChangeIndicated(this.appEndpoint),
        });
        this.enableDeviceTypeStateForAttribute(PropertyType.FilterChange, {
            endpointId,
            clusterId: ActivatedCarbonFilterMonitoring.id,
            attributeName: 'changeIndication',
            convertValue: (value: ResourceMonitoring.ChangeIndication) =>
                changeIndicated(value) || hepaChangeIndicated(this.appEndpoint),
        });
        // A property binds to one cluster only, so the carbon filter needs its own path into the same state
        this.registerStateChangeHandlerForAttribute({
            endpointId,
            clusterId: ActivatedCarbonFilterMonitoring.id,
            attributeName: 'changeIndication',
            matterValueChanged: (value: ResourceMonitoring.ChangeIndication) =>
                this.ioBrokerDevice.updatePropertyValue(
                    PropertyType.FilterChange,
                    changeIndicated(value) || hepaChangeIndicated(this.appEndpoint),
                ),
        });

        return super.enableDeviceTypeStates();
    }
}
