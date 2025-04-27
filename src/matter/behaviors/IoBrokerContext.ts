import { Behavior } from '@matter/main';
import type { GenericDevice } from '../../lib/devices/GenericDevice';

export class IoBrokerContext extends Behavior {
    static override readonly id = 'ioBrokerContext';
    static override readonly early = true;

    declare state: IoBrokerContext.State;

    override initialize(): void {
        if (!this.state.device) {
            throw new Error('Device not set');
        }
        if (!this.state.adapter) {
            throw new Error('Adapter not set');
        }
    }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace IoBrokerContext {
    export class State extends Behavior.State {
        adapter!: ioBroker.Adapter;
        device!: GenericDevice;
    }
}
