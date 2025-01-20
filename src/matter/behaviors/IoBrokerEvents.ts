import { Behavior, Observable } from '@matter/main';
import type { DoorLock } from '@matter/main/clusters';
import type { MovementType, MovementDirection } from '@matter/main/behaviors';

export class IoBrokerEvents extends Behavior {
    static override readonly id = 'ioBrokerEvents';
    static override readonly early = true;

    declare events: IoBrokerEvents.Events;
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace IoBrokerEvents {
    export class Events extends Behavior.Events {
        // OnOff cluster events
        onOffControlled = new Observable<[boolean]>();

        // LevelControl cluster events
        dimmerLevelControlled = new Observable<[level: number, transitionTime: number | null | undefined]>();

        // ColorControl cluster events
        colorTemperatureControlled = new Observable<
            [colorTemperatureMireds: number, transitionTime: number | null | undefined]
        >();
        colorMovementStopped = new Observable<[]>(); // TODO
        colorXyControlled = new Observable<[x: number, y: number, transitionTime: number | null | undefined]>();
        colorHueControlled = new Observable<
            [hue: number, transitionTime: number | null | undefined, isEnhancedHue: boolean]
        >();
        colorSaturationControlled = new Observable<[saturation: number, transitionTime: number | null | undefined]>();
        colorHueSaturationControlled = new Observable<
            [hue: number, saturation: number, transitionTime: number | null | undefined]
        >();
        colorHueAndSaturationMovementStopped = new Observable<[]>(); // TODO

        // DoorLock cluster events
        doorLockStateControlled = new Observable<[DoorLock.LockState]>();

        // WindowCovering cluster events
        windowCoveringTriggerMovement = new Observable<
            [
                type: MovementType,
                reversed: boolean,
                direction: MovementDirection,
                targetPercent100ths: number | undefined,
            ]
        >();
        windowCoveringStopMovement = new Observable<[]>();
    }
}
