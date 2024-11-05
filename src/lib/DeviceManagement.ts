import { MatterAdapter } from '../main';

import {
    ActionContext,
    ControlState,
    DeviceDetails,
    DeviceInfo,
    DeviceManagement,
    DeviceRefresh,
    DeviceStatus,
    ErrorResponse,
} from '@iobroker/dm-utils';
import { GeneralMatterNode } from '../matter/GeneralMatterNode';
import { GenericDeviceToIoBroker } from '../matter/to-iobroker/GenericDeviceToIoBroker';
import { getText, t } from './i18n';

const demoDevice = {
    id: 'my ID',
    name: 'My Name',
};

class MatterAdapterDeviceManagement extends DeviceManagement<MatterAdapter> {
    #adapter: MatterAdapter;
    #demoState: ioBroker.State | null | undefined;

    constructor(adapter: MatterAdapter) {
        super(adapter);
        this.#adapter = adapter;
    }

    // contents see in the next chapters
    async listDevices(): Promise<DeviceInfo[]> {
        if (!this.#demoState) {
            this.#demoState = await this.adapter.getForeignStateAsync('javascript.0.RGB.on');
        }

        if (!this.#adapter.controllerNode) {
            return []; // TODO How to return that no controller is started?
        }

        const nodes = this.#adapter.controllerNode.nodes;

        const arrDevices: DeviceInfo[] = [];
        for (const ioNode of nodes.values()) {
            const devices = this.#getNodeEntry(ioNode);
            arrDevices.push(...devices);
        }

        arrDevices.push({
            id: demoDevice.id,
            name: demoDevice.name,
            // icon: devices[i].common.icon ? devices[i].common.icon : null,
            manufacturer: 'ioBroker',
            model: 'Model Demo',
            status: 'connected',
            hasDetails: true,
            actions: [
                {
                    id: 'delete',
                    icon: '',
                    description: t('Delete this device'),
                    handler: this.handleDeleteDevice.bind(this),
                },
                {
                    id: 'rename',
                    icon: '',
                    description: t('Rename this device'),
                    handler: this.handleRenameDevice.bind(this),
                },
            ],
            controls: [
                {
                    type: 'icon',
                    state: this.#demoState || undefined,
                    stateId: 'javascript.0.RGB.on',
                    id: 'light',
                    handler: this.handleControlDevice.bind(this),
                    getStateHandler: this.handleGetControlState.bind(this),
                    colorOn: '#cbbc0e',
                },
            ],
        });

        return arrDevices;
    }

    /**
     * Create the "Node" device entry and also add all Endpoint-"Devices" for Device-Manager
     */
    #getNodeEntry(ioNode: GeneralMatterNode): DeviceInfo[] {
        const status: DeviceStatus = ioNode.node.isConnected ? 'connected' : 'disconnected';

        const res = new Array<DeviceInfo>();
        res.push({
            id: ioNode.nodeBaseId,
            name: `Node ${ioNode.nodeId}`,
            icon: undefined, // TODO
            manufacturer: undefined, // TODO
            model: undefined, // TODO
            status,
            hasDetails: true,
            actions: [
                {
                    id: 'delete',
                    icon: 'fa-solid fa-trash-can',
                    description: t('Delete this device'),
                    handler: this.handleDeleteDevice.bind(this),
                },
                {
                    id: 'rename',
                    icon: 'fa-solid fa-pen',
                    description: t('Rename this device'),
                    handler: this.handleRenameDevice.bind(this),
                },
                {
                    id: 'pairingCode',
                    icon: 'fa-solid fa-qrcode',
                    description: t('Generate new pairing code'),
                    handler: this.handlePairingCode.bind(this),
                },
            ],
        });

        for (const device of ioNode.devices.values()) {
            const deviceInfo = this.#getNodeDeviceEntries(device, status);
            res.push(deviceInfo);
        }

        return res;
    }

    /**
     * Create one Endpoint-"Device" for Device-Manager
     */
    #getNodeDeviceEntries(device: GenericDeviceToIoBroker, status: DeviceStatus): DeviceInfo {
        return {
            id: device.baseId,
            name: `Device ${device.name}`,
            icon: undefined, // TODO
            manufacturer: undefined, // TODO
            model: undefined, // TODO
            status, // TODO
            hasDetails: true,
            actions: [
                {
                    id: 'rename',
                    icon: 'fa-solid fa-pen',
                    description: t('Rename this device'),
                    handler: this.handleRenameDevice.bind(this),
                },
            ],
        };
    }

    async handleControlDevice(
        _deviceId: string,
        _actionId: string,
        state: ControlState,
        _context: ActionContext,
    ): Promise<ErrorResponse | ioBroker.State> {
        if (this.#demoState) {
            this.#demoState.val = state as boolean;
            this.#demoState.ts = Date.now();
            await this.adapter.setForeignStateAsync('javascript.0.RGB.on', this.#demoState);

            return this.#demoState;
        }
        return { error: { code: 404, message: 'State not found' } };
    }

    async handleGetControlState(
        _deviceId: string,
        _actionId: string,
        _context: ActionContext,
    ): Promise<ErrorResponse | ioBroker.State> {
        if (this.#demoState) {
            return this.#demoState;
        }
        return { error: { code: 404, message: 'State not found' } };
    }

    /**
     * Handle new pairing code request
     */
    handlePairingCode(): Promise<{ refresh: DeviceRefresh }> {
        // TODO: return form as soon as QR code implemented
        return Promise.resolve({ refresh: false });
    }

    async handleRenameDevice(id: string, context: ActionContext): Promise<{ refresh: DeviceRefresh }> {
        this.adapter.log.info(`Rename device ${id}`);
        const devices = await this.adapter.getDevicesAsync();
        const device = devices.find(dev => dev._id === id);
        if (device || id === demoDevice.id) {
            const result = await context.showForm(
                {
                    type: 'panel',
                    items: {
                        name: {
                            type: 'text',
                            label: t('Name'),
                            sm: 12,
                        },
                    },
                },
                {
                    data: {
                        name:
                            id === demoDevice.id
                                ? 'My Name'
                                : getText(device?.common.name || '', this.adapter.sysLanguage),
                    },
                    title: t('Rename device'),
                },
            );

            if (result?.name !== undefined) {
                if (id === demoDevice.id) {
                    demoDevice.name = result.name;
                } else {
                    const obj = await this.adapter.getForeignObjectAsync(id);
                    if (obj) {
                        obj.common.name = result.name;
                        await this.adapter.setForeignObjectAsync(id, obj);
                    }
                }
                return { refresh: 'device' };
            }
        } else {
            await context.showMessage(t('Device not found'));
        }
        return { refresh: false };
    }

    async handleDeleteDevice(id: string, context: ActionContext): Promise<{ refresh: DeviceRefresh }> {
        this.adapter.log.info(`Delete device ${id}`);
        if (!(await context.showConfirmation(t('Are you sure?')))) {
            return { refresh: false };
        }

        await this.adapter.delForeignObjectAsync(id);
        return { refresh: true };
    }

    async getDeviceDetails(id: string): Promise<DeviceDetails | null | { error: string }> {
        this.adapter.log.info(`Get device details ${id}`);

        const obj = await this.adapter.getForeignObjectAsync(id);

        return {
            id,
            schema: {
                type: 'panel',
                items: {
                    name: {
                        type: 'text',
                        label: 'Name',
                        sm: 12,
                        disabled: 'true',
                    },
                },
                style: {
                    minWidth: 200,
                },
            },
            data: {
                name: obj?.common.name,
            },
        };
    }

    async close(): Promise<void> {
        // do nothing
    }
}

export default MatterAdapterDeviceManagement;
