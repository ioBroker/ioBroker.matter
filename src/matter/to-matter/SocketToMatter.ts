import { Endpoint } from '@matter/main';
import { OnOffPlugInUnitDevice } from '@matter/main/devices';
import type { GenericDevice } from '../../lib';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type Socket from '../../lib/devices/Socket';
import type { IdentifyOptions } from './GenericDeviceToMatter';
import { GenericElectricityDataDeviceToMatter } from './GenericElectricityDataDeviceToMatter';
import { initializeMaintenanceStateHandlers } from './SharedStateHandlers';

/** Mapping Logic to map a ioBroker Socket device to a Matter OnOffPlugInUnitDevice. */
export class SocketToMatter extends GenericElectricityDataDeviceToMatter {
    readonly #ioBrokerDevice: Socket;
    readonly #matterEndpoint: Endpoint<OnOffPlugInUnitDevice>;

    constructor(ioBrokerDevice: GenericDevice, name: string, uuid: string) {
        super(name, uuid);
        this.#matterEndpoint = new Endpoint(OnOffPlugInUnitDevice, { id: uuid });
        this.#ioBrokerDevice = ioBrokerDevice as Socket;
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

    getMatterEndpoints(): Endpoint[] {
        return [this.#matterEndpoint];
    }

    get ioBrokerDevice(): GenericDevice {
        return this.#ioBrokerDevice;
    }

    registerMatterHandlers(): void {
        // install matter listeners
        // here we can react on changes from the matter side for onOff
        this.#matterEndpoint.events.onOff.onOff$Changed.on(async on => {
            const currentValue = !!this.#ioBrokerDevice.getPower();
            if (on !== currentValue) {
                await this.#ioBrokerDevice.setPower(on);
            }
        });

        let isIdentifying = false;
        const identifyOptions: IdentifyOptions = {};
        this.#matterEndpoint.events.identify.identifyTime$Changed.on(async value => {
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
    }

    async registerIoBrokerHandlersAndInitialize(): Promise<void> {
        // install ioBroker listeners
        // here we react on changes from the ioBroker side for onOff and current lamp level
        this.#ioBrokerDevice.onChange(async event => {
            switch (event.property) {
                case PropertyType.Power:
                    await this.#matterEndpoint.set({
                        onOff: {
                            onOff: !!event.value,
                        },
                    });
                    break;
            }
        });

        // init current state from ioBroker side
        await this.#matterEndpoint.set({
            onOff: {
                onOff: !!this.#ioBrokerDevice.getPower(),
            },
        });

        await initializeMaintenanceStateHandlers(this.#matterEndpoint, this.#ioBrokerDevice);
        await this.initializeElectricityStateHandlers(this.#matterEndpoint, this.#ioBrokerDevice);
    }
}
