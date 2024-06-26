import { OnOffPlugInUnitDevice } from '@project-chip/matter.js/devices/OnOffPlugInUnitDevice';
import { Endpoint } from '@project-chip/matter.js/endpoint';

import { GenericDevice } from '../../lib';
import { PropertyType } from '../../lib/devices/GenericDevice';

import { IdentifyOptions, MappingGenericDevice } from './MappingGenericDevice';
import Socket from '../../lib/devices/Socket';

export class MappingSocket extends MappingGenericDevice {
    private readonly ioBrokerDevice: Socket;
    private readonly matterDevice: Endpoint<OnOffPlugInUnitDevice>;

    constructor(ioBrokerDevice: GenericDevice, name: string, uniqueStorageKey?: string) {
        super(name);
        this.matterDevice = new Endpoint(OnOffPlugInUnitDevice, { id: uniqueStorageKey });
        this.ioBrokerDevice = ioBrokerDevice as Socket;
    }

    // Just change the power state every second
    doIdentify(identifyOptions: IdentifyOptions): void {
        identifyOptions.currentState = !identifyOptions.currentState;
        this.ioBrokerDevice.setPower(identifyOptions.currentState as boolean);
    }

    // Restore the given initial state after the identity process is over
    resetIdentify(identifyOptions: IdentifyOptions): void {
        this.ioBrokerDevice.setPower(identifyOptions.initialState as boolean);
    }

    getMatterDevice(): Endpoint {
        return this.matterDevice;
    }

    getIoBrokerDevice(): GenericDevice {
        return this.ioBrokerDevice;
    }

    registerMatterHandlers(): void {
        // install matter listeners
        // here we can react on changes from the matter side for onOff
        this.matterDevice.events.onOff.onOff$Changed.on(async on => {
            const currentValue = !!this.ioBrokerDevice.getPower();
            if (on !== currentValue) {
                await this.ioBrokerDevice.setPower(on);
            }
        });

        let isIdentifying = false;
        const identifyOptions: IdentifyOptions = {};
        this.matterDevice.events.identify.identifyTime$Changed.on(value => {
            // identifyTime is set when an identify command is called and then decreased every second while indentify logic runs.
            if (value > 0 && !isIdentifying) {
                isIdentifying = true;
                const identifyInitialState = !!this.ioBrokerDevice.getPower();

                identifyOptions.currentState = identifyInitialState;
                identifyOptions.initialState = identifyInitialState;

                this.handleIdentify(identifyOptions);
            } else if (value === 0) {
                isIdentifying = false;
                this.stopIdentify(identifyOptions);
            }
        });
    }

    async init(): Promise<void> {
        this.registerMatterHandlers();

        await this.ioBrokerDevice.init();

        // install ioBroker listeners
        // here we react on changes from the ioBroker side for onOff and current lamp level
        this.ioBrokerDevice.onChange(async event => {
            if (event.property === PropertyType.Power) {
                await this.matterDevice.set({
                    onOff: {
                        onOff: !!event.value
                    }
                });            }
        });

        // init current state from ioBroker side
        await this.matterDevice.set({
            onOff: {
                onOff: !!this.ioBrokerDevice.getPower()
            }
        });
    }
}
