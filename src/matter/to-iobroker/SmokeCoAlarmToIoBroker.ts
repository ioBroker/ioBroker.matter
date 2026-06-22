import ChannelDetector from '@iobroker/type-detector';
import { SmokeCoAlarm, PowerSource } from '@matter/main/clusters';
import { SmokeCoAlarmClient, PowerSourceClient } from '@matter/main/behaviors';
import type { Endpoint } from '@matter/main';
import type { PairedNode } from '@project-chip/matter.js/device';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { DetectedDevice, DeviceOptions } from '../../lib/devices/GenericDevice';
import { GenericDeviceToIoBroker } from './GenericDeviceToIoBroker';
import { FireAlarm } from '../../lib';
import type { MatterAdapter } from '../../main';

export class SmokeCoAlarmToIoBroker extends GenericDeviceToIoBroker {
    readonly #ioBrokerDevice: FireAlarm;
    readonly #rootEndpoint: Endpoint;

    constructor(
        node: PairedNode,
        endpoint: Endpoint,
        rootEndpoint: Endpoint,
        adapter: MatterAdapter,
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
        const features = this.appEndpoint.behaviors.typeFor(SmokeCoAlarmClient)?.features;
        if (!features?.smokeAlarm) {
            adapter.log.info(
                'Smoke alarm is not supported by device, but ioBroker does not support CO2 alarm currently.',
            );
        }
        this.#rootEndpoint = rootEndpoint;
    }

    protected enableDeviceTypeStates(): DeviceOptions {
        this.enableDeviceTypeStateForAttribute(PropertyType.Value, {
            endpointId: this.appEndpoint.number,
            clusterId: SmokeCoAlarm.id,
            attributeName: 'smokeState',
            convertValue: (value: SmokeCoAlarm.AlarmState) => value !== SmokeCoAlarm.AlarmState.Normal,
        });

        if (!this.#enableCustomLowPowerMapping(this.appEndpoint, this.appEndpoint)) {
            this.#enableCustomLowPowerMapping(this.#rootEndpoint, this.appEndpoint);
        }
        return super.enableDeviceTypeStates();
    }

    #enableCustomLowPowerMapping(endpoint: Endpoint, appEndpoint: Endpoint): boolean {
        const powerSource = endpoint.maybeStateOf(PowerSourceClient);
        if (powerSource === undefined) {
            return false;
        }
        const smokeCo = appEndpoint.maybeStateOf(SmokeCoAlarmClient);
        this.enableDeviceTypeStateForAttribute(PropertyType.LowBattery, {
            endpointId: this.appEndpoint.number,
            clusterId: PowerSource.id,
            attributeName: 'batChargeLevel',
            convertValue: value => {
                if (value !== PowerSource.BatChargeLevel.Ok) {
                    return true;
                }
                const smokeBatteryState = smokeCo?.batteryAlert ?? SmokeCoAlarm.AlarmState.Normal;
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
