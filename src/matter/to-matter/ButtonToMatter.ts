import { Endpoint } from '@matter/main';
import { GenericSwitchDevice } from '@matter/main/devices';
import { SwitchServer } from '@matter/main/behaviors';
import { Switch } from '@matter/main/clusters';
import type { GenericDevice } from '../../lib';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type Button from '../../lib/devices/Button';
import { GenericDeviceToMatter, type IdentifyOptions } from './GenericDeviceToMatter';
import { initializeMaintenanceStateHandlers } from './SharedStateHandlers';

const SwitchDevice = GenericSwitchDevice.with(
    SwitchServer.withFeatures(
        Switch.Feature.MomentarySwitch,
        Switch.Feature.MomentarySwitchRelease,
        Switch.Feature.MomentarySwitchMultiPress,
    ),
);

/** Mapping Logic to map a ioBroker Temperature device to a Matter TemperatureSensorDevice. */
export class ButtonToMatter extends GenericDeviceToMatter {
    readonly #ioBrokerDevice: Button;
    readonly #matterEndpoint: Endpoint<typeof SwitchDevice>;

    constructor(ioBrokerDevice: GenericDevice, name: string, uuid: string) {
        super(name, uuid);
        this.#matterEndpoint = new Endpoint(SwitchDevice, {
            id: uuid,
            switch: {
                numberOfPositions: 2,
                currentPosition: 0,
                multiPressMax: 3,
                multiPressDelay: 300,
            },
        });
        this.#ioBrokerDevice = ioBrokerDevice as Button;
    }

    async doIdentify(_identifyOptions: IdentifyOptions): Promise<void> {}
    async resetIdentify(_identifyOptions: IdentifyOptions): Promise<void> {}

    getMatterEndpoints(): Endpoint[] {
        return [this.#matterEndpoint];
    }

    get ioBrokerDevice(): GenericDevice {
        return this.#ioBrokerDevice;
    }

    registerMatterHandlers(): void {}

    async registerIoBrokerHandlersAndInitialize(): Promise<void> {
        // install ioBroker listeners
        // here we react on changes from the ioBroker side for onOff and current lamp level
        this.#ioBrokerDevice.onChange(async event => {
            switch (event.property) {
                case PropertyType.Press:
                    if (!event.value) {
                        return;
                    }
                    await this.#matterEndpoint.set({
                        switch: {
                            currentPosition: 1,
                        },
                    });
                    await this.ioBrokerDevice.adapter.delay(70);
                    await this.#matterEndpoint.set({
                        switch: {
                            currentPosition: 0,
                        },
                    });
                    break;
            }
        });

        await initializeMaintenanceStateHandlers(this.#matterEndpoint, this.#ioBrokerDevice);
    }
}
