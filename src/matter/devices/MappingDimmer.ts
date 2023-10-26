import { DimmableLightDevice, Device } from '@project-chip/matter-node.js/device';

import { GenericDevice } from '../../lib';
import { PropertyType } from '../../lib/devices/GenericDevice';

import { MappingGenericDevice } from './MappingGenericDevice';
import Dimmer from '../../lib/devices/Dimmer';

export class MappingDimmer extends MappingGenericDevice {
    private readonly ioBrokerDevice: Dimmer;
    private readonly matterDevice: DimmableLightDevice;

    constructor(ioBrokerDevice: GenericDevice, name: string, uniqueStorageKey?: string) {
        super(name);
        this.matterDevice = new DimmableLightDevice(undefined, undefined, { uniqueStorageKey });
        this.ioBrokerDevice = ioBrokerDevice as Dimmer;

        this.matterDevice.addOnOffListener(async on => {
            const currentValue = !!this.ioBrokerDevice.getPower();
            if (on !== null && on !== currentValue) {
                await this.ioBrokerDevice.setPower(on);
            }
        });
        this.matterDevice.addCurrentLevelListener(async(level: number | null) => {
            const currentValue = this.ioBrokerDevice.getLevel();
            if (level !== currentValue && level !== null) {
                await this.ioBrokerDevice.setLevel(level);
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