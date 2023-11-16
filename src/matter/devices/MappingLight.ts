import { OnOffLightDevice, Device } from '@project-chip/matter-node.js/device';

import { GenericDevice } from '../../lib';
import { PropertyType } from '../../lib/devices/GenericDevice';

import { IdentifyOptions, MappingGenericDevice } from './MappingGenericDevice';
import Light from '../../lib/devices/Light';

export class MappingLight extends MappingGenericDevice {
    private readonly ioBrokerDevice: Light;
    private readonly matterDevice: OnOffLightDevice;

    constructor(ioBrokerDevice: GenericDevice, name: string, uniqueStorageKey?: string) {
        super(name);
        this.matterDevice = new OnOffLightDevice(undefined, { uniqueStorageKey });
        this.ioBrokerDevice = ioBrokerDevice as Light;

        // install matter listeners
        // here we can react on changes from the matter side for onOff
        this.matterDevice.addOnOffListener(async on => {
            const currentValue = !!this.ioBrokerDevice.getPower();
            if (on !== currentValue) {
                await this.ioBrokerDevice.setPower(on);
            }
        });

        // Add "identify" command listener. It is the same, but the action is different for every device
        this.matterDevice.addCommandHandler(
            'identify',
            async({ request: { identifyTime }, attributes: { identifyTime: attrIdentifyTime} }) => {
                // identifyTime is in seconds
                console.log(`Identify called for OnOffDevice ${this.getName()} with id: ${uniqueStorageKey} and identifyTime: ${identifyTime}`);
                const identifyInitialState = !!this.ioBrokerDevice.getPower();

                const identifyOptions: IdentifyOptions = {
                    identifyTime,
                    counter: identifyTime / 2,
                    currentState: identifyInitialState,
                    initialState: identifyInitialState,
                };

                this.identify(attrIdentifyTime, identifyOptions);
            },
        );
    }

    // Just change the power state every second
    doIdentify(identifyOptions: IdentifyOptions) {
        identifyOptions.currentState = !identifyOptions.currentState;
        this.ioBrokerDevice.setPower(identifyOptions.currentState as boolean);
    }

    // Restore the given initial state after the identity process is over
    resetIdentify(identifyOptions: IdentifyOptions) {
        this.ioBrokerDevice.setPower(identifyOptions.initialState as boolean);
    }

    getMatterDevice(): Device {
        return this.matterDevice as Device;
    }

    getIoBrokerDevice(): GenericDevice {
        return this.ioBrokerDevice;
    }

    async init(): Promise<void> {
        await this.ioBrokerDevice.init();
        // install ioBroker listeners
        // here we react on changes from the ioBroker side for onOff and current lamp level
        this.ioBrokerDevice.onChange(event => {
            if (event.property === PropertyType.Power) {
                this.matterDevice.setOnOff(!!event.value);
            }
        });

        // init current state from ioBroker side
        this.matterDevice.setOnOff(!!this.ioBrokerDevice.getPower());
    }
}