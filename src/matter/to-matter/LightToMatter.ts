import { Endpoint } from '@matter/main';
import { OnOffLightDevice } from '@matter/main/devices';
import type { GenericDevice } from '../../lib';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type Light from '../../lib/devices/Light';
import type { IdentifyOptions } from './GenericDeviceToMatter';
import { GenericElectricityDataDeviceToMatter } from './GenericElectricityDataDeviceToMatter';
import { initializeMaintenanceStateHandlers } from './SharedStateHandlers';
import { EventedOnOffLightOnOffServer } from '../behaviors/EventedOnOffLightOnOffServer';
import { IoBrokerEvents } from '../behaviors/IoBrokerEvents';

const IoBrokerOnOffLightDevice = OnOffLightDevice.with(EventedOnOffLightOnOffServer, IoBrokerEvents);
type IoBrokerOnOffLightDevice = typeof IoBrokerOnOffLightDevice;

/** Mapping Logic to map a ioBroker Light device to a Matter OnOffLightDevice. */
export class LightToMatter extends GenericElectricityDataDeviceToMatter {
    readonly #ioBrokerDevice: Light;
    readonly #matterEndpoint: Endpoint<IoBrokerOnOffLightDevice>;

    constructor(ioBrokerDevice: GenericDevice, name: string, uuid: string) {
        super(name, uuid);
        this.#matterEndpoint = new Endpoint(IoBrokerOnOffLightDevice, { id: uuid });
        this.#ioBrokerDevice = ioBrokerDevice as Light;
        this.addElectricityDataClusters(this.#matterEndpoint, this.#ioBrokerDevice);
    }

    // Just change the power state every second
    doIdentify(identifyOptions: IdentifyOptions): Promise<void> {
        identifyOptions.currentState = !identifyOptions.currentState;
        return this.#ioBrokerDevice.setPower(identifyOptions.currentState as boolean);
    }

    // Restore the given initial state after the identity process is over
    resetIdentify(identifyOptions: IdentifyOptions): Promise<void> {
        return this.#ioBrokerDevice.setPower(identifyOptions.initialState as boolean);
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
        this.#matterEndpoint.events.ioBrokerEvents.onOffControlled.on(async on => {
            const currentValue = !!this.#ioBrokerDevice.getPower();
            if (on !== currentValue) {
                await this.#ioBrokerDevice.setPower(on);
            }
        });

        let isIdentifying = false;
        const identifyOptions: IdentifyOptions = {};
        this.matterEvents.on(this.#matterEndpoint.events.identify.identifyTime$Changed, async (value, _a, _b) => {
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
