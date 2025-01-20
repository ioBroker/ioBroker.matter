import { Endpoint } from '@matter/main';
import { GenericSwitchDevice } from '@matter/main/devices';
import { SwitchServer } from '@matter/main/behaviors';
import { Switch } from '@matter/main/clusters';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { Button } from '../../lib/devices/Button';
import { GenericDeviceToMatter, type IdentifyOptions } from './GenericDeviceToMatter';

const SwitchDevice = GenericSwitchDevice.with(
    SwitchServer.withFeatures(
        Switch.Feature.MomentarySwitch,
        Switch.Feature.MomentarySwitchRelease,
        Switch.Feature.MomentarySwitchMultiPress,
    ),
);

export class ButtonToMatter extends GenericDeviceToMatter {
    readonly #ioBrokerDevice: Button;
    readonly #matterEndpoint: Endpoint<typeof SwitchDevice>;

    constructor(ioBrokerDevice: Button, name: string, uuid: string) {
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
        this.#ioBrokerDevice = ioBrokerDevice;
    }

    async doIdentify(_identifyOptions: IdentifyOptions): Promise<void> {}
    async resetIdentify(_identifyOptions: IdentifyOptions): Promise<void> {}

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
