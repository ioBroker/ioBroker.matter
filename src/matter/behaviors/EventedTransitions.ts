import { Observable, type Behavior, type MaybePromise, Transitions } from '@matter/main';

export class EventedTransitions<B extends Behavior> extends Transitions<B> {
    currentLevel$Changed = new Observable<[level: number]>();
    colorTemperatureMireds$Changed = new Observable<[colorTemperatureMireds: number]>();
    currentHue$Changed = new Observable<[hue: number]>();
    currentSaturation$Changed = new Observable<[saturation: number]>();
    currentXy$Changed = new Observable<[x: number | null, y: number | null]>();

    protected override applyUpdates(
        behavior: B,
        changes: Partial<Transitions.StateOf<B>>,
    ): MaybePromise<Partial<Transitions.StateOf<B>>> {
        const state = behavior.state as Record<string, number | null>;

        let xyHandled = false;
        for (const name in changes) {
            const value = changes[name as Transitions.PropertyOf<B>];
            if (value !== undefined && (value === null || typeof value === 'number')) {
                if (value !== null) {
                    switch (name) {
                        case 'currentLevel':
                            this.currentLevel$Changed.emit(value);
                            continue;
                        case 'colorTemperatureMireds':
                            this.colorTemperatureMireds$Changed.emit(value);
                            continue;
                        case 'currentHue':
                            this.currentHue$Changed.emit(value);
                            continue;
                        case 'currentSaturation':
                            this.currentSaturation$Changed.emit(value);
                            continue;
                        case 'currentX':
                        case 'currentY':
                            if (!xyHandled) {
                                xyHandled = true;
                                const currentX =
                                    ('currentX' in changes && typeof changes.currentX === 'number'
                                        ? changes.currentX
                                        : undefined) ?? state.currentX;
                                const currentY =
                                    ('currentY' in changes && typeof changes.currentY === 'number'
                                        ? changes.currentY
                                        : undefined) ?? state.currentY;
                                this.currentXy$Changed.emit(currentX, currentY);
                            }
                            continue;
                    }
                }
                state[name] = value;
            }
        }

        return changes;
    }
}
