import { OnOffLightDevice } from '@project-chip/matter.js/devices/OnOffLightDevice';
import { Endpoint } from '@project-chip/matter.js/endpoint';
import { GenericDevice } from '../../lib';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import Light from '../../lib/devices/Light';
import { IdentifyOptions, MappingGenericDevice } from './MappingGenericDevice';
import { initializeElectricityStateHandlers, initializeMaintenanceStateHandlers } from './SharedStateHandlers';

/** Mapping Logic to map a ioBroker Light device to a Matter OnOffLightDevice. */
export class MappingLight extends MappingGenericDevice {
    readonly #ioBrokerDevice: Light;
    readonly #matterEndpoint: Endpoint<OnOffLightDevice>;

    constructor(ioBrokerDevice: GenericDevice, name: string, uuid: string) {
        super(name, uuid);
        this.#matterEndpoint = new Endpoint(OnOffLightDevice, { id: uuid });
        this.#ioBrokerDevice = ioBrokerDevice as Light;
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

    getIoBrokerDevice(): GenericDevice {
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
        await initializeElectricityStateHandlers(this.#matterEndpoint, this.#ioBrokerDevice);
    }
}
