import { Endpoint, Millis } from '@matter/main';
import { GenericSwitchDevice } from '@matter/main/devices';
import { SwitchServer } from '@matter/main/behaviors';
import { Switch } from '@matter/main/clusters';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { ButtonSensor } from '../../lib/devices/ButtonSensor';
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

const SwithDeviceWithLongPress = GenericSwitchDevice.with(
    SwitchServer.withFeatures(
        Switch.Feature.MomentarySwitch,
        Switch.Feature.MomentarySwitchRelease,
        Switch.Feature.MomentarySwitchMultiPress,
        Switch.Feature.MomentarySwitchLongPress,
    ),
    IoIdentifyServer,
    IoBrokerContext,
);

export class ButtonSensorToMatter extends GenericDeviceToMatter {
    readonly #ioBrokerDevice: ButtonSensor;
    readonly #matterEndpoint: Endpoint<typeof SwitchDevice | typeof SwithDeviceWithLongPress>;

    constructor(ioBrokerDevice: ButtonSensor, name: string, uuid: string) {
        super(name, uuid);

        this.#ioBrokerDevice = ioBrokerDevice;
        const hasLongPress = this.#ioBrokerDevice.hasPressLong();
        const Type = hasLongPress ? SwithDeviceWithLongPress : SwitchDevice;

        this.#matterEndpoint = new Endpoint(Type, {
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
                longPressDelay: hasLongPress ? Millis(450) : undefined,
            },
        });
    }

    get matterEndpoints(): Endpoint[] {
        return [this.#matterEndpoint];
    }

    get ioBrokerDevice(): ButtonSensor {
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
                case PropertyType.PressLong:
                    if (!event.value) {
                        return;
                    }
                    await this.#matterEndpoint.set({
                        switch: {
                            currentPosition: 1,
                        },
                    });
                    await this.ioBrokerDevice.adapter.delay(500);
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
