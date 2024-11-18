import { Endpoint } from '@matter/main';
import { OccupancySensing } from '@matter/main/clusters';
import { LightSensorDevice, OccupancySensorDevice } from '@matter/main/devices';
import type { TypeFromBitSchema } from '@matter/main/types';
import type { GenericDevice } from '../../lib';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type Motion from '../../lib/devices/Motion';
import { GenericDeviceToMatter, type IdentifyOptions } from './GenericDeviceToMatter';
import { initializeMaintenanceStateHandlers } from './SharedStateHandlers';

/** Mapping Logic to map a ioBroker Temperature device to a Matter TemperatureSensorDevice. */
export class MotionToMatter extends GenericDeviceToMatter {
    readonly #ioBrokerDevice: Motion;
    readonly #matterEndpointOccupancy: Endpoint<OccupancySensorDevice>;
    readonly #matterEndpointLightSensor?: Endpoint<LightSensorDevice>;

    constructor(ioBrokerDevice: GenericDevice, name: string, uuid: string) {
        super(name, uuid);
        this.#matterEndpointOccupancy = new Endpoint(OccupancySensorDevice, {
            id: `${uuid}-Occupancy`,
            occupancySensing: {
                // Deprecated fields but mandatory, so et PIR for now
                occupancySensorType: OccupancySensing.OccupancySensorType.Pir,
                occupancySensorTypeBitmap: { pir: true },
            },
        });
        this.#ioBrokerDevice = ioBrokerDevice as Motion;
        if (this.#ioBrokerDevice.hasBrightness()) {
            this.#matterEndpointLightSensor = new Endpoint(LightSensorDevice, { id: `${uuid}-LightSensor` });
        }
    }

    async doIdentify(_identifyOptions: IdentifyOptions): Promise<void> {}
    async resetIdentify(_identifyOptions: IdentifyOptions): Promise<void> {}

    getMatterEndpoints(): Endpoint[] {
        const endpoints: Endpoint[] = [this.#matterEndpointOccupancy];
        if (this.#matterEndpointLightSensor) {
            endpoints.push(this.#matterEndpointLightSensor);
        }
        return endpoints;
    }

    get ioBrokerDevice(): GenericDevice {
        return this.#ioBrokerDevice;
    }

    registerMatterHandlers(): void {}

    convertMotionValue(value: boolean): TypeFromBitSchema<typeof OccupancySensing.Occupancy> {
        return { occupied: value };
    }

    convertBrightnessValue(value: number): number {
        return 10_000 * Math.log10(value) + 1;
    }

    async registerIoBrokerHandlersAndInitialize(): Promise<void> {
        // install ioBroker listeners
        // here we react on changes from the ioBroker side for onOff and current lamp level
        this.#ioBrokerDevice.onChange(async event => {
            switch (event.property) {
                case PropertyType.Motion:
                    await this.#matterEndpointOccupancy.set({
                        occupancySensing: {
                            occupancy: this.convertMotionValue(event.value as boolean),
                        },
                    });
                    break;
                case PropertyType.Brightness:
                    if (this.#matterEndpointLightSensor?.owner !== undefined) {
                        await this.#matterEndpointLightSensor?.set({
                            illuminanceMeasurement: {
                                measuredValue: this.convertBrightnessValue(event.value as number),
                            },
                        });
                    }
                    break;
            }
        });

        const value = this.#ioBrokerDevice.getMotion();
        // init current state from ioBroker side
        await this.#matterEndpointOccupancy.set({
            occupancySensing: {
                occupancy: this.convertMotionValue(value ?? false),
            },
        });
        await initializeMaintenanceStateHandlers(this.#matterEndpointOccupancy, this.#ioBrokerDevice);

        if (this.#matterEndpointLightSensor && this.#matterEndpointLightSensor?.owner !== undefined) {
            const humidity = this.#ioBrokerDevice.getBrightness();
            await this.#matterEndpointLightSensor.set({
                illuminanceMeasurement: {
                    measuredValue: humidity === undefined ? null : this.convertBrightnessValue(humidity),
                },
            });
            await initializeMaintenanceStateHandlers(this.#matterEndpointLightSensor, this.#ioBrokerDevice);
        }
    }
}
