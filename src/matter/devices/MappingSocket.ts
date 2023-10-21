import { OnOffPluginUnitDevice, Device } from '@project-chip/matter.js/device';

import { GenericDevice } from '../../lib';
import { PropertyType } from '../../lib/devices/GenericDevice';

import { MappingGenericDevice } from './MappingGenericDevice';
import Socket from '../../lib/devices/Socket';

export class MappingSocket extends MappingGenericDevice {
    private readonly ioBrokerDevice: Socket;
    private readonly matterDevice: OnOffPluginUnitDevice;

    constructor(ioBrokerDevice: GenericDevice, name: string, uniqueStorageKey?: string) {
        super(name);
        this.matterDevice = new OnOffPluginUnitDevice(undefined, { uniqueStorageKey });
        this.ioBrokerDevice = ioBrokerDevice as Socket;

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