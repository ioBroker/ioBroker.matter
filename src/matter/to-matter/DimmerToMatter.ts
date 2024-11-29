import { Endpoint } from '@matter/main';
import { DimmableLightDevice } from '@matter/main/devices';
import type { GenericDevice } from '../../lib';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type Dimmer from '../../lib/devices/Dimmer';
import type { IdentifyOptions } from './GenericDeviceToMatter';
import { GenericElectricityDataDeviceToMatter } from './GenericElectricityDataDeviceToMatter';
import { initializeMaintenanceStateHandlers } from './SharedStateHandlers';
import { EventedOnOffLightOnOffServer } from '../behaviors/EventedOnOffLightOnOffServer';
import { IoBrokerEvents } from '../behaviors/IoBrokerEvents';
import { EventedLightingLevelControlServer } from '../behaviors/EventedLightingLevelControlServer';

const IoBrokerDimmableLightDevice = DimmableLightDevice.with(
    EventedOnOffLightOnOffServer,
    EventedLightingLevelControlServer,
    IoBrokerEvents,
);
type IoBrokerDimmableLightDevice = typeof IoBrokerDimmableLightDevice;

/** Mapping Logic to map a ioBroker Dimmer device to a Matter DimmableLightDevice. */
export class DimmerToMatter extends GenericElectricityDataDeviceToMatter {
    readonly #ioBrokerDevice: Dimmer;
    readonly #matterEndpoint: Endpoint<IoBrokerDimmableLightDevice>;

    constructor(ioBrokerDevice: GenericDevice, name: string, uuid: string) {
        super(name, uuid);
        this.#matterEndpoint = new Endpoint(IoBrokerDimmableLightDevice, { id: uuid });
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
            this.#matterEndpoint.events.ioBrokerEvents.onOffControlled.on(async on => {
                const currentValue = !!this.#ioBrokerDevice.getPower();
                if (on !== currentValue) {
                    await this.#ioBrokerDevice.setPower(on);
                }
            });
        }

        this.#matterEndpoint.events.ioBrokerEvents.dimmerLevelControlled.on(async level => {
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
                case PropertyType.Level: {
                    const value = this.#ioBrokerDevice.cropValue((event.value as number) ?? 0, 0, 100);

                    await this.#matterEndpoint.set({
                        levelControl: {
                            currentLevel: Math.round((value / 100) * 254) || 1,
                        },
                    });
                    break;
                }
            }
        });

        const currentLevel = this.#ioBrokerDevice.cropValue(this.#ioBrokerDevice.getLevel() ?? 0, 0, 100);

        // init current state from ioBroker side
        await this.#matterEndpoint.set({
            onOff: {
                onOff: this.ioBrokerDevice.hasPower() ? !!this.#ioBrokerDevice.getPower() : true,
            },
            levelControl: {
                currentLevel: Math.round((currentLevel / 100) * 254) || 1,
            },
        });

        await initializeMaintenanceStateHandlers(this.#matterEndpoint, this.#ioBrokerDevice);
        await this.initializeElectricityStateHandlers(this.#matterEndpoint, this.#ioBrokerDevice);
    }
}
