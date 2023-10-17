type SubscribeCallback = (id: string, state: ioBroker.State) => void;

interface Subscribe {
    id: string;
    callback: SubscribeCallback;
}

class SubscribeManager {
    static subscribes: Subscribe[] = [];
    static adapter: ioBroker.Adapter;
    static setAdapter(adapter: ioBroker.Adapter): void {
        SubscribeManager.adapter = adapter;
    }
    static observer(id: string, state: ioBroker.State | null | undefined): void {
        if (state) {
            SubscribeManager.subscribes.forEach(subscribe => {
                if (subscribe.id === id) {
                    subscribe.callback(id, state);
                }
            });
        }
    }

    static async subscribe(id: string, callback: SubscribeCallback): Promise<void> {
        await SubscribeManager.adapter.subscribeForeignStatesAsync(id);
        SubscribeManager.subscribes.push({id, callback});
    }

    static async unsubscribe(id: string, callback: SubscribeCallback): Promise<void> {
        SubscribeManager.subscribes = SubscribeManager.subscribes.filter(subscribe => {
            return subscribe.id !== id || subscribe.callback !== callback;
        });
        if (SubscribeManager.subscribes.filter(subscribe => subscribe.id === id).length === 0) {
            await SubscribeManager.adapter.unsubscribeForeignStatesAsync(id);
        }
    }
}

export default SubscribeManager;