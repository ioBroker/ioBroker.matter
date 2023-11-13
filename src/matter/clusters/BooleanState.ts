import { Endpoint } from '@project-chip/matter-node.js/device';
import { BooleanStateCluster } from '@project-chip/matter-node.js/cluster';
import { NodeId } from '@project-chip/matter-node.js/datatype';

import Base from './Base';
import { MatterAdapter } from '../../main';

class BooleanState extends Base {
    private handler: ((value: boolean) => void) | undefined = undefined;

    async init(nodeId: NodeId) {
        const cluster = this.endpoint.getClusterClient(BooleanStateCluster);
        if (!cluster) {
            return;
        }
        await this.createChannel(nodeId, this.endpoint.getDeviceTypes());
        const id = await this.createState(
            'booleanState',
            {
                name: 'Boolean state',
                type: 'boolean',
                role: 'state',
                read: true,
                write: false,
            },
            Base.toJSON(nodeId),
            cluster.id,
            await cluster.getStateValueAttribute(),
        );

        this.handler = async (value: boolean) => {
            await this.adapter.setStateAsync(id, value, true);
        };

        // subscribe on matter changes
        cluster.addStateValueAttributeListener(this.handler);
    }

    async destroy() {
        await super.destroy();
        const cluster = this.endpoint.getClusterClient(BooleanStateCluster);
        if (cluster) {
            // cluster.removeStateValueAttributeListener(this.handler);
        }
    }

    static async factory(adapter: MatterAdapter, nodeId: NodeId, endpoint: Endpoint): Promise<Base | undefined> {
        const cluster = endpoint.getClusterClient(BooleanStateCluster);
        if (!cluster) {
            return;
        }
        const result = new BooleanState(adapter, endpoint);
        if (result) {
            await result.init(nodeId);
        }
        return result;
    }
}

export default BooleanState;