import { Endpoint, Millis } from '@matter/main';
import { GenericSwitchDevice } from '@matter/main/devices';
import { SwitchServer } from '@matter/main/behaviors';
import { Switch } from '@matter/main/clusters';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { Button } from '../../lib/devices/Button';
import { GenericDeviceToMatter } from './GenericDeviceToMatter';
import { IoIdentifyServer } from '../behaviors/IdentifyServer';
import { IoBrokerContext } from '../behaviors/IoBrokerContext';

const SwitchDevice = GenericSwitchDevice.with(
    SwitchServer.withFeatures(
        Switch.Feature.MomentarySwitch,
        Switch.Feature.MomentarySwitchRelease,
        Switch.Feature.MomentarySwitchMultiPress,
    ),
    IoIdentifyServer,
    IoBrokerContext,
);

export class ButtonToMatter extends GenericDeviceToMatter {
    readonly #ioBrokerDevice: Button;
    readonly #matterEndpoint: Endpoint<typeof SwitchDevice>;

    constructor(ioBrokerDevice: Button, name: string, uuid: string) {
        super(name, uuid);
        this.#matterEndpoint = new Endpoint(SwitchDevice, {
            id: uuid,
            ioBrokerContext: {
                device: ioBrokerDevice,
                adapter: ioBrokerDevice.adapter,
            },
            switch: {
                numberOfPositions: 2,
                currentPosition: 0,
                multiPressMax: 3,
                multiPressDelay: Millis(300),
            },
        });
        this.#ioBrokerDevice = ioBrokerDevice;
    }

    get matterEndpoints(): Endpoint[] {
        return [this.#matterEndpoint];
    }

    get ioBrokerDevice(): Button {
        return this.#ioBrokerDevice;
    }

    registerHandlersAndInitialize(): void {
        super.registerHandlersAndInitialize();

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
    }
}
