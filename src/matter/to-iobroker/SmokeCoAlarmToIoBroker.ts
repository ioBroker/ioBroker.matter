import ChannelDetector from '@iobroker/type-detector';
import { SmokeCoAlarm } from '@matter/main/clusters';
import type { Endpoint, PairedNode } from '@project-chip/matter.js/device';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { DetectedDevice, DeviceOptions } from '../../lib/devices/GenericDevice';
import { GenericDeviceToIoBroker } from './GenericDeviceToIoBroker';
import { FireAlarm } from '../../lib';

export class SmokeCoAlarmToIoBroker extends GenericDeviceToIoBroker {
    readonly #ioBrokerDevice: FireAlarm;

    constructor(
        node: PairedNode,
        endpoint: Endpoint,
        rootEndpoint: Endpoint,
        adapter: ioBroker.Adapter,
        endpointDeviceBaseId: string,
        deviceTypeName: string,
        defaultConnectionStateId: string,
        defaultName: string,
    ) {
        super(
            adapter,
            node,
            endpoint,
            rootEndpoint,
            endpointDeviceBaseId,
            deviceTypeName,
            defaultConnectionStateId,
            defaultName,
        );

        this.#ioBrokerDevice = new FireAlarm(
            { ...ChannelDetector.getPatterns().fireAlarm, isIoBrokerDevice: false } as DetectedDevice,
            adapter,
            this.enableDeviceTypeStates(),
        );
        const smokeAlarm = this.appEndpoint.getClusterClient(SmokeCoAlarm.Complete);
        if (smokeAlarm && !smokeAlarm.supportedFeatures.smokeAlarm) {
            adapter.log.info(
                'Smoke alarm is not supported by device, but ioBroker does not support CO2 alarm currently.',
            );
        }
    }

    protected enableDeviceTypeStates(): DeviceOptions {
        this.enableDeviceTypeStateForAttribute(PropertyType.Value, {
            endpointId: this.appEndpoint.getNumber(),
            clusterId: SmokeCoAlarm.Cluster.id,
            attributeName: 'smokeState',
            convertValue: (value: SmokeCoAlarm.AlarmState) => value !== SmokeCoAlarm.AlarmState.Normal,
        });
        return super.enableDeviceTypeStates();
    }

    get ioBrokerDevice(): FireAlarm {
        return this.#ioBrokerDevice;
    }
}
