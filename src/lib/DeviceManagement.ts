import { MatterAdapter } from '../main';

import { DeviceManagement, DeviceInfo, RetVal, DeviceStatus } from '@jey-cee/dm-utils';


class MatterAdapterDeviceManagement extends DeviceManagement<MatterAdapter> {
    // contents see in the next chapters
    // todo!!: this function must be async
    // @ts-ignore
    async listDevices(): Promise<RetVal<DeviceInfo[]>> {
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
        return arrDevices;
    }
}

export default MatterAdapterDeviceManagement;
