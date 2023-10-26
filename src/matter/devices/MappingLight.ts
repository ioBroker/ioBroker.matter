import { OnOffLightDevice, Device } from '@project-chip/matter-node.js/device';

import { GenericDevice } from '../../lib';
import { PropertyType } from '../../lib/devices/GenericDevice';

import { MappingGenericDevice } from './MappingGenericDevice';
import Light from '../../lib/devices/Light';

export class MappingLight extends MappingGenericDevice {
    private readonly ioBrokerDevice: Light;
    private readonly matterDevice: OnOffLightDevice;

    constructor(ioBrokerDevice: GenericDevice, name: string, uniqueStorageKey?: string) {
        super(name);
        this.matterDevice = new OnOffLightDevice(undefined, { uniqueStorageKey });
        this.ioBrokerDevice = ioBrokerDevice as Light;

        this.matterDevice.addOnOffListener(async on => {
            const currentValue = !!this.ioBrokerDevice.getPower();
            if (on !== currentValue) {
                await this.ioBrokerDevice.setPower(on);
            }
        });
        this.matterDevice.addCommandHandler('identify', async({ request: { identifyTime } }) => {
            // identifyTime is in seconds
            console.log(
                `Identify called for OnOffDevice ${this.getName()} with id: ${uniqueStorageKey} and identifyTime: ${identifyTime}`,
            );
        });
    }

    getMatterDevice(): Device {
        return this.matterDevice as Device;
    }

    getIoBrokerDevice(): GenericDevice {
        return this.ioBrokerDevice;
    }

    async init(): Promise<void> {
        await this.ioBrokerDevice.init();
        this.ioBrokerDevice.onChange(event => {
            if (event.property === PropertyType.Power) {
                this.matterDevice.setOnOff(!!event.value);
            }
        });
        this.matterDevice.setOnOff(!!this.ioBrokerDevice.getPower());
    }
}