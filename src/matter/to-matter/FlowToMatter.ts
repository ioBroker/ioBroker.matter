import { Endpoint } from '@matter/main';
import { FlowSensorDevice } from '@matter/main/devices';
import type { Flow } from '../../lib/devices/Flow';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import { GenericDeviceToMatter } from './GenericDeviceToMatter';
import { IoIdentifyServer } from '../behaviors/IdentifyServer';
import { IoBrokerContext } from '../behaviors/IoBrokerContext';

/** Mapping Logic to map a ioBroker Flow device to a Matter FlowSensorDevice. */
export class FlowToMatter extends GenericDeviceToMatter {
    readonly #ioBrokerDevice: Flow;
    readonly #matterEndpoint: Endpoint<FlowSensorDevice>;

    constructor(ioBrokerDevice: Flow, name: string, uuid: string) {
        super(name, uuid);
        this.#matterEndpoint = new Endpoint(FlowSensorDevice.with(IoIdentifyServer, IoBrokerContext), {
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

    get ioBrokerDevice(): Flow {
        return this.#ioBrokerDevice;
    }

    convertFlowValue(value: number): number {
        // Matter MeasuredValue = 10 x Flow[m³/h], ioBroker FLOW is already m³/h.
        return Math.round(this.#ioBrokerDevice.cropValue(value * 10, 0, 0xfffe));
    }

    async registerHandlersAndInitialize(): Promise<void> {
        await super.registerHandlersAndInitialize();

        const value = this.#ioBrokerDevice.getFlow();
        // init current state from ioBroker side
        await this.#matterEndpoint.set({
            flowMeasurement: {
                measuredValue: typeof value === 'number' ? this.convertFlowValue(value) : null,
            },
        });

        this.#ioBrokerDevice.onChange(async event => {
            switch (event.property) {
                case PropertyType.Flow:
                    await this.#matterEndpoint.set({
                        flowMeasurement: {
                            measuredValue: typeof event.value === 'number' ? this.convertFlowValue(event.value) : null,
                        },
                    });
                    break;
            }
        });
    }
}
