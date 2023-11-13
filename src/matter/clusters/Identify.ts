import { Endpoint } from '@project-chip/matter-node.js/device';
import { IdentifyCluster } from '@project-chip/matter-node.js/cluster';
import { NodeId } from '@project-chip/matter-node.js/datatype';

import Base from './Base';
import { MatterAdapter } from '../../main';

class Identify extends Base {
    private handlerType: ((value: number) => void) | undefined = undefined;
    private handlerTime: ((value: number) => void) | undefined = undefined;

    async init(nodeId: NodeId) {
        const cluster = this.endpoint.getClusterClient(IdentifyCluster);
        if (!cluster) {
            return;
        }
        await this.createChannel(nodeId, this.endpoint.getDeviceTypes());

        // create Identify channel
        let id = `controller.${Base.toJSON(nodeId).replace(/"/g, '')}.identify`;
        let channelObj = await this.adapter.getObjectAsync(id);
        if (!channelObj) {
            channelObj = {
                _id: id,
                type: 'channel',
                common: {
                    name: 'Identify',
                },
                native: {
                    nodeId: Base.toJSON(nodeId),
                    clusterId: cluster.id,
                },
            };
            await this.adapter.setObjectAsync(channelObj._id, channelObj);
        }

        // create the identify type
        const typeId = await this.createState(
            'identify.type',
            {
                name: 'Identify type',
                type: 'number',
                role: 'state',
                states: {
                    0: 'None',
                    1: 'LightOutput',
                    2: 'VisibleIndicator', // LED
                    3: 'AudibleBeep',
                    4: 'Display',
                    5: 'Actuator',
                },
                write: true,
                read: false,
            },
            Base.toJSON(nodeId),
            cluster.id,
            await cluster.getIdentifyTypeAttribute(),
        );

        // create the identify type
        const timeId = await this.createState(
            'identify.time',
            {
                name: 'Identify time',
                type: 'number',
                role: 'state',
                write: true,
                read: false,
            },
            Base.toJSON(nodeId),
            cluster.id,
            await cluster.getIdentifyTimeAttribute(),
        );

        this.handlerType = async (value: number) => {
            await this.adapter.setStateAsync(typeId, value, true);
        };
        this.handlerTime = async (value: number) => {
            await this.adapter.setStateAsync(timeId, value, true);
        };

        // subscribe on matter changes
        cluster.addIdentifyTimeAttributeListener(this.handlerTime);
        cluster.addIdentifyTypeAttributeListener(this.handlerType);

        this.createState(
            'identify.trigger',
            {
                name: 'Identify trigger',
                type: 'boolean',
                role: 'button',
                write: true,
                read: false,
            },
            Base.toJSON(nodeId),
            cluster.id,
            false,
        );

        const triggerIdentifyHandler = async (state: ioBroker.State) => {
            if (!state || state.ack) {
                return;
            }

            if (state.val) {
                const identifyTime = await this.adapter.getStateAsync(`${id}.time`);

                await cluster.identify({
                    identifyTime: parseInt((identifyTime?.val || 0).toString(), 10) || 5,
                });
            }
        };
        await this.subscribe(id, triggerIdentifyHandler);
    }
    async destroy() {
        await super.destroy();
        const cluster = this.endpoint.getClusterClient(IdentifyCluster);
        if (cluster) {
            // cluster.removeOnOffAttributeListener(this.handlerType);
            // cluster.removeOnOffAttributeListener(this.handlerTime);
        }
    }

    static async factory(adapter: MatterAdapter, nodeId: NodeId, endpoint: Endpoint): Promise<Base | undefined> {
        const cluster = endpoint.getClusterClient(IdentifyCluster);
        if (!cluster) {
            return;
        }
        const result = new Identify(adapter, endpoint);
        if (result) {
            await result.init(nodeId);
        }
        return result;
    }
}

export default Identify;