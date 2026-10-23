import { Endpoint } from '@matter/main';
import type { Volume, VolumeGroup } from '../../lib';
import { IoBrokerEvents } from '../behaviors/IoBrokerEvents';
import { IoIdentifyServer } from '../behaviors/IdentifyServer';
import { IoBrokerContext } from '../behaviors/IoBrokerContext';
import { GenericDeviceToMatter } from './GenericDeviceToMatter';
import { SpeakerDevice } from '@matter/main/devices';
import { EventedSpeakerLevelControlServer } from '../behaviors/EventedSpeakerLevelControlServer';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import { LightingLevel } from '../ConversionUtils';
import { OnOffLevelMapping } from './OnOffLevelMapping';
import { MatterOnOffAttribute } from './MatterOnOffAttribute';

const IoBrokerVolumeDevice = SpeakerDevice.with(
    EventedSpeakerLevelControlServer,
    IoBrokerEvents,
    IoIdentifyServer,
    IoBrokerContext,
);

export class VolumeToMatter extends GenericDeviceToMatter {
    readonly #ioBrokerDevice: Volume | VolumeGroup;
    readonly #matterEndpoint: Endpoint<SpeakerDevice>;

    constructor(ioBrokerDevice: Volume | VolumeGroup, name: string, uuid: string) {
        super(name, uuid);

        this.#ioBrokerDevice = ioBrokerDevice;
        this.#matterEndpoint = new Endpoint(IoBrokerVolumeDevice, {
            id: uuid,
            ioBrokerContext: {
                device: ioBrokerDevice,
                adapter: ioBrokerDevice.adapter,
            },
        });
    }

    get matterEndpoints(): Endpoint[] {
        return [this.#matterEndpoint];
    }

    get ioBrokerDevice(): Volume | VolumeGroup {
        return this.#ioBrokerDevice;
    }

    async registerHandlersAndInitialize(): Promise<void> {
        await super.registerHandlersAndInitialize();

        const ioBrokerDevice = this.#ioBrokerDevice;
        const onOff = new MatterOnOffAttribute(this.#matterEndpoint);
        const mapping = new OnOffLevelMapping(
            {
                // Speaker device type: OnOff true is the unmuted state
                power: ioBrokerDevice.hasMute()
                    ? { get: () => !ioBrokerDevice.getMute(), set: on => ioBrokerDevice.setMute(!on) }
                    : undefined,
                level: { get: () => ioBrokerDevice.getLevel(), set: percent => ioBrokerDevice.setLevel(percent) },
            },
            {
                setOnOff: value => onOff.write(value),
                currentLevel: () => this.#matterEndpoint.stateOf(EventedSpeakerLevelControlServer).currentLevel,
                setCurrentLevel: currentLevel =>
                    this.#matterEndpoint.setStateOf(EventedSpeakerLevelControlServer, { currentLevel }),
            },
            LightingLevel,
        );
        await mapping.initialize();

        onOff.observe(this.matterEvents, on => mapping.matterOnOffChanged(on));
        this.matterEvents.on(this.#matterEndpoint.eventsOf(IoBrokerEvents).dimmerLevelControlled, level =>
            mapping.matterLevelControlled(level),
        );

        ioBrokerDevice.onChange(async event => {
            switch (event.property) {
                case PropertyType.Mute:
                    await mapping.ioBrokerPowerChanged(!event.value);
                    break;
                case PropertyType.Level:
                case PropertyType.LevelActual:
                    if (event.property === PropertyType.Level && ioBrokerDevice.hasLevelActual()) {
                        break;
                    }
                    await mapping.ioBrokerLevelChanged(event.value);
                    break;
            }
        });
    }
}
