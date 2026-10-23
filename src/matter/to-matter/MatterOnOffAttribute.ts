import type { ActionContext, Endpoint, ObserverGroup } from '@matter/main';
import { OnOffServer } from '@matter/main/behaviors';

/**
 * The OnOff attribute of a bridged endpoint, for an `OnOffLevelMapping`. It tells the changes it writes itself apart
 * from all others by their transaction, not by their value, so a controller change that happens to have the value of
 * a pending own write still counts.
 */
export class MatterOnOffAttribute {
    readonly #endpoint: Endpoint;
    readonly #ownWrites = new WeakSet<ActionContext>();

    constructor(endpoint: Endpoint) {
        this.#endpoint = endpoint;
    }

    /**
     * Writes OnOff. The value is read only once the write holds the OnOff lock, so a command that held the lock and
     * changed the ioBroker states meanwhile is not overwritten with an older value.
     *
     * @param value returns the OnOff value to write
     */
    async write(value: () => boolean): Promise<void> {
        await this.#endpoint.act('ioBroker OnOff', async agent => {
            this.#ownWrites.add(agent.context);
            const onOff = agent.get(OnOffServer);
            // A plain state write locks synchronously and throws "Cannot lock ... synchronously" while a command
            // holds the lock
            await agent.context.transaction.addResources(onOff);
            await agent.context.transaction.begin();
            onOff.state.onOff = value();
        });
    }

    /**
     * Calls `handler` for every OnOff change {@link write} did not make: On/Off/Toggle commands, OnOff cluster
     * timers and the on/off part of "with on/off" level commands.
     */
    observe(observers: ObserverGroup, handler: (on: boolean) => Promise<void>): void {
        observers.on(this.#endpoint.eventsOf(OnOffServer).onOff$Changed, (on, _oldValue, context) => {
            if (context !== undefined && this.#ownWrites.has(context)) {
                return;
            }
            return handler(on);
        });
    }
}
