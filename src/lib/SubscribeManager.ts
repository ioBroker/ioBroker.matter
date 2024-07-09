type SubscribeCallback = (state: ioBroker.State) => void;

class SubscribeManager {
    static subscribes = new Map<string, SubscribeCallback[]>();
    static locallySubscribed = false;
    static adapter: ioBroker.Adapter;
    static setAdapter(adapter: ioBroker.Adapter): void {
        SubscribeManager.adapter = adapter;
    }
    static observer(id: string, state: ioBroker.State | null | undefined): void {
        const callbacks = SubscribeManager.subscribes.get(id);
        if (callbacks !== undefined && state && !state.ack) {
            callbacks.forEach(callback => callback(state));
        }
    }

    static async subscribe(id: string, callback: SubscribeCallback): Promise<void> {
        const localSubscribe = id.startsWith(SubscribeManager.adapter.namespace);
        if (localSubscribe && !SubscribeManager.locallySubscribed) {
            SubscribeManager.adapter.subscribeStates('*');
            SubscribeManager.locallySubscribed = true;
        }
        let subscribes = SubscribeManager.subscribes.get(id);
        if (subscribes === undefined) {
            subscribes = [];
            if (!localSubscribe) {
                // SubscribeManager.adapter.log.debug(`Subscribe to "${id}"`);
                await SubscribeManager.adapter.subscribeForeignStatesAsync(id);
            }
        }

        subscribes.push(callback);
        SubscribeManager.subscribes.set(id, subscribes);
    }

    static async unsubscribe(id: string, callback: SubscribeCallback): Promise<void> {
        const subscribes = SubscribeManager.subscribes.get(id);
        if (subscribes === undefined) return;
        const pos = subscribes.indexOf(callback);
        if (pos !== -1) {
            subscribes.splice(pos, 1);
        }
        if (!subscribes.length) {
            // SubscribeManager.adapter.log.debug(`Unsubscribe from "${id}"`);
            SubscribeManager.subscribes.delete(id);
            const namespace = SubscribeManager.adapter.namespace;
            if (id.startsWith(namespace)) {
                if (Array.from(SubscribeManager.subscribes.keys()).every(id => !id.startsWith(namespace))) {
                    SubscribeManager.adapter.unsubscribeStates('*');
                    SubscribeManager.locallySubscribed = false;
                }
            } else {
                await SubscribeManager.adapter.unsubscribeForeignStatesAsync(id);
            }
        } else {
            SubscribeManager.subscribes.set(id, subscribes);
        }
    }
}

export default SubscribeManager;
