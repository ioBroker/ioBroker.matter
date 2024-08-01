import { LevelControlCluster } from '@project-chip/matter-node.js/cluster';
import { NodeId } from '@project-chip/matter-node.js/datatype';
import { Endpoint } from '@project-chip/matter-node.js/device';

import { MatterAdapter } from '../../main';
import Base from './Base';

class LevelControl extends Base {
    #handler: ((value: number | null) => void) | undefined = undefined;

    async init(): Promise<void> {
        const cluster = this.endpoint.getClusterClient(LevelControlCluster);
        if (!cluster) {
            return;
        }
        await this.createChannel(this.endpoint.getDeviceTypes());
        const features = await cluster.getFeatureMapAttribute();

        const max = await cluster.getMaxLevelAttribute();
        const min = await cluster.getMinLevelAttribute();
        // create onOff
        const id = await this.createState(
            'level',
            {
                name: 'OnOff',
                type: 'boolean',
                role: features.lighting ? 'level.dimmer' : 'level',
                read: true,
                write: true,
                min,
                max,
            },
            cluster.id,
            await cluster.getCurrentLevelAttribute(),
        );

        this.#handler = async (value: number | null) => {
            await this.adapter.setStateAsync(id, value, true);
        };

        // subscribe on matter changes
        cluster.addCurrentLevelAttributeListener(this.#handler);

        const levelHandler = async (state: ioBroker.State): Promise<void> => {
            if (!state || state.ack) {
                return;
            }
            try {
                await cluster.moveToLevel({
                    level: state.val as number,
                    transitionTime: 0,
                    optionsMask: {
                        executeIfOff: true,
                        coupleColorTempToLevel: false,
                    },
                    optionsOverride: {
                        executeIfOff: false,
                        coupleColorTempToLevel: false,
                    },
                });
            } catch (e) {
                this.adapter.log.error(`Cannot set ${id}: ${e.message}, stack: ${e.stack}`);
            }
        };
        await this.subscribe(id, levelHandler);
    }

    async destroy(): Promise<void> {
        await super.destroy();
        const cluster = this.endpoint.getClusterClient(LevelControlCluster);
        if (cluster) {
            // cluster.removeLevelControlAttributeListener(this.handler);
        }
    }

    static async factory(
        adapter: MatterAdapter,
        nodeId: NodeId,
        endpoint: Endpoint,
        path: number[],
    ): Promise<Base | undefined> {
        const cluster = endpoint.getClusterClient(LevelControlCluster);
        if (!cluster) {
            return;
        }
        const result = new LevelControl(adapter, nodeId, endpoint, path);
        if (result) {
            await result.init();
        }
        return result;
    }
}

export default LevelControl;
