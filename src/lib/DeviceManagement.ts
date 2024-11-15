import type { MatterAdapter } from '../main';

import {
    type ActionContext,
    type ApiVersion,
    type ConfigItemAny,
    type DeviceDetails,
    type DeviceInfo,
    DeviceManagement,
    type DeviceRefresh,
    type DeviceStatus,
    type InstanceDetails,
} from '@iobroker/dm-utils';
import type { GeneralMatterNode, NodeDetails } from '../matter/GeneralMatterNode';
import type { GenericDeviceToIoBroker } from '../matter/to-iobroker/GenericDeviceToIoBroker';
import { getText, t } from './i18n';
import { decamelize } from './utils';

function strToBool(str: string): boolean | null {
    if (str === 'true') {
        return true;
    }
    if (str === 'false') {
        return false;
    }
    return null;
}

class MatterAdapterDeviceManagement extends DeviceManagement<MatterAdapter> {
    #adapter: MatterAdapter;

    constructor(adapter: MatterAdapter) {
        super(adapter);
        this.#adapter = adapter;
    }

    async getInstanceInfo(): Promise<InstanceDetails> {
        return {
            ...(await super.getInstanceInfo()),
            apiVersion: 'v1' as ApiVersion,
            actions: [
                /*{
                    id: 'newDevice',
                    icon: 'fas fa-plus',
                    title: '',
                    description: {
                        en: 'Add new device to Zigbee',
                        de: 'Neues Gerät zu Zigbee hinzufügen',
                        ru: 'Добавить новое устройство в Zigbee',
                        pt: 'Adicionar novo dispositivo ao Zigbee',
                        nl: 'Voeg nieuw apparaat toe aan Zigbee',
                        fr: 'Ajouter un nouvel appareil à Zigbee',
                        it: 'Aggiungi nuovo dispositivo a Zigbee',
                        es: 'Agregar nuevo dispositivo a Zigbee',
                        pl: 'Dodaj nowe urządzenie do Zigbee',

                        uk: 'Додати новий пристрій до Zigbee',
                    },
                    handler: this.handleNewDevice.bind(this),
                },*/
            ],
        };
    }

    // contents see in the next chapters
    listDevices(): Promise<DeviceInfo[]> {
        if (!this.#adapter.controllerNode) {
            return Promise.resolve([]); // TODO How to return that no controller is started?
        }

        const nodes = this.#adapter.controllerNode.nodes;

        const arrDevices: DeviceInfo[] = [];
        for (const ioNode of nodes.values()) {
            const devices = this.#getNodeEntry(ioNode);
            arrDevices.push(...devices);
        }

        /*arrDevices.push({
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
                    handler: this.#handleRenameDevice.bind(this),
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
        });*/

        return Promise.resolve(arrDevices);
    }

    /**
     * Create the "Node" device entry and also add all Endpoint-"Devices" for Device-Manager
     */
    #getNodeEntry(ioNode: GeneralMatterNode): DeviceInfo[] {
        const status: DeviceStatus = ioNode.node.isConnected ? 'connected' : 'disconnected';
        const id = ioNode.nodeId;
        const details = ioNode.details;

        const res = new Array<DeviceInfo>();
        res.push({
            id,
            name: `Node ${ioNode.nodeId}`,
            icon: undefined, // TODO
            ...details,
            status,
            hasDetails: true,
            actions: [
                {
                    id: 'deleteNode',
                    icon: 'fa-solid fa-trash-can',
                    description: t('Unpair this node'),
                    handler: (id, context) => this.#handleDeleteNode(ioNode, context),
                },
                {
                    id: 'renameNode',
                    icon: 'fa-solid fa-pen',
                    description: t('Rename this node'),
                    handler: (id, context) => this.#handleRenameNode(ioNode, context),
                },
                {
                    id: 'pairingCodeNode',
                    icon: 'fa-solid fa-qrcode',
                    description: t('Generate new pairing code'),
                    handler: (id, context) => this.#handlePairingCode(ioNode, context),
                },
                {
                    id: 'configureNode',
                    icon: 'fa-solid fa-gear', // Why icon does not work??
                    description: t('Configure this node'),
                    handler: (id, context) => this.#handleConfigureNode(ioNode, context),
                },
            ],
        });

        for (const device of ioNode.devices.values()) {
            const deviceInfo = this.#getNodeDeviceEntries(device, id, details, status);
            res.push(deviceInfo);
        }

        return res;
    }

    /**
     * Create one Endpoint-"Device" for Device-Manager
     */
    #getNodeDeviceEntries(
        device: GenericDeviceToIoBroker,
        nodeId: string,
        nodeDetails: NodeDetails,
        status: DeviceStatus,
    ): DeviceInfo {
        const data: DeviceInfo = {
            id: `${nodeId}-${device.number}`,
            name: `Device ${device.name}`,
            icon: undefined, // TODO
            ...nodeDetails,
            status,
            hasDetails: true,
            actions: [
                {
                    id: 'renameDevice',
                    icon: 'fa-solid fa-pen',
                    description: t('Rename this device'),
                    handler: (id, context) => this.#handleRenameDevice(device, context),
                },
                {
                    id: 'configureDevice',
                    icon: 'fa-solid fa-gear',
                    description: t('Configure this device'),
                    handler: (id, context) => this.#handleConfigureDevice(device, context),
                },
            ],
        };

        if (device.hasIdentify()) {
            data.actions!.push({
                id: 'identify',
                icon: 'fa-solid fa-search-location',
                description: t('Identify this device'),
                handler: (id, context) => this.#handleIdentifyDevice(device, context),
            });
        }

        return data;
    }

    async #handleDeleteNode(node: GeneralMatterNode, context: ActionContext): Promise<{ refresh: DeviceRefresh }> {
        this.adapter.log.info(`Delete node ${node.nodeId}`);
        if (!(await context.showConfirmation(t('Are you sure?')))) {
            return { refresh: false };
        }

        if (!node.node.isConnected) {
            if (
                !(await context.showConfirmation(
                    t(
                        'The node is currently not connected. When you unpair it now you need to factory reset the node to commission again. Are you sure?',
                    ),
                ))
            ) {
                return { refresh: false };
            }
        }

        await this.adapter.controllerNode?.decommissionNode(node.nodeId);
        return { refresh: true };
    }

    async #handleRenameNode(node: GeneralMatterNode, context: ActionContext): Promise<{ refresh: DeviceRefresh }> {
        this.adapter.log.info(`Rename node ${node.nodeId}`);
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
                style: {
                    minWidth: 200,
                },
            },
            {
                data: {
                    name: getText(node.nodeId, this.adapter.sysLanguage),
                },
                title: t('Rename node'),
            },
        );

        if (result?.name !== undefined) {
            await node.rename(result.name);
            return { refresh: true };
        }
        return { refresh: false };
    }

    /**
     * Handle new pairing code request
     */
    async #handlePairingCode(node: GeneralMatterNode, context: ActionContext): Promise<{ refresh: DeviceRefresh }> {
        const result = await this.adapter.controllerNode?.showNewCommissioningCode(node.node.nodeId);

        this.adapter.log.info(`New pairing code for node ${node.nodeId}: ${JSON.stringify(result)}`);

        // TODO Display it in the UI, ideally as QRCode ... How to return??
        void context.showMessage(
            `Use the following pairing code to commission the device: ${result?.manualPairingCode}`,
        );

        return Promise.resolve({ refresh: false });
    }

    async #handleConfigureNodeOrDevice(
        title: string,
        baseId: string,
        context: ActionContext,
    ): Promise<{ refresh: DeviceRefresh }> {
        const obj = await this.adapter.getObjectAsync(baseId);

        const result = await context.showForm(
            {
                type: 'panel',
                items: {
                    exposeMatterApplicationClusterData: {
                        type: 'select',
                        label: t('Expose Matter Application Cluster Data'),
                        options: [
                            { label: 'Yes', value: 'true' },
                            { label: 'No', value: 'false' },
                            { label: 'Default', value: '' },
                        ],
                        sm: 12,
                    },
                    exposeMatterSystemClusterData: {
                        type: 'select',
                        label: t('Expose Matter System Cluster Data'),
                        options: [
                            { label: 'Yes', value: 'true' },
                            { label: 'No', value: 'false' },
                            { label: 'Default', value: '' },
                        ],
                        sm: 12,
                    },
                },
                style: {
                    minWidth: 200,
                },
            },
            {
                data: {
                    exposeMatterApplicationClusterData:
                        typeof obj?.native.exposeMatterApplicationClusterData !== 'boolean'
                            ? ''
                            : obj?.native.exposeMatterApplicationClusterData
                              ? 'true'
                              : 'false',
                    exposeMatterSystemClusterData:
                        typeof obj?.native.exposeMatterSystemClusterData !== 'boolean'
                            ? ''
                            : obj?.native.exposeMatterSystemClusterData
                              ? 'true'
                              : 'false',
                },
                title: t(title),
            },
        );

        if (
            result?.exposeMatterApplicationClusterData !== undefined &&
            result?.exposeMatterSystemClusterData !== undefined
        ) {
            await this.adapter.extendObjectAsync(baseId, {
                native: {
                    exposeMatterApplicationClusterData: strToBool(result.exposeMatterApplicationClusterData),
                    exposeMatterSystemClusterData: strToBool(result.exposeMatterSystemClusterData),
                },
            });
        }
        return { refresh: false };
    }

    async #handleConfigureNode(node: GeneralMatterNode, context: ActionContext): Promise<{ refresh: DeviceRefresh }> {
        this.adapter.log.info(`Configure node ${node.nodeId}`);

        return await this.#handleConfigureNodeOrDevice('Configure node', node.nodeBaseId, context);
    }

    async #handleConfigureDevice(
        device: GenericDeviceToIoBroker,
        context: ActionContext,
    ): Promise<{ refresh: DeviceRefresh }> {
        this.adapter.log.info(`Configure device ${device.name}`);

        return await this.#handleConfigureNodeOrDevice('Configure device', device.baseId, context);
    }

    async #handleIdentifyDevice(
        device: GenericDeviceToIoBroker,
        context: ActionContext,
    ): Promise<{ refresh: DeviceRefresh }> {
        await device.identify();

        await context.showMessage(`The device should now identify itself for 30 seconds.`);

        return { refresh: false };
    }

    /*async handleControlDevice(
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
    }*/

    async #handleRenameDevice(
        device: GenericDeviceToIoBroker,
        context: ActionContext,
    ): Promise<{ refresh: DeviceRefresh }> {
        this.adapter.log.info(`Rename device ${device.name}`);
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
                style: {
                    minWidth: 200,
                },
            },
            {
                data: {
                    name: getText(device.name || '', this.adapter.sysLanguage),
                },
                title: t('Rename device'),
            },
        );

        if (result?.name !== undefined) {
            await device.rename(result.name);
            return { refresh: 'device' };
        }
        return { refresh: false };
    }

    async getDeviceDetails(id: string): Promise<DeviceDetails | null | { error: string }> {
        this.adapter.log.info(`Get details ${id}`);

        const idParts = id.split('-');
        const nodeId = idParts[0];
        const endpointId = idParts[1] !== undefined ? parseInt(idParts[1], 10) : undefined;

        const node = this.#adapter.controllerNode?.nodes.get(nodeId);

        if (!node) {
            return { error: 'Node not found' };
        }

        if (endpointId === undefined) {
            // Get Node details
            const { schema, data } = this.#convertDataToJsonConfig(await node.getNodeDetails());
            // @ts-expect-error TODO: Fix typings
            return { id, schema, data };
        }

        // Get Endpoint details
        const device = node.devices.get(endpointId);
        if (!device) {
            return { error: 'Device not found' };
        }

        const { schema, data } = this.#convertDataToJsonConfig(await device.getDeviceDetails());

        // @ts-expect-error TODO: Fix typings
        return { id, schema, data };
    }

    async close(): Promise<void> {
        // do nothing
    }

    /**
     * Convert a generic object data model into JSON Config data forms
     * Keys are expected to be camelized strings and will be used as field name too  in de-camelized form
     * If needed for uniqueness "__" can be used as splitter and anything after this is used as field name
     * "__header__*" entries are converted into a headline with the value as text
     * "__divider__*" entries are converted into a divider
     * The logic expects a two level object structure. By default, it returns a tabs structure. If only one key is used on first level only one panel is returned
     */
    #convertDataToJsonConfig(data: Record<string, Record<string, unknown>>): {
        schema: ConfigItemAny;
        data: Record<string, unknown>;
    } {
        const items: Record<string, ConfigItemAny> = {};
        const flatData: Record<string, unknown> = {};

        let panelCount = 0;
        for (const key in data) {
            panelCount++;
            const tabItems: Record<string, ConfigItemAny> = {};

            for (const subKey in data[key]) {
                const flatKey = `${key}_${subKey}`;
                if (subKey.startsWith('__header__')) {
                    tabItems[flatKey] = {
                        type: 'header',
                        text: String(data[key][subKey]),
                    };
                    continue;
                }
                if (subKey.startsWith('__divider__')) {
                    tabItems[flatKey] = {
                        type: 'divider',
                    };
                    continue;
                }

                const dataType = typeof data[key][subKey];
                const subKeyShortenerIndex = subKey.indexOf('__');
                const subKeyLabel = decamelize(
                    subKeyShortenerIndex !== -1 ? subKey.substring(subKeyShortenerIndex + 2) : subKey,
                );
                switch (dataType) {
                    case 'boolean':
                        tabItems[flatKey] = {
                            type: 'checkbox',
                            label: subKeyLabel,
                            disabled: 'true',
                            newLine: true,
                        };
                        break;
                    case 'number':
                        tabItems[flatKey] = {
                            type: 'number',
                            label: subKeyLabel,
                            disabled: 'true',
                            newLine: true,
                        };
                        break;
                    default:
                        tabItems[flatKey] = {
                            type: 'text',
                            label: subKeyLabel,
                            disabled: 'true',
                            newLine: true,
                        };
                }

                flatData[flatKey] = data[key][subKey];
            }

            items[`_tab_${key}`] = {
                type: 'panel',
                label: decamelize(key),
                items: tabItems,
                style: {
                    minWidth: 200,
                },
            };
        }

        if (panelCount === 1) {
            return {
                schema: items[`_tab_${Object.keys(data)[0]}`],
                data: flatData,
            };
        }

        return {
            schema: {
                type: 'tabs',
                items,
            } as ConfigItemAny,
            data: flatData,
        };
    }
}

export default MatterAdapterDeviceManagement;
