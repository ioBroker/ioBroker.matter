import { Endpoint } from '@matter/main';
import { AirPurifierDevice } from '@matter/main/devices';
import { ActivatedCarbonFilterMonitoring, HepaFilterMonitoring, ResourceMonitoring } from '@matter/main/clusters';
import { ActivatedCarbonFilterMonitoringServer, HepaFilterMonitoringServer, OnOffServer } from '@matter/main/behaviors';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { AirPurifier } from '../../lib/devices/AirPurifier';
import { FanToMatter } from './FanToMatter';
import { IoIdentifyServer } from '../behaviors/IdentifyServer';
import { IoBrokerContext } from '../behaviors/IoBrokerContext';

const IoAirPurifierDevice = AirPurifierDevice.with(IoIdentifyServer, IoBrokerContext);
const IoAirPurifierDeviceWithOnOff = AirPurifierDevice.with(OnOffServer, IoIdentifyServer, IoBrokerContext);

/** Mapping Logic to map an ioBroker Air Purifier device to a Matter AirPurifierDevice. */
export class AirPurifierToMatter extends FanToMatter<AirPurifier> {
    readonly #hepaServer?;
    readonly #carbonServer?;

    constructor(ioBrokerDevice: AirPurifier, name: string, uuid: string) {
        super(ioBrokerDevice, name, uuid, (fanControlServer, fanControlInit) => {
            const deviceType = ioBrokerDevice.hasPower() ? IoAirPurifierDeviceWithOnOff : IoAirPurifierDevice;
            return new Endpoint(deviceType.with(fanControlServer), {
                id: `${uuid}-AirPurifier`,
                ioBrokerContext: { device: ioBrokerDevice, adapter: ioBrokerDevice.adapter },
                fanControl: fanControlInit,
            });
        });

        // degradationDirection is conformance gated, so it may only be initialized together with the Condition feature
        const conditionInit = { degradationDirection: ResourceMonitoring.DegradationDirection.Down };
        // changeIndication is mandatory on both monitoring clusters and has no cluster default
        const monitoringInit = {
            changeIndication: ioBrokerDevice.hasFilterChange()
                ? this.#changeIndication(ioBrokerDevice.getFilterChange())
                : ResourceMonitoring.ChangeIndication.Ok,
        };

        if (ioBrokerDevice.hasFilterCondition() || ioBrokerDevice.hasFilterChange()) {
            const features = new Array<HepaFilterMonitoring.Feature>();
            if (ioBrokerDevice.hasFilterCondition()) {
                features.push(HepaFilterMonitoring.Feature.Condition);
            }
            if (ioBrokerDevice.hasFilterChange()) {
                features.push(HepaFilterMonitoring.Feature.Warning);
            }
            this.#hepaServer = HepaFilterMonitoringServer.with(...features);
            this.endpoint.behaviors.require(this.#hepaServer, {
                ...monitoringInit,
                ...(ioBrokerDevice.hasFilterCondition() ? conditionInit : {}),
            });
        }

        if (ioBrokerDevice.hasFilterConditionCarbon()) {
            const features = new Array<ActivatedCarbonFilterMonitoring.Feature>(
                ActivatedCarbonFilterMonitoring.Feature.Condition,
            );
            if (ioBrokerDevice.hasFilterChange()) {
                features.push(ActivatedCarbonFilterMonitoring.Feature.Warning);
            }
            this.#carbonServer = ActivatedCarbonFilterMonitoringServer.with(...features);
            this.endpoint.behaviors.require(this.#carbonServer, { ...monitoringInit, ...conditionInit });
        }
    }

    #condition(value: unknown): number {
        return typeof value === 'number' ? Math.round(this.ioBrokerDevice.cropValue(value, 0, 100, false)) : 100;
    }

    #changeIndication(value: unknown): ResourceMonitoring.ChangeIndication {
        return value ? ResourceMonitoring.ChangeIndication.Warning : ResourceMonitoring.ChangeIndication.Ok;
    }

    async registerHandlersAndInitialize(): Promise<void> {
        await super.registerHandlersAndInitialize();

        const changeIndication = this.ioBrokerDevice.hasFilterChange()
            ? this.#changeIndication(this.ioBrokerDevice.getFilterChange())
            : undefined;

        if (this.#hepaServer) {
            await this.endpoint.setStateOf(this.#hepaServer, {
                ...(this.ioBrokerDevice.hasFilterCondition()
                    ? { condition: this.#condition(this.ioBrokerDevice.getFilterCondition()) }
                    : {}),
                ...(changeIndication !== undefined ? { changeIndication } : {}),
            });
        }
        if (this.#carbonServer) {
            await this.endpoint.setStateOf(this.#carbonServer, {
                condition: this.#condition(this.ioBrokerDevice.getFilterConditionCarbon()),
                ...(changeIndication !== undefined ? { changeIndication } : {}),
            });
        }

        this.ioBrokerDevice.onChange(async event => {
            switch (event.property) {
                case PropertyType.FilterCondition:
                    if (this.#hepaServer && this.ioBrokerDevice.hasFilterCondition()) {
                        await this.endpoint.setStateOf(this.#hepaServer, {
                            condition: this.#condition(event.value),
                        });
                    }
                    break;
                case PropertyType.FilterConditionCarbon:
                    if (this.#carbonServer) {
                        await this.endpoint.setStateOf(this.#carbonServer, {
                            condition: this.#condition(event.value),
                        });
                    }
                    break;
                case PropertyType.FilterChange: {
                    // The ioBroker device reports one maintenance flag, so it applies to every filter it exposes
                    const indication = this.#changeIndication(event.value);
                    if (this.#hepaServer) {
                        await this.endpoint.setStateOf(this.#hepaServer, { changeIndication: indication });
                    }
                    if (this.#carbonServer) {
                        await this.endpoint.setStateOf(this.#carbonServer, { changeIndication: indication });
                    }
                    break;
                }
            }
        });
    }
}
