import { Endpoint } from '@matter/main';
import { OnOffPlugInUnitDevice } from '@matter/main/devices';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { Socket } from '../../lib/devices/Socket';
import type { IdentifyOptions } from './GenericDeviceToMatter';
import { GenericElectricityDataDeviceToMatter } from './GenericElectricityDataDeviceToMatter';
import { EventedOnOffPlugInUnitOnOffServer } from '../behaviors/EventedOnOffPlugInUnitOnOffServer';
import { IoBrokerEvents } from '../behaviors/IoBrokerEvents';

const IoBrokerOnOffPlugInUnitDevice = OnOffPlugInUnitDevice.with(EventedOnOffPlugInUnitOnOffServer, IoBrokerEvents);
type IoBrokerOnOffPlugInUnitDevice = typeof IoBrokerOnOffPlugInUnitDevice;

/** Mapping Logic to map a ioBroker Socket device to a Matter OnOffPlugInUnitDevice. */
export class SocketToMatter extends GenericElectricityDataDeviceToMatter {
    readonly #ioBrokerDevice: Socket;
    readonly #matterEndpoint: Endpoint<IoBrokerOnOffPlugInUnitDevice>;

    constructor(ioBrokerDevice: Socket, name: string, uuid: string) {
        super(name, uuid);
        this.#matterEndpoint = new Endpoint(IoBrokerOnOffPlugInUnitDevice, { id: uuid });
        this.#ioBrokerDevice = ioBrokerDevice;
        this.addElectricityDataClusters(this.#matterEndpoint, this.#ioBrokerDevice);
    }

    // Just change the power state every second
    doIdentify(identifyOptions: IdentifyOptions): Promise<void> {
        identifyOptions.currentState = !identifyOptions.currentState;
        return this.#ioBrokerDevice.setPower(!!identifyOptions.currentState);
    }

    // Restore the given initial state after the identity process is over
    resetIdentify(identifyOptions: IdentifyOptions): Promise<void> {
        return this.#ioBrokerDevice.setPower(!!identifyOptions.initialState);
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

        let isIdentifying = false;
        const identifyOptions: IdentifyOptions = {};
        this.matterEvents.on(this.#matterEndpoint.events.identify.identifyTime$Changed, async value => {
            // identifyTime is set when an identify command is called and then decreased every second while identify logic runs.
            if (value > 0 && !isIdentifying) {
                isIdentifying = true;
                const identifyInitialState = !!this.#ioBrokerDevice.getPower();

                identifyOptions.currentState = identifyInitialState;
                identifyOptions.initialState = identifyInitialState;

                this.handleIdentify(identifyOptions);
            } else if (value === 0) {
                isIdentifying = false;
                await this.stopIdentify(identifyOptions);
            }
        });

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
