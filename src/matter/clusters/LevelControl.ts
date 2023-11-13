import { Endpoint } from '@project-chip/matter-node.js/device';
import { LevelControlCluster } from '@project-chip/matter-node.js/cluster';
import { NodeId } from '@project-chip/matter-node.js/datatype';

import Base from './Base';
import { MatterAdapter } from '../../main';

class LevelControl extends Base {
    private handler: ((value: number | null) => void) | undefined = undefined;

    async init(nodeId: NodeId) {
        const cluster = this.endpoint.getClusterClient(LevelControlCluster);
        if (!cluster) {
            return;
        }
        await this.createChannel(nodeId, this.endpoint.getDeviceTypes());
        const features = await cluster.getFeatureMapAttribute();

        // create onOff
        const id = `controller.${Base.toJSON(nodeId).replace(/"/g, '')}.states.level`;
        let stateObj = await this.adapter.getObjectAsync(id);
        const max = await cluster.getMaxLevelAttribute();
        const min = await cluster.getMinLevelAttribute();
        let changed = false;

        if (!stateObj) {
            changed = true;
            stateObj = {
                _id: id,
                type: 'state',
                common: {
                    name: 'OnOff',
                    type: 'boolean',
                    role: features.lighting ? 'level.dimmer' : 'level',
                    read: true,
                    write: true,
                    min,
                    max,
                },
                native: {
                    nodeId: Base.toJSON(nodeId),
                    clusterId: cluster.id,
                },
            };
        } else {
            if (stateObj.common.min !== min) {
                changed = true;
                stateObj.common.min = min;
            }
            if (stateObj.common.max !== max) {
                changed = true;
                stateObj.common.max = max;
            }
        }
        if (changed) {
            await this.adapter.setObjectAsync(stateObj._id, stateObj);
        }

        const state = await this.adapter.getStateAsync(id);

        // init state
        let level = await cluster.getCurrentLevelAttribute();
        if (!state || state.val !== level) {
            await this.adapter.setStateAsync(id, level, true);
        }

        this.handler = async (value: number | null) => {
            await this.adapter.setStateAsync(id, value, true);
        };

        // subscribe on matter changes
        cluster.addCurrentLevelAttributeListener(this.handler);

        const levelHandler = async (state: ioBroker.State) => {
            if (!state || state.ack) {
                return;
            }
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
                }
            });
        };
        await this.subscribe(id, levelHandler);
    }

    async destroy() {
        await super.destroy();
        const cluster = this.endpoint.getClusterClient(LevelControlCluster);
        if (cluster) {
            // cluster.removeLevelControlAttributeListener(this.handler);
        }
    }

    static async factory(adapter: MatterAdapter, nodeId: NodeId, endpoint: Endpoint): Promise<Base | undefined> {
        const cluster = endpoint.getClusterClient(LevelControlCluster);
        if (!cluster) {
            return;
        }
        const result = new LevelControl(adapter, endpoint);
        if (result) {
            await result.init(nodeId);
        }
        return result;
    }
}

export default LevelControl;