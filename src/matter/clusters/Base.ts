import { Logger } from '@project-chip/matter-node.js/log';
import { MatterAdapter } from '../../main';
import { NodeId } from '@project-chip/matter-node.js/datatype';
import { AtLeastOne } from '@project-chip/matter-node.js/util';
import {
    Endpoint, DeviceTypeDefinition,
} from '@project-chip/matter-node.js/device';
import { SubscribeManager } from '../../lib';

class Base {
    protected adapter: MatterAdapter;
    protected endpoint: Endpoint;
    private subscribes: Record<string, ((state: any) => void)[]> = {};

    constructor(adapter: MatterAdapter, endpoint: Endpoint) {
        this.adapter = adapter;
        this.endpoint = endpoint;
    }

    static toJSON(nodeId: NodeId): string {
        return Logger.toJSON(nodeId);
    }

    async subscribe(id: string, handler: (state: ioBroker.State) => void): Promise<void> {
        const stateId = `${this.adapter.namespace}.${id}`;
        this.subscribes[stateId] = this.subscribes[id] || [];
        this.subscribes[stateId].push(handler);

        await SubscribeManager.subscribe(stateId, handler);
    }

    async destroy() {
        for (const id in this.subscribes) {
            for (const handler of this.subscribes[id]) {
                await SubscribeManager.unsubscribe(id, handler);
            }
        }
    }

    async createChannel(nodeId: NodeId, deviceTypes: AtLeastOne<DeviceTypeDefinition>) {
        if (!deviceTypes) {
            return;
        }

        // find first not MA-bridgednode device
        const deviceType = deviceTypes.find(type => type.name !== 'MA-bridgednode');

        // create onOff
        const id = `controller.${Base.toJSON(nodeId).replace(/"/g, '')}.states`;
        let stateObj = await this.adapter.getObjectAsync(id);
        if (!stateObj) {
            stateObj = {
                _id: id,
                type: 'channel',
                common: {
                    name: deviceType ? deviceType.name.replace(/^MA-/, '') :
                        (deviceTypes[0] ? deviceTypes[0].name.replace(/^MA-/, '') :'Unknown'),
                },
                native: {
                    nodeId: Base.toJSON(nodeId),
                },
            };
            await this.adapter.setObjectAsync(stateObj._id, stateObj);
        }
    }

    async createState(
        id: string,
        common: ioBroker.StateCommon,
        jsonNodeId: string,
        clusterId: number,
        currentValue: any | undefined = undefined,
    ): Promise<string> {
        // create onOff
        const _id = `controller.${jsonNodeId.replace(/"/g, '')}.states.${id}`;
        let stateObj = await this.adapter.getObjectAsync(id);
        if (!stateObj) {
            stateObj = {
                _id,
                type: 'state',
                common: {
                    ...common,
                },
                native: {
                    nodeId: jsonNodeId,
                    clusterId: clusterId,
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