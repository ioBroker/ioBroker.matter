type SubscibeCallback = (id: string, state: ioBroker.State) => void;

interface Subscibe {
    id: string;
    callback: SubscibeCallback;
}

class SubscribeManager {
    static subscribes: Subscibe[] = [];
    static adapter: ioBroker.Adapter;
    static setAdapter(adapter: ioBroker.Adapter) {
        SubscribeManager.adapter = adapter;
    }
    static observer (id: string, state: ioBroker.State | null | undefined) {
        if (state) {
            SubscribeManager.subscribes.forEach(subscribe => {
                if (subscribe.id === id) {
                    subscribe.callback(id, state);
                }
            });
        }
    }

    static subscribe(id: string, callback: SubscibeCallback) {
        SubscribeManager.adapter.subscribeStates(id);
        SubscribeManager.subscribes.push({id, callback});
    }

    static unsubscribe(id: string, callback: SubscibeCallback) {
        SubscribeManager.subscribes = SubscribeManager.subscribes.filter(subscribe => {
            return subscribe.id !== id || subscribe.callback !== callback;
        });
        if (SubscribeManager.subscribes.filter(subscribe => subscribe.id === id).length === 0) {
            SubscribeManager.adapter.unsubscribeStates(id);
        }
    }


}

export default SubscribeManager;