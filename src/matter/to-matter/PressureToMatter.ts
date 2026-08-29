import { Endpoint } from '@matter/main';
import { PressureSensorDevice } from '@matter/main/devices';
import type { Pressure } from '../../lib/devices/Pressure';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import { GenericDeviceToMatter } from './GenericDeviceToMatter';
import { IoIdentifyServer } from '../behaviors/IdentifyServer';
import { IoBrokerContext } from '../behaviors/IoBrokerContext';

/** Mapping Logic to map a ioBroker Pressure device to a Matter PressureSensorDevice. */
export class PressureToMatter extends GenericDeviceToMatter {
    readonly #ioBrokerDevice: Pressure;
    readonly #matterEndpoint: Endpoint<PressureSensorDevice>;

    constructor(ioBrokerDevice: Pressure, name: string, uuid: string) {
        super(name, uuid);
        this.#matterEndpoint = new Endpoint(PressureSensorDevice.with(IoIdentifyServer, IoBrokerContext), {
            id: uuid,
            ioBrokerContext: {
                device: ioBrokerDevice,
                adapter: ioBrokerDevice.adapter,
            },
        });
        this.#ioBrokerDevice = ioBrokerDevice;
    }

    get matterEndpoints(): Endpoint[] {
        return [this.#matterEndpoint];
    }

    get ioBrokerDevice(): Pressure {
        return this.#ioBrokerDevice;
    }

    convertPressureValue(value: number): number {
        // Matter MeasuredValue = 10 x Pressure[kPa]; ioBroker PRESSURE is mbar and 1 kPa = 10 mbar,
        // so the two factors cancel out and MeasuredValue equals the mbar value.
        return Math.round(this.#ioBrokerDevice.cropValue(value, -0x7fff, 0x7fff));
    }

    async registerHandlersAndInitialize(): Promise<void> {
        await super.registerHandlersAndInitialize();

        const value = this.#ioBrokerDevice.getPressure();
        // init current state from ioBroker side
        await this.#matterEndpoint.set({
            pressureMeasurement: {
                measuredValue: typeof value === 'number' ? this.convertPressureValue(value) : null,
            },
        });

        this.#ioBrokerDevice.onChange(async event => {
            switch (event.property) {
                case PropertyType.Pressure:
                    await this.#matterEndpoint.set({
                        pressureMeasurement: {
                            measuredValue:
                                typeof event.value === 'number' ? this.convertPressureValue(event.value) : null,
                        },
                    });
                    break;
            }
        });
    }
}
