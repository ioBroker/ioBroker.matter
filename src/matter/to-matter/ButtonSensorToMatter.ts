import { Endpoint } from '@matter/main';
import { GenericSwitchDevice } from '@matter/main/devices';
import { SwitchServer } from '@matter/main/behaviors';
import { Switch } from '@matter/main/clusters';
import type { GenericDevice } from '../../lib';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type ButtonSensor from '../../lib/devices/ButtonSensor';
import { GenericDeviceToMatter, type IdentifyOptions } from './GenericDeviceToMatter';
import { initializeMaintenanceStateHandlers } from './SharedStateHandlers';

const SwitchDevice = GenericSwitchDevice.with(
    SwitchServer.withFeatures(
        Switch.Feature.MomentarySwitch,
        Switch.Feature.MomentarySwitchRelease,
        Switch.Feature.MomentarySwitchMultiPress,
    ),
);

const SwithDeviceWithLongPress = GenericSwitchDevice.with(
    SwitchServer.withFeatures(
        Switch.Feature.MomentarySwitch,
        Switch.Feature.MomentarySwitchRelease,
        Switch.Feature.MomentarySwitchMultiPress,
        Switch.Feature.MomentarySwitchLongPress,
    ),
);

/** Mapping Logic to map a ioBroker Temperature device to a Matter TemperatureSensorDevice. */
export class ButtonSensorToMatter extends GenericDeviceToMatter {
    readonly #ioBrokerDevice: ButtonSensor;
    readonly #matterEndpoint: Endpoint<typeof SwitchDevice | typeof SwithDeviceWithLongPress>;

    constructor(ioBrokerDevice: GenericDevice, name: string, uuid: string) {
        super(name, uuid);

        this.#ioBrokerDevice = ioBrokerDevice as ButtonSensor;
        const hasLongPress = this.#ioBrokerDevice.hasPressLong();
        const Type = hasLongPress ? SwithDeviceWithLongPress : SwitchDevice;

        this.#matterEndpoint = new Endpoint(Type, {
            id: uuid,
            switch: {
                numberOfPositions: 2,
                currentPosition: 0,
                multiPressMax: 3,
                multiPressDelay: 300,
                longPressDelay: hasLongPress ? 450 : undefined,
            },
        });
    }

    async doIdentify(_identifyOptions: IdentifyOptions): Promise<void> {}
    async resetIdentify(_identifyOptions: IdentifyOptions): Promise<void> {}

    get matterEndpoints(): Endpoint[] {
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

        await initializeMaintenanceStateHandlers(this.#matterEndpoint, this.#ioBrokerDevice);
    }
}
