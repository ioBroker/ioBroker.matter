import { MatterAdapter } from '../main';

import {
    DeviceManagement,
    DeviceInfo,
    DeviceStatus,
    ActionContext,
    DeviceDetails,
    DeviceRefresh, ErrorResponse,
} from '@iobroker/dm-utils';
import { ControlState } from '@iobroker/dm-utils/build/types/base';
import { t, getText } from './i18n';

const demoDevice = {
    id: 'my ID',
    name: 'My Name',
}

class MatterAdapterDeviceManagement extends DeviceManagement<MatterAdapter> {
    private demoState: ioBroker.State | null | undefined;

    // contents see in the next chapters
    async listDevices(): Promise<DeviceInfo[]> {
        if (!this.demoState) {
            this.demoState = await this.adapter.getForeignStateAsync('javascript.0.RGB.on');
        }

        const devices = await this.adapter.getDevicesAsync();
        // const devices = await this.adapter.getObjectView('system', 'device', { startkey: `system.adapter.matter.${this.instance}.`, endkey: 'system.adapter.matter.999' });
        const arrDevices: DeviceInfo[] = [];
        for (const i in devices) {
            let status: DeviceStatus = 'disconnected';

            const alive = await this.adapter.getStateAsync(`${devices[i]._id}.info.connection`);
            if (alive !== null && alive !== undefined) {
                status = alive.val ? 'connected' : 'disconnected';
            }

            const manufacturer = await this.adapter.getStateAsync(`${devices[i]._id}._info.brand`);
            const product = await this.adapter.getStateAsync(`${devices[i]._id}._info.product`);
            const arch = await this.adapter.getStateAsync(`${devices[i]._id}._info.arch`);
            const model = `${product?.val} ${arch?.val}`;

            const res: DeviceInfo = {
                id: devices[i]._id,
                name: devices[i].common.name,
                icon: devices[i].common.icon || undefined,
                manufacturer: manufacturer?.val as string || undefined,
                model: model || undefined,
                status,
                hasDetails: true,
                actions: [
                    // @ts-expect-error fixed in dm-utils
                    {
                        id: 'delete',
                        icon: 'fa-solid fa-trash-can',
                        description: t('Delete this device'),
                        handler: this.handleDeleteDevice.bind(this),
                        confirmation: t('Are you sure?'),
                    },
                    // @ts-expect-error fixed in dm-utils
                    {
                        id: 'rename',
                        icon: 'fa-solid fa-pen',
                        description: t('Rename this device'),
                        handler: this.handleRenameDevice.bind(this),
                        inputBefore: {
                            label: t('Name'),
                            type: 'text',
                            allowEmptyValue: false,
                        },
                    }
                ]
            };
            // if id contains gateway remove res.actions
            if (devices[i]._id.includes('localhost')) {
                res.actions = [];
            }
            arrDevices.push(res);
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
                // @ts-expect-error fixed in dm-utils
                {
                    id: 'delete',
                    icon: '',
                    description: t('Delete this device'),
                    handler: this.handleDeleteDevice.bind(this),
                    confirmation: t('Are you sure?'),
                },
                // @ts-expect-error fixed in dm-utils
                {
                    id: 'rename',
                    icon: '',
                    description: t('Rename this device'),
                    handler: this.handleRenameDevice.bind(this),
                    inputBefore: {
                        label: t('Name'),
                        type: 'text',
                        allowEmptyValue: false,
                    },
                },
            ],
            controls: [
                {
                    type: 'icon',
                    state: this.demoState || undefined,
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

    async handleControlDevice(
        deviceId: string,
        actionId: string,
        state: ControlState,
        context: ActionContext,
    ): Promise<ErrorResponse | ioBroker.State> {
        if (this.demoState) {
            this.demoState.val = state as boolean;
            this.demoState.ts = Date.now();
            await this.adapter.setForeignStateAsync('javascript.0.RGB.on', this.demoState);

            return this.demoState;
        }
        return { error: { code: 404, message: 'State not found' } };
    }

    async handleGetControlState(
        deviceId: string,
        actionId: string,
        context: ActionContext,
    ): Promise<ErrorResponse | ioBroker.State> {
        if (this.demoState) {
            return this.demoState;
        }
        return { error: { code: 404, message: 'State not found' } };
    }

    async handleRenameDevice(id: string, context: ActionContext): Promise<{ refresh: DeviceRefresh }> {
        this.adapter.log.info(`Rename device ${id}`);
        const devices = await this.adapter.getDevicesAsync();
        const device = devices.find((dev) => dev._id === id);
        if (device || id === demoDevice.id) {
            const result = await context.showForm({
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
                    name: id === demoDevice.id ? 'My Name' : getText(device?.common.name || '', this.adapter.sysLanguage),
                },
                title: t('Rename device')
            });

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
        if (await context.showConfirmation(t('Are you sure?'))) {

            return { refresh: 'instance' };
        }

        return { refresh: false };
    }

    async getDeviceDetails(id: string): Promise<DeviceDetails | null | {error: string}> {
        this.adapter.log.info(`Get device details ${id}`);
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
                name: 'My Name',
            },
        };
    }

    async close(): Promise<void> {
        // do nothing
    }
}

export default MatterAdapterDeviceManagement;
