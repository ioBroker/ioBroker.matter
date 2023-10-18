type SubscribeCallback = (id: string, state: ioBroker.State) => void;

class SubscribeManager {
    static subscribes: { [id: string]: SubscribeCallback[] } = {};
    static adapter: ioBroker.Adapter;
    static setAdapter(adapter: ioBroker.Adapter): void {
        SubscribeManager.adapter = adapter;
    }
    static observer(id: string, state: ioBroker.State | null | undefined): void {
        if (state) {
            SubscribeManager.subscribes[id].forEach(callback => callback(id, state));
        }
    }

    static async subscribe(id: string, callback: SubscribeCallback): Promise<void> {
        if (!SubscribeManager.subscribes[id]) {
            SubscribeManager.adapter.log.debug(`Subscribe to "${id}"`);
            await SubscribeManager.adapter.subscribeForeignStatesAsync(id);
        }

        SubscribeManager.subscribes[id].push(callback);
    }

    static async unsubscribe(id: string, callback: SubscribeCallback): Promise<void> {
        const pos = SubscribeManager.subscribes[id].indexOf(callback);
        if (pos !== -1) {
            SubscribeManager.subscribes[id].splice(pos, 1);
        }
        if (!SubscribeManager.subscribes[id].length) {
            SubscribeManager.adapter.log.debug(`Unsubscribe from "${id}"`);
            await SubscribeManager.adapter.unsubscribeForeignStatesAsync(id);
        }
    }
}

export default SubscribeManager;