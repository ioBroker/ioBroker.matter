import { IdentifyCluster } from '@project-chip/matter-node.js/cluster';
import { NodeId } from '@project-chip/matter-node.js/datatype';
import { Endpoint } from '@project-chip/matter-node.js/device';

import { MatterAdapter } from '../../main';
import Base from './Base';

class Identify extends Base {
    private handlerType: ((value: number) => void) | undefined = undefined;
    private handlerTime: ((value: number) => void) | undefined = undefined;

    async init(): Promise<void> {
        const cluster = this.endpoint.getClusterClient(IdentifyCluster);
        if (!cluster) {
            return;
        }
        await this.createChannel(this.endpoint.getDeviceTypes());

        // create Identify channel
        const _id = `controller.${this.jsonNodeId.replace(/"/g, '')}.${this.prefix}identify`;
        let channelObj = await this.adapter.getObjectAsync(_id);
        if (!channelObj) {
            channelObj = {
                _id,
                type: 'channel',
                common: {
                    name: 'Identify',
                },
                native: {
                    nodeId: this.jsonNodeId,
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

        const triggerId = await this.createState(
            'identify.trigger',
            {
                name: 'Identify trigger',
                type: 'boolean',
                role: 'button',
                write: true,
                read: false,
            },
            cluster.id,
            false,
        );

        const triggerIdentifyHandler = async (state: ioBroker.State): Promise<void> => {
            if (!state || state.ack) {
                return;
            }

            if (state.val) {
                try {
                    const identifyTime = await this.adapter.getStateAsync(timeId);

                    await cluster.identify({
                        identifyTime: parseInt((identifyTime?.val || 0).toString(), 10) || 5,
                    });
                } catch (e) {
                    this.adapter.log.error(`Cannot send command identify: ${e.message}, stack: ${e.stack}`);
                }
            }
        };

        await this.subscribe(triggerId, triggerIdentifyHandler);
    }
    async destroy(): Promise<void> {
        await super.destroy();
        const cluster = this.endpoint.getClusterClient(IdentifyCluster);
        if (cluster) {
            // cluster.removeOnOffAttributeListener(this.handlerType);
            // cluster.removeOnOffAttributeListener(this.handlerTime);
        }
    }

    static async factory(
        adapter: MatterAdapter,
        nodeId: NodeId,
        endpoint: Endpoint,
        path: number[],
    ): Promise<Base | undefined> {
        const cluster = endpoint.getClusterClient(IdentifyCluster);
        if (!cluster) {
            return;
        }
        const result = new Identify(adapter, nodeId, endpoint, path);
        if (result) {
            await result.init();
        }
        return result;
    }
}

export default Identify;
