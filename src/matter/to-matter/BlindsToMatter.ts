import { Endpoint } from '@matter/main';
import { WindowCoveringDevice } from '@matter/main/devices';
import { MovementType, MovementDirection } from '@matter/main/behaviors';
import { EventedWindowCoveringServer } from '../behaviors/EventedWindowCoveringServer';
import { WindowCovering } from '@matter/main/clusters';
import { PropertyType } from '../../lib/devices/DeviceStateObject';
import type { BlindButtons } from '../../lib/devices/BlindButtons';
import type { Blind } from '../../lib/devices/Blind';
import { GenericDeviceToMatter } from './GenericDeviceToMatter';
import { IoBrokerEvents } from '../behaviors/IoBrokerEvents';
import { IoIdentifyServer } from '../behaviors/IdentifyServer';
import { IoBrokerContext } from '../behaviors/IoBrokerContext';

/*const PosAwareLiftWindowCoveringServer = EventedWindowCoveringServer.with(
    WindowCovering.Feature.Lift,
    WindowCovering.Feature.PositionAwareLift,
);
const PosAwareTiltWindowCoveringServer = EventedWindowCoveringServer.with(
    WindowCovering.Feature.Tilt,
    WindowCovering.Feature.PositionAwareTilt,
);*/
const IoBrokerWindowCoveringDevice = WindowCoveringDevice.with(
    EventedWindowCoveringServer,
    IoBrokerEvents,
    IoIdentifyServer,
    IoBrokerContext,
);
type IoBrokerWindowCoveringDevice = typeof IoBrokerWindowCoveringDevice;

export class BlindsToMatter extends GenericDeviceToMatter {
    readonly #ioBrokerDevice: BlindButtons | Blind;
    readonly #matterEndpoint: Endpoint<IoBrokerWindowCoveringDevice>;
    #supportedFeatures = new Array<WindowCovering.Feature>();

    constructor(ioBrokerDevice: BlindButtons | Blind, name: string, uuid: string) {
        super(name, uuid);

        this.#ioBrokerDevice = ioBrokerDevice;

        if (this.#ioBrokerDevice.hasLiftButtons() || this.#ioBrokerDevice.hasLiftLevel()) {
            this.#supportedFeatures.push(WindowCovering.Feature.Lift);
            if (this.#ioBrokerDevice.hasLiftLevel()) {
                this.#supportedFeatures.push(WindowCovering.Feature.PositionAwareLift);
            }
        }
        if (this.#ioBrokerDevice.hasTiltButtons() || this.#ioBrokerDevice.hasTiltLevel()) {
            this.#supportedFeatures.push(WindowCovering.Feature.Tilt);
            if (this.#ioBrokerDevice.hasTiltLevel()) {
                this.#supportedFeatures.push(WindowCovering.Feature.PositionAwareTilt);
            }
        }
        this.#matterEndpoint = new Endpoint(
            IoBrokerWindowCoveringDevice.with(EventedWindowCoveringServer.with(...this.#supportedFeatures)),
            {
                id: uuid,
                ioBrokerContext: {
                    device: ioBrokerDevice,
                    adapter: ioBrokerDevice.adapter,
                },
                windowCovering: {
                    type:
                        this.#supportedFeatures.includes(WindowCovering.Feature.Lift) &&
                        this.#supportedFeatures.includes(WindowCovering.Feature.Tilt)
                            ? WindowCovering.WindowCoveringType.TiltBlindLift
                            : this.#supportedFeatures.includes(WindowCovering.Feature.Lift)
                              ? WindowCovering.WindowCoveringType.Rollershade
                              : WindowCovering.WindowCoveringType.TiltBlindTiltOnly,
                    endProductType:
                        this.#supportedFeatures.includes(WindowCovering.Feature.Lift) &&
                        !this.#supportedFeatures.includes(WindowCovering.Feature.Tilt)
                            ? WindowCovering.EndProductType.RollerShade
                            : WindowCovering.EndProductType.Unknown,
                },
            },
        );
    }

    get matterEndpoints(): Endpoint[] {
        return [this.#matterEndpoint];
    }

    get ioBrokerDevice(): BlindButtons | Blind {
        return this.#ioBrokerDevice;
    }

    async registerHandlersAndInitialize(): Promise<void> {
        super.registerHandlersAndInitialize();

        if (
            this.#supportedFeatures.includes(WindowCovering.Feature.Tilt) &&
            this.#supportedFeatures.includes(WindowCovering.Feature.PositionAwareTilt)
        ) {
            await this.#matterEndpoint.setStateOf(EventedWindowCoveringServer, {
                // @ts-expect-error Workaround a matter.js instancing/typing error
                currentPositionTiltPercent100ths: Math.round(100 - (this.#ioBrokerDevice.getTiltLevel() ?? 0)) * 100,
                targetPositionTiltPercent100ths: Math.round(100 - (this.#ioBrokerDevice.getTiltLevel() ?? 0)) * 100,
            });
        }
        if (
            this.#supportedFeatures.includes(WindowCovering.Feature.Lift) &&
            this.#supportedFeatures.includes(WindowCovering.Feature.PositionAwareLift)
        ) {
            await this.#matterEndpoint.setStateOf(EventedWindowCoveringServer, {
                // @ts-expect-error Workaround a matter.js instancing/typing error
                currentPositionLiftPercent100ths:
                    Math.round(100 - ((this.#ioBrokerDevice as Blind).getLevel() ?? 0)) * 100,
                targetPositionLiftPercent100ths:
                    Math.round(100 - ((this.#ioBrokerDevice as Blind).getLevel() ?? 0)) * 100,
            });
        }

        this.matterEvents.on(
            this.#matterEndpoint.events.ioBrokerEvents.windowCoveringTriggerMovement,
            async (
                type: MovementType,
                reversed: boolean,
                direction: MovementDirection,
                targetPercent100ths?: number,
            ) => {
                if (type === MovementType.Lift && this.#supportedFeatures.includes(WindowCovering.Feature.Lift)) {
                    if (
                        this.#supportedFeatures.includes(WindowCovering.Feature.PositionAwareLift) &&
                        targetPercent100ths !== undefined &&
                        this.#ioBrokerDevice.hasLiftLevel()
                    ) {
                        await (this.#ioBrokerDevice as Blind).setLevel(100 - Math.round(targetPercent100ths / 100));
                    } else {
                        if (direction === MovementDirection.Open || reversed) {
                            if (this.#ioBrokerDevice.hasLiftButtons()) {
                                await (this.#ioBrokerDevice as BlindButtons).setOpen();
                            } else if (this.#ioBrokerDevice.hasLiftLevel()) {
                                await (this.#ioBrokerDevice as Blind).setLevel(reversed ? 0 : 100);
                            }
                        } else {
                            if (this.#ioBrokerDevice.hasLiftButtons()) {
                                await (this.#ioBrokerDevice as BlindButtons).setClose();
                            } else if (this.#ioBrokerDevice.hasLiftLevel()) {
                                await (this.#ioBrokerDevice as Blind).setLevel(reversed ? 100 : 0);
                            }
                        }
                    }
                } else if (
                    type === MovementType.Tilt &&
                    this.#supportedFeatures.includes(WindowCovering.Feature.Tilt)
                ) {
                    if (
                        this.#supportedFeatures.includes(WindowCovering.Feature.PositionAwareTilt) &&
                        targetPercent100ths !== undefined &&
                        this.#ioBrokerDevice.hasTiltLevel()
                    ) {
                        await this.#ioBrokerDevice.setTiltLevel(100 - Math.round(targetPercent100ths / 100));
                    } else {
                        if (direction === MovementDirection.Open || reversed) {
                            if (this.#ioBrokerDevice.hasTiltButtons()) {
                                await (this.#ioBrokerDevice as BlindButtons).setTiltOpen();
                            } else if (this.#ioBrokerDevice.hasTiltLevel()) {
                                await (this.#ioBrokerDevice as Blind).setLevel(reversed ? 0 : 100);
                            }
                        } else {
                            if (this.#ioBrokerDevice.hasTiltButtons()) {
                                await (this.#ioBrokerDevice as BlindButtons).setTiltClose();
                            } else if (this.#ioBrokerDevice.hasTiltLevel()) {
                                await (this.#ioBrokerDevice as Blind).setLevel(reversed ? 100 : 0);
                            }
                        }
                    }
                }
            },
        );

        this.matterEvents.on(this.#matterEndpoint.events.ioBrokerEvents.windowCoveringStopMovement, async () => {
            if (this.#supportedFeatures.includes(WindowCovering.Feature.Lift)) {
                if (this.#ioBrokerDevice.hasLiftStopButton()) {
                    await this.#ioBrokerDevice.setStop();
                } else if (this.#supportedFeatures.includes(WindowCovering.Feature.PositionAwareLift)) {
                    const currentLevel = (this.#ioBrokerDevice as Blind).getLevel();
                    if (currentLevel !== undefined) {
                        await (this.#ioBrokerDevice as Blind).setLevel(currentLevel);
                    }
                }
            }
            if (this.#supportedFeatures.includes(WindowCovering.Feature.Tilt)) {
                if (this.#ioBrokerDevice.hasTiltStopButton()) {
                    await this.#ioBrokerDevice.setTiltStop();
                } else if (this.#supportedFeatures.includes(WindowCovering.Feature.PositionAwareTilt)) {
                    const currentTiltLevel = this.#ioBrokerDevice.getTiltLevel();
                    if (currentTiltLevel !== undefined) {
                        await this.#ioBrokerDevice.setTiltLevel(currentTiltLevel);
                    }
                }
            }
        });

        this.#ioBrokerDevice.onChange(async event => {
            switch (event.property) {
                case PropertyType.TiltLevel:
                case PropertyType.TiltLevelActual:
                    if (
                        this.#supportedFeatures.includes(WindowCovering.Feature.Tilt) &&
                        this.#supportedFeatures.includes(WindowCovering.Feature.PositionAwareTilt)
                    ) {
                        await this.#matterEndpoint.setStateOf(EventedWindowCoveringServer, {
                            // @ts-expect-error Workaround a matter.js instancing/typing error
                            currentPositionTiltPercent100ths: Math.round(100 - event.value) * 100,
                        });
                        if (event.property === PropertyType.TiltLevel) {
                            await this.#matterEndpoint.setStateOf(EventedWindowCoveringServer, {
                                // @ts-expect-error Workaround a matter.js instancing/typing error
                                targetPositionTiltPercent100ths: Math.round(100 - event.value) * 100,
                            });
                        }
                    }
                    break;
                case PropertyType.Level:
                case PropertyType.LevelActual:
                    if (
                        this.#supportedFeatures.includes(WindowCovering.Feature.Lift) &&
                        this.#supportedFeatures.includes(WindowCovering.Feature.PositionAwareLift)
                    ) {
                        await this.#matterEndpoint.setStateOf(EventedWindowCoveringServer, {
                            // @ts-expect-error Workaround a matter.js instancing/typing error
                            currentPositionLiftPercent100ths: Math.round(100 - event.value) * 100,
                        });
                        if (event.property === PropertyType.Level) {
                            await this.#matterEndpoint.setStateOf(EventedWindowCoveringServer, {
                                // @ts-expect-error Workaround a matter.js instancing/typing error
                                targetPositionLiftPercent100ths: Math.round(100 - event.value) * 100,
                            });
                        }
                    }
                    break;
            }
        });
    }
}
