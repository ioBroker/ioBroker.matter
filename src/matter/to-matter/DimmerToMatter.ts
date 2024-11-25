import { Endpoint } from '@matter/main';
import { DimmableLightDevice } from '@matter/main/devices';
import type { GenericDevice } from '../../lib';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type Dimmer from '../../lib/devices/Dimmer';
import type { IdentifyOptions } from './GenericDeviceToMatter';
import { GenericElectricityDataDeviceToMatter } from './GenericElectricityDataDeviceToMatter';
import { initializeMaintenanceStateHandlers } from './SharedStateHandlers';

/** Mapping Logic to map a ioBroker Dimmer device to a Matter DimmableLightDevice. */
export class DimmerToMatter extends GenericElectricityDataDeviceToMatter {
    readonly #ioBrokerDevice: Dimmer;
    readonly #matterEndpoint: Endpoint<DimmableLightDevice>;

    constructor(ioBrokerDevice: GenericDevice, name: string, uuid: string) {
        super(name, uuid);
        this.#matterEndpoint = new Endpoint(DimmableLightDevice, { id: uuid });
        this.#ioBrokerDevice = ioBrokerDevice as Dimmer;
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

    get ioBrokerDevice(): Dimmer {
        return this.#ioBrokerDevice;
    }

    registerMatterHandlers(): void {
        if (this.ioBrokerDevice.hasPower()) {
            this.#matterEndpoint.events.onOff.onOff$Changed.on(async on => {
                const currentValue = !!this.#ioBrokerDevice.getPower();
                if (on !== currentValue) {
                    await this.#ioBrokerDevice.setPower(on);
                }
            });
        }

        this.#matterEndpoint.events.levelControl.currentLevel$Changed.on(async (level: number | null) => {
            const currentValue = this.#ioBrokerDevice.getLevel();
            if (level !== currentValue && level !== null) {
                await this.#ioBrokerDevice.setLevel(Math.round((level / 254) * 100));
            }
        });

        if (this.ioBrokerDevice.hasPower()) {
            let isIdentifying = false;
            const identifyOptions: IdentifyOptions = {};
            this.#matterEndpoint.events.identify.identifyTime$Changed.on(async value => {
                // identifyTime is set when an identify command is called and then decreased every second while indentify logic runs.
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
                case PropertyType.Level:
                    await this.#matterEndpoint.set({
                        levelControl: {
                            currentLevel: Math.round(((event.value as number) / 100) * 254),
                        },
                    });
                    break;
            }
        });

        // init current state from ioBroker side
        await this.#matterEndpoint.set({
            onOff: {
                onOff: this.ioBrokerDevice.hasPower() ? !!this.#ioBrokerDevice.getPower() : true,
            },
            levelControl: {
                currentLevel: this.#ioBrokerDevice.getLevel() || 1,
            },
        });

        await initializeMaintenanceStateHandlers(this.#matterEndpoint, this.#ioBrokerDevice);
        await this.initializeElectricityStateHandlers(this.#matterEndpoint, this.#ioBrokerDevice);
    }
}
