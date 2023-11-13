import { Endpoint } from '@project-chip/matter-node.js/device';
import { OnOffCluster } from '@project-chip/matter-node.js/cluster';
import { NodeId } from '@project-chip/matter-node.js/datatype';

import Base from './Base';
import { MatterAdapter } from '../../main';

class OnOff extends Base {
    private handler: ((value: boolean) => void) | undefined = undefined;

    async init(nodeId: NodeId) {
        const cluster = this.endpoint.getClusterClient(OnOffCluster);
        if (!cluster) {
            return;
        }
        await this.createChannel(nodeId, this.endpoint.getDeviceTypes());
        const features = await cluster.getFeatureMapAttribute();
        // create onOff
        const id = await this.createState(
            'onOff',
            {
                name: 'Boolean state',
                type: 'boolean',
                role: features.levelControlForLighting ? 'switch.light' : 'switch',
                read: true,
                write: true,
            },
            Base.toJSON(nodeId),
            cluster.id,
            await cluster.getOnOffAttribute(),
        );

        this.handler = async (value: boolean) => {
            await this.adapter.setStateAsync(id, value, true);
        };

        // subscribe on matter changes
        cluster.addOnOffAttributeListener(this.handler);

        const onOffHandler = async (state: ioBroker.State) => {
            if (!state || state.ack) {
                return;
            }
            try {
                if (state.val) {
                    await cluster.on();
                } else {
                    await cluster.off();
                }
            } catch (e) {
                this.adapter.log.error(`Cannot set ${id}: ${e.message}, stack: ${e.stack}`);
            }
        };
        await this.subscribe(id, onOffHandler);
    }

    async destroy() {
        await super.destroy();
        const cluster = this.endpoint.getClusterClient(OnOffCluster);
        if (cluster) {
            // cluster.removeOnOffAttributeListener(this.handler);
        }
    }

    static async factory(adapter: MatterAdapter, nodeId: NodeId, endpoint: Endpoint): Promise<Base | undefined> {
        const cluster = endpoint.getClusterClient(OnOffCluster);
        if (!cluster) {
            return;
        }
        const result = new OnOff(adapter, endpoint);
        if (result) {
            await result.init(nodeId);
        }
        return result;
    }
}

export default OnOff;