import { Endpoint } from '@matter/main';
import { OnOffPlugInUnitDevice } from '@matter/main/devices';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { Socket } from '../../lib/devices/Socket';
import { GenericElectricityDataDeviceToMatter } from './GenericElectricityDataDeviceToMatter';
import { EventedOnOffPlugInUnitOnOffServer } from '../behaviors/EventedOnOffPlugInUnitOnOffServer';
import { IoBrokerEvents } from '../behaviors/IoBrokerEvents';
import { IoIdentifyServer } from '../behaviors/IdentifyServer';
import { IoBrokerContext } from '../behaviors/IoBrokerContext';

const IoBrokerOnOffPlugInUnitDevice = OnOffPlugInUnitDevice.with(
    EventedOnOffPlugInUnitOnOffServer,
    IoBrokerEvents,
    IoIdentifyServer,
    IoBrokerContext,
);
type IoBrokerOnOffPlugInUnitDevice = typeof IoBrokerOnOffPlugInUnitDevice;

/** Mapping Logic to map a ioBroker Socket device to a Matter OnOffPlugInUnitDevice. */
export class SocketToMatter extends GenericElectricityDataDeviceToMatter {
    readonly #ioBrokerDevice: Socket;
    readonly #matterEndpoint: Endpoint<IoBrokerOnOffPlugInUnitDevice>;

    constructor(ioBrokerDevice: Socket, name: string, uuid: string) {
        super(name, uuid);
        this.#matterEndpoint = new Endpoint(IoBrokerOnOffPlugInUnitDevice, {
            id: uuid,
            ioBrokerContext: {
                device: ioBrokerDevice,
                adapter: ioBrokerDevice.adapter,
            },
        });
        this.#ioBrokerDevice = ioBrokerDevice;
        this.addElectricityDataClusters(this.#matterEndpoint, this.#ioBrokerDevice);
    }

    get matterEndpoints(): Endpoint[] {
        return [this.#matterEndpoint];
    }

    get ioBrokerDevice(): Socket {
        return this.#ioBrokerDevice;
    }

    async registerHandlersAndInitialize(): Promise<void> {
        await super.registerHandlersAndInitialize();

        await this.initializeElectricityStateHandlers(this.#matterEndpoint, this.#ioBrokerDevice);

        await this.#matterEndpoint.set({
            onOff: {
                onOff: !!this.#ioBrokerDevice.getPower(),
            },
        });

        this.matterEvents.on(
            this.#matterEndpoint.events.ioBrokerEvents.onOffControlled,
            async on => await this.#ioBrokerDevice.setPower(on),
        );

        this.#ioBrokerDevice.onChange(async event => {
            switch (event.property) {
                case PropertyType.Power:
                case PropertyType.PowerActual:
                    await this.#matterEndpoint.set({
                        onOff: {
                            onOff: !!event.value,
                        },
                    });
                    break;
            }
        });
    }
}
