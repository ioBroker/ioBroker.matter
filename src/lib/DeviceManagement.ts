import { MatterAdapter } from '../main';

import {
    DeviceManagement,
    DeviceInfo,
    DeviceStatus,
    ActionContext,
    DeviceDetails,
    DeviceRefresh, ErrorResponse,
} from '@iobroker/dm-utils';
import {ControlState} from "@iobroker/dm-utils/build/types/base";


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

            // const manufacturer = await this.adapter.getStateAsync(`${devices[i]._id}._info.brand`);
            //
            // const product = await this.adapter.getStateAsync(`${devices[i]._id}._info.product`);
            // const arch = await this.adapter.getStateAsync(`${devices[i]._id}._info.arch`);
            // const model = `${product?.val} ${arch?.val}`;

            const res: DeviceInfo = {
                id: devices[i]._id,
                name: devices[i].common.name,
                // icon: devices[i].common.icon ? devices[i].common.icon : null,
                // manufacturer: manufacturer ? manufacturer.val : null,
                // model: model ? model : null,
                status,
                hasDetails: true,
                actions: [
                /*    {
                        id: 'delete',
                        icon: 'fa-solid fa-trash-can',
                        description: {
                            en: 'Delete this device',
                            de: 'Gerät löschen',
                            ru: 'Удалить это устройство',
                            pt: 'Excluir este dispositivo',
                            nl: 'Verwijder dit apparaat',
                            fr: 'Supprimer cet appareil',
                            it: 'Elimina questo dispositivo',
                            es: 'Eliminar este dispositivo',
                            pl: 'Usuń to urządzenie',
                            'zh-cn': '删除此设备',
                            uk: 'Видалити цей пристрій'
                        },
                        handler: this.handleDeleteDevice.bind(this)
                    },
                    {
                        id: 'rename',
                        icon: 'fa-solid fa-pen',
                        description: {
                            en: 'Rename this device',
                            de: 'Gerät umbenennen',
                            ru: 'Переименовать это устройство',
                            pt: 'Renomear este dispositivo',
                            nl: 'Hernoem dit apparaat',
                            fr: 'Renommer cet appareil',
                            it: 'Rinomina questo dispositivo',
                            es: 'Renombrar este dispositivo',
                            pl: 'Zmień nazwę tego urządzenia',
                            'zh-cn': '重命名此设备',
                            uk: 'Перейменуйте цей пристрій'
                        },
                        handler: this.handleRenameDevice.bind(this)
                    }*/
                ]
            };
            // if id contains gateway remove res.actions
            if (devices[i]._id.includes('localhost')) {
                res.actions = [];
            }
            arrDevices.push(res);
        }

        arrDevices.push({
            id: 'My Id',
            name: 'My Name',
            // icon: devices[i].common.icon ? devices[i].common.icon : null,
            // manufacturer: manufacturer ? manufacturer.val : null,
            // model: model ? model : null,
            status: 'connected',
            hasDetails: true,
            actions: [
                {
                    id: 'delete',
                    icon: '',
                    description: {
                        en: 'Delete this device',
                        de: 'Gerät löschen',
                        ru: 'Удалить это устройство',
                        pt: 'Excluir este dispositivo',
                        nl: 'Verwijder dit apparaat',
                        fr: 'Supprimer cet appareil',
                        it: 'Elimina questo dispositivo',
                        es: 'Eliminar este dispositivo',
                        pl: 'Usuń to urządzenie',
                        'zh-cn': '删除此设备',
                        // uk: 'Видалити цей пристрій'
                    },
                    handler: this.handleDeleteDevice.bind(this)
                },
                {
                    id: 'rename',
                    icon: '',
                    description: {
                        en: 'Rename this device',
                        de: 'Gerät umbenennen',
                        ru: 'Переименовать это устройство',
                        pt: 'Renomear este dispositivo',
                        nl: 'Hernoem dit apparaat',
                        fr: 'Renommer cet appareil',
                        it: 'Rinomina questo dispositivo',
                        es: 'Renombrar este dispositivo',
                        pl: 'Zmień nazwę tego urządzenia',
                        'zh-cn': '重命名此设备',
                        // uk: 'Перейменуйте цей пристрій'
                    },
                    handler: this.handleRenameDevice.bind(this),
                }
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
                }
            ]
        });

        return arrDevices;
    }

    async handleControlDevice(deviceId: string, actionId: string, state: ControlState, context: ActionContext): Promise<ErrorResponse | ioBroker.State> {
        if (this.demoState) {
            this.demoState.val = state as boolean;
            this.demoState.ts = Date.now();
            await this.adapter.setForeignStateAsync('javascript.0.RGB.on', this.demoState);

            return this.demoState;
        }
        return { error: { code: 404, message: 'State not found' } };
    }

    async handleGetControlState(deviceId: string, actionId: string, context: ActionContext): Promise<ErrorResponse | ioBroker.State> {
        if (this.demoState) {
            return this.demoState;
        }
        return { error: { code: 404, message: 'State not found' } };
    }

    async handleRenameDevice(id: string, context: ActionContext): Promise<{ refresh: DeviceRefresh }> {
        this.adapter.log.info(`Rename device ${id}: ${JSON.stringify(context)}`);
        return { refresh: 'device' };
    }

    async handleDeleteDevice(id: string): Promise<{ refresh: DeviceRefresh }> {
        this.adapter.log.info(`Delete device ${id}`);
        return { refresh: 'instance' };
    }

    async getDeviceDetails(id: string): Promise<DeviceDetails | null | {error: string}> {
        this.adapter.log.info(`Get device details ${id}`);
        return {
            id,
            schema: {
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
}

export default MatterAdapterDeviceManagement;
