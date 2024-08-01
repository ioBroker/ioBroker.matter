import { BooleanStateCluster } from '@project-chip/matter-node.js/cluster';
import { NodeId } from '@project-chip/matter-node.js/datatype';
import { Endpoint } from '@project-chip/matter-node.js/device';

import { MatterAdapter } from '../../main';
import Base from './Base';

class BooleanState extends Base {
    #handler: ((value: boolean) => void) | undefined = undefined;

    async init(): Promise<void> {
        const cluster = this.endpoint.getClusterClient(BooleanStateCluster);
        if (!cluster) {
            return;
        }

        await this.createChannel(this.endpoint.getDeviceTypes());

        const id = await this.createState(
            'booleanState',
            {
                name: 'Boolean state',
                type: 'boolean',
                role: 'state',
                read: true,
                write: false,
            },
            cluster.id,
            await cluster.getStateValueAttribute(),
        );

        this.#handler = async (value: boolean) => {
            await this.adapter.setStateAsync(id, value, true);
        };

        // subscribe on matter changes
        cluster.addStateValueAttributeListener(this.#handler);
    }

    async destroy(): Promise<void> {
        await super.destroy();
        const cluster = this.endpoint.getClusterClient(BooleanStateCluster);
        if (cluster) {
            // cluster.removeStateValueAttributeListener(this.handler);
        }
    }

    static async factory(
        adapter: MatterAdapter,
        nodeId: NodeId,
        endpoint: Endpoint,
        path: number[],
    ): Promise<Base | undefined> {
        const cluster = endpoint.getClusterClient(BooleanStateCluster);
        if (!cluster) {
            return;
        }
        const result = new BooleanState(adapter, nodeId, endpoint, path);
        if (result) {
            await result.init();
        }
        return result;
    }
}

export default BooleanState;
