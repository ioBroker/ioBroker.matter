import { Endpoint } from '@matter/main';
import { OccupancySensing } from '@matter/main/clusters';
import { LightSensorDevice, OccupancySensorDevice } from '@matter/main/devices';
import type { TypeFromBitSchema } from '@matter/main/types';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { Motion } from '../../lib/devices/Motion';
import { GenericDeviceToMatter, type IdentifyOptions } from './GenericDeviceToMatter';

/** Mapping Logic to map a ioBroker Temperature device to a Matter TemperatureSensorDevice. */
export class MotionToMatter extends GenericDeviceToMatter {
    readonly #ioBrokerDevice: Motion;
    readonly #matterEndpointOccupancy: Endpoint<OccupancySensorDevice>;
    readonly #matterEndpointLightSensor?: Endpoint<LightSensorDevice>;

    constructor(ioBrokerDevice: Motion, name: string, uuid: string) {
        super(name, uuid);
        this.#matterEndpointOccupancy = new Endpoint(OccupancySensorDevice, {
            id: `${uuid}-Occupancy`,
            occupancySensing: {
                // Deprecated fields but mandatory, so et PIR for now
                occupancySensorType: OccupancySensing.OccupancySensorType.Pir,
                occupancySensorTypeBitmap: { pir: true },
            },
        });
        this.#ioBrokerDevice = ioBrokerDevice;
        if (this.#ioBrokerDevice.hasBrightness()) {
            this.#matterEndpointLightSensor = new Endpoint(LightSensorDevice, { id: `${uuid}-LightSensor` });
        }
    }

    async doIdentify(_identifyOptions: IdentifyOptions): Promise<void> {}
    async resetIdentify(_identifyOptions: IdentifyOptions): Promise<void> {}

    get matterEndpoints(): Endpoint[] {
        const endpoints: Endpoint[] = [this.#matterEndpointOccupancy];
        if (this.#matterEndpointLightSensor) {
            endpoints.push(this.#matterEndpointLightSensor);
        }
        return endpoints;
    }

    get ioBrokerDevice(): Motion {
        return this.#ioBrokerDevice;
    }

    convertMotionValue(value: boolean): TypeFromBitSchema<typeof OccupancySensing.Occupancy> {
        return { occupied: value };
    }

    convertBrightnessValue(value: number): number {
        return Math.round(10_000 * Math.log10(value) + 1);
    }

    async registerHandlersAndInitialize(): Promise<void> {
        await super.registerHandlersAndInitialize();

        await this.#matterEndpointOccupancy.set({
            occupancySensing: {
                occupancy: this.convertMotionValue(this.#ioBrokerDevice.getMotion() ?? false),
            },
        });

        if (this.#matterEndpointLightSensor && this.#matterEndpointLightSensor?.owner !== undefined) {
            const humidity = this.#ioBrokerDevice.getBrightness();
            await this.#matterEndpointLightSensor.set({
                illuminanceMeasurement: {
                    measuredValue: typeof humidity === 'number' ? this.convertBrightnessValue(humidity) : null,
                },
            });
        }

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
    }
}
