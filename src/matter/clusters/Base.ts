import { AtLeastOne, Logger, NodeId } from '@matter/main';
import { DeviceTypeDefinition, Endpoint } from '@project-chip/matter.js/device';
import { SubscribeManager } from '../../lib';
import { MatterAdapter } from '../../main';

class Base {
    protected adapter: MatterAdapter;
    protected endpoint: Endpoint;
    #subscribes: Record<string, ((state: any) => Promise<void>)[]> = {};
    protected prefix: string;
    protected jsonNodeId: string;

    constructor(adapter: MatterAdapter, nodeId: NodeId, endpoint: Endpoint, path: number[]) {
        this.adapter = adapter;
        this.endpoint = endpoint;
        this.jsonNodeId = Base.toJSON(nodeId).replace(/"/g, '');

        if (path.length > 1) {
            const newPath = [...path];
            newPath.shift();
            this.prefix = `${newPath.join('.')}.`;
            // create folder
            const id = `controller.${this.jsonNodeId.replace(/"/g, '')}.${this.prefix.substring(0, this.prefix.length - 1)}`;
            this.adapter.getObjectAsync(id).then(obj => {
                if (!obj) {
                    this.adapter.setObjectAsync(id, {
                        type: 'device',
                        common: {
                            name: `Device ${this.prefix.substring(0, this.prefix.length - 1)}`,
                        },
                        native: {},
                    });
                }
            });
        } else {
            this.prefix = '';
        }
    }

    static toJSON(nodeId: NodeId): string {
        return Logger.toJSON(nodeId);
    }

    async subscribe(id: string, handler: (state: ioBroker.State) => void): Promise<void> {
        const stateId = `${this.adapter.namespace}.${id}`;
        this.#subscribes[stateId] = this.#subscribes[id] || [];
        const subscriptionHandler = async (state: ioBroker.State): Promise<void> => {
            // For Controller implementations we only care about updates with ack=false
            if (!state.ack) return handler(state);
        };
        this.#subscribes[stateId].push(subscriptionHandler);

        await SubscribeManager.subscribe(stateId, subscriptionHandler);
    }

    async destroy(): Promise<void> {
        for (const id in this.#subscribes) {
            for (const handler of this.#subscribes[id]) {
                await SubscribeManager.unsubscribe(id, handler);
            }
        }
    }

    async createChannel(deviceTypes: AtLeastOne<DeviceTypeDefinition>): Promise<void> {
        if (!deviceTypes) {
            return;
        }

        // find first not MA-bridgednode device
        const deviceType = deviceTypes.find(type => type.name !== 'MA-bridgednode');

        // create onOff
        const id = `controller.${this.jsonNodeId.replace(/"/g, '')}.${this.prefix}states`;
        let stateObj = await this.adapter.getObjectAsync(id);
        if (!stateObj) {
            stateObj = {
                _id: id,
                type: 'channel',
                common: {
                    name: deviceType
                        ? deviceType.name.replace(/^MA-/, '')
                        : deviceTypes[0]
                          ? deviceTypes[0].name.replace(/^MA-/, '')
                          : 'Unknown',
                },
                native: {
                    nodeId: this.jsonNodeId,
                },
            };
            await this.adapter.setObjectAsync(stateObj._id, stateObj);
        }
    }

    async createState(
        id: string,
        common: ioBroker.StateCommon,
        clusterId: number,
        currentValue: any | undefined = undefined,
    ): Promise<string> {
        let _id;
        // create onOff
        if (id.includes('.')) {
            _id = `controller.${this.jsonNodeId.replace(/"/g, '')}.${this.prefix}${id}`;
        } else {
            _id = `controller.${this.jsonNodeId.replace(/"/g, '')}.${this.prefix}states.${id}`;
        }

        let stateObj = await this.adapter.getObjectAsync(id);
        if (!stateObj) {
            stateObj = {
                _id,
                type: 'state',
                common: {
                    ...common,
                },
                native: {
                    clusterId,
                },
            };
            await this.adapter.setObjectAsync(stateObj._id, stateObj);
        }

        if (currentValue !== undefined) {
            const state = await this.adapter.getStateAsync(id);

            // init state
            if (!state || state.val !== currentValue) {
                await this.adapter.setStateAsync(_id, currentValue, true);
            }
        }

        return _id;
    }
}

export default Base;
