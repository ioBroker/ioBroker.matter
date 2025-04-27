import ChannelDetector from '@iobroker/type-detector';
import { SmokeCoAlarm, PowerSource } from '@matter/main/clusters';
import type { Endpoint, PairedNode } from '@project-chip/matter.js/device';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { DetectedDevice, DeviceOptions } from '../../lib/devices/GenericDevice';
import { GenericDeviceToIoBroker } from './GenericDeviceToIoBroker';
import { FireAlarm } from '../../lib';

export class SmokeCoAlarmToIoBroker extends GenericDeviceToIoBroker {
    readonly #ioBrokerDevice: FireAlarm;
    readonly #rootEndpoint: Endpoint;

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
        this.#rootEndpoint = rootEndpoint;
    }

    protected enableDeviceTypeStates(): DeviceOptions {
        this.enableDeviceTypeStateForAttribute(PropertyType.Value, {
            endpointId: this.appEndpoint.getNumber(),
            clusterId: SmokeCoAlarm.Cluster.id,
            attributeName: 'smokeState',
            convertValue: (value: SmokeCoAlarm.AlarmState) => value !== SmokeCoAlarm.AlarmState.Normal,
        });

        if (!this.#enableCustomLowPowerMapping(this.appEndpoint, this.appEndpoint)) {
            this.#enableCustomLowPowerMapping(this.#rootEndpoint, this.appEndpoint);
        }
        return super.enableDeviceTypeStates();
    }

    #enableCustomLowPowerMapping(endpoint: Endpoint, appEndpoint: Endpoint): boolean {
        const powerSource = endpoint.getClusterClient(PowerSource.Complete);
        if (powerSource === undefined) {
            return false;
        }
        const smokeCo = appEndpoint.getClusterClient(SmokeCoAlarm.Complete);
        this.enableDeviceTypeStateForAttribute(PropertyType.LowBattery, {
            endpointId: this.appEndpoint.getNumber(),
            clusterId: PowerSource.Cluster.id,
            attributeName: 'batChargeLevel',
            convertValue: async value => {
                if (value !== PowerSource.BatChargeLevel.Ok) {
                    return true;
                }
                const smokeBatteryState =
                    (await smokeCo?.getBatteryAlertAttribute(false)) ?? SmokeCoAlarm.AlarmState.Normal;
                return smokeBatteryState !== SmokeCoAlarm.AlarmState.Normal;
            },
            pollAttribute: true,
        });
        return true;
    }

    get ioBrokerDevice(): FireAlarm {
        return this.#ioBrokerDevice;
    }
}
