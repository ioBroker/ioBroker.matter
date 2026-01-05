import { Endpoint } from '@matter/main';
import type { Volume, VolumeGroup } from '../../lib';
import { IoBrokerEvents } from '../behaviors/IoBrokerEvents';
import { IoIdentifyServer } from '../behaviors/IdentifyServer';
import { IoBrokerContext } from '../behaviors/IoBrokerContext';
import { GenericDeviceToMatter } from './GenericDeviceToMatter';
import { SpeakerDevice } from '@matter/main/devices';
import { EventedSpeakerOnOffServer } from '../behaviors/EventedSpeakerOnOffServer';
import { EventedSpeakerLevelControlServer } from '../behaviors/EventedSpeakerLevelControlServer';
import { PropertyType } from '../../lib/devices/DeviceStateObject';

const IoBrokerVolumeDevice = SpeakerDevice.with(
    EventedSpeakerLevelControlServer,
    EventedSpeakerOnOffServer,
    IoBrokerEvents,
    IoIdentifyServer,
    IoBrokerContext,
);

const MIN_LEVEL_VALUE = 1;
const MAX_LEVEL_VALUE = 0xfe;

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
        const level = ioBrokerDevice.getLevel() ?? 0;

        let muted = level === 0;

        if (ioBrokerDevice.hasMute()) {
            muted = ioBrokerDevice.getMute() ?? false;
        }

        // Initial populate matter values

        await this.#matterEndpoint.set({
            levelControl: {
                currentLevel: this.asMatterLevel(level),
            },
        });

        await this.#matterEndpoint.set({
            onOff: {
                onOff: !muted,
            },
        });

        // Matter event listeners

        this.matterEvents.on(this.#matterEndpoint.eventsOf(IoBrokerEvents).onOffControlled, async volumeOn => {
            if (this.#ioBrokerDevice.hasMute()) {
                await this.#ioBrokerDevice.setMute(!volumeOn);

                return;
            }

            console.log('Got something');

            // Device does NOT have a mute capability directly

            // Device is getting muted
            if (!volumeOn) {
                await this.#ioBrokerDevice.setLevel(0);

                return;
            }

            // Device is getting unmuted
            if (this.#ioBrokerDevice.getLevel() === 0) {
                const currentLevel = this.#matterEndpoint.stateOf(EventedSpeakerLevelControlServer)?.currentLevel;

                let targetIoBrokerLevel = 100;
                if (typeof currentLevel === 'number') {
                    targetIoBrokerLevel = this.asIoBrokerLevel(currentLevel);
                }
                await this.#ioBrokerDevice.setLevel(targetIoBrokerLevel);
            }
        });

        this.matterEvents.on(this.#matterEndpoint.eventsOf(IoBrokerEvents).dimmerLevelControlled, async level => {
            await this.#ioBrokerDevice.setLevel(this.asIoBrokerLevel(level));

            if (!this.#ioBrokerDevice.hasMute()) {
                await this.#matterEndpoint.setStateOf(EventedSpeakerOnOffServer, {
                    onOff: level > 0,
                });
            }
            // Do not infer the mute state from the level (level is 0).
        });

        // ioBroker Event listeners

        ioBrokerDevice.onChange(async event => {
            switch (event.property) {
                case PropertyType.Mute: {
                    const ioValue = (event.value ?? false) as boolean;

                    await this.#matterEndpoint.setStateOf(EventedSpeakerOnOffServer, {
                        onOff: !ioValue,
                    });

                    break;
                }
                case PropertyType.Level:
                case PropertyType.LevelActual: {
                    if (event.property === PropertyType.Level && this.#ioBrokerDevice.hasLevelActual()) {
                        break;
                    }

                    const ioValue = (event.value ?? 100) as number;

                    if (!ioBrokerDevice.hasMute()) {
                        await this.#matterEndpoint.setStateOf(EventedSpeakerOnOffServer, {
                            onOff: ioValue > 0,
                        });
                    }

                    if (ioValue > 0) {
                        const value = ioBrokerDevice.cropValue(ioValue, 1, 100);

                        await this.#matterEndpoint.setStateOf(EventedSpeakerLevelControlServer, {
                            currentLevel: this.asMatterLevel(value),
                        });
                    }

                    break;
                }
            }
        });
    }

    /** Converts the given value in 0..100 range to a valid Level Matter value. */
    asMatterLevel(value: number): number {
        return this.#ioBrokerDevice.cropValue(Math.round((value / 100) * 254), MIN_LEVEL_VALUE, MAX_LEVEL_VALUE);
    }

    asIoBrokerLevel(level: number): number {
        return this.#ioBrokerDevice.cropValue(Math.round((level / 254) * 100), 0, 100);
    }
}
