import type { MatterAdapter } from '../main';
import type {
    ActionContext,
    ConfigItemAny,
    DeviceDetails,
    DeviceInfo,
    DeviceRefresh,
    DeviceStatus,
    InstanceDetails,
    JsonFormSchema,
    JsonFormData,
    ConfigConnectionType,
    DeviceLoadContext,
    StatusIndicator,
} from '@iobroker/dm-utils';
import { DeviceManagement, ACTIONS } from '@iobroker/dm-utils';
import { GeneralMatterNode, type NodeDetails } from '../matter/GeneralMatterNode';
import { GenericDeviceToIoBroker } from '../matter/to-iobroker/GenericDeviceToIoBroker';
import type { DeviceAction } from '@iobroker/dm-utils/build/types/base';
import { inspect } from 'util';
import { convertDataToJsonConfig } from './JsonConfigUtils';
import { logControllerEndpoint } from '../matter/ControllerEndpointStructureInspector';
import { SpecificationVersion } from '@matter/main/types';
import { CommissioningClient, isObject } from '@matter/main';
import { PeerAddress } from '@matter/main/protocol';
import { ICD_LIT_ICON } from './icons';
import { formatDuration, wakeInstruction } from '../matter/icdUtils';
import { IcdMultiAdminConflictError, type NodeIcdManager } from '../matter/NodeIcdManager';
import { VendorIds } from './vendorIDs';
import { toUpperCaseHex } from './utils';

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
        const actions = [];
        if (this.#adapter.controllerNode?.nodes.size) {
            actions.push({
                id: 'checkNodeUpdates',
                icon: 'update',
                title: {
                    en: 'Check Updates',
                    de: 'Updates prüfen',
                    ru: 'Проверка обновлений',
                    pt: 'Verificar actualizações',
                    nl: 'Updates controleren',
                    fr: 'Vérifier les mises à jour',
                    it: 'Controllare gli aggiornamenti',
                    es: 'Comprobar actualizaciones',
                    pl: 'Sprawdź aktualizacje',
                    uk: 'Перевірте оновлення',
                    'zh-cn': 'Check Updates',
                },
                description: {
                    en: 'Check for Node updates',
                    de: 'Node-Updates prüfen',
                    ru: 'Проверьте наличие обновлений узла',
                    pt: 'Verificar se há actualizações do Node',
                    nl: 'Controleren op Node-updates',
                    fr: 'Vérifier les mises à jour de Node',
                    it: 'Verifica degli aggiornamenti dei nodi',
                    es: 'Buscar actualizaciones de nodos',
                    pl: 'Sprawdź aktualizacje węzła',
                    uk: 'Перевірте наявність оновлень вузла',
                    'zh-cn': 'Check for Node updates',
                },
                handler: this.checkNodeUpdates.bind(this),
                timeout: 30_000,
            });
        }
        return {
            ...(await super.getInstanceInfo()),
            apiVersion: 'v3',
            actions,
        };
    }

    // contents see in the next chapters
    listDevices(): DeviceInfo<string>[] {
        if (!this.#adapter.controllerNode) {
            return []; // TODO How to return that no controller is started?
        }

        const nodes = this.#adapter.controllerNode.nodes;

        const arrDevices: DeviceInfo<string>[] = [];
        let colorCounter = 0;
        for (const ioNode of nodes.values()) {
            const devices = this.#getNodeEntry(ioNode, colorCounter++ % 2 === 0 ? 'primary' : 'secondary');
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
                    description: this.#adapter.t('Delete this device'),
                    handler: this.handleDeleteDevice.bind(this),
                },
                {
                    id: 'rename',
                    icon: '',
                    description: this.#adapter.t('Rename this device'),
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

        return arrDevices;
    }

    loadDevices(context: DeviceLoadContext<string>): void {
        if (!this.#adapter.controllerNode) {
            context.setTotalDevices(0);
            return;
        }
        const nodes = this.#adapter.controllerNode.nodes;

        let colorCounter = 0;
        const allDevices: DeviceInfo<string>[] = [];
        for (const ioNode of nodes.values()) {
            const devices = this.#getNodeEntry(ioNode, colorCounter++ % 2 === 0 ? 'primary' : 'secondary');
            allDevices.push(...devices);
        }

        // Report the actual number of entries (node entry + its endpoint devices per node),
        // not nodes.size, otherwise totalDevices would be smaller than the number added.
        context.setTotalDevices(allDevices.length);
        for (const device of allDevices) {
            context.addDevice(device);
        }
    }

    /** Re-sends one node card so indicator tooltips and the conditional actions follow a changed ICD state. */
    async updateNodeCard(ioNode: GeneralMatterNode): Promise<void> {
        await this.sendCommandToGui({ command: 'infoUpdate', deviceId: ioNode.nodeId });
    }

    #getIcdIndicator(ioNode: GeneralMatterNode): StatusIndicator | undefined {
        const icd = ioNode.icd;
        if (icd === undefined || !icd.litCapable) {
            return undefined;
        }
        const idleDuration = icd.info?.idleModeDuration;
        const interval = idleDuration !== undefined ? formatDuration(idleDuration) : undefined;

        return {
            id: 'icd',
            value: { stateId: `${this.#adapter.namespace}.${ioNode.icdModeStateId}` },
            icon: ICD_LIT_ICON,
            hideIfEmpty: true,
            actionId: 'icdManagement',
            order: 50,
            label: this.#adapter.getText('Battery Saver Mode'),
            levels: [
                {
                    value: 'lit',
                    color: 'ok',
                    tooltip: interval
                        ? this.#adapter.getText('ICD tooltip battery saver active with interval', interval)
                        : this.#adapter.getText('ICD tooltip battery saver active'),
                },
                {
                    value: 'litOffline',
                    color: 'error',
                    tooltip: interval
                        ? this.#adapter.getText('ICD tooltip battery saver offline with interval', interval)
                        : this.#adapter.getText('ICD tooltip battery saver offline'),
                },
                {
                    value: 'pending',
                    color: 'info',
                    tooltip: this.#adapter.getText('ICD tooltip changing'),
                },
                {
                    value: 'sit',
                    color: 'inactive',
                    tooltip: this.#adapter.getText('ICD tooltip standard mode'),
                },
            ],
        };
    }

    /**
     * A sleeping LIT device may need a full idle interval to receive the command, plus delivery margin.
     * Floored at 5 minutes: a `dynamicSitLitSupport` device currently in SIT reports a short idle interval
     * even though this action is offered, but the budget still has to cover the form and its confirmations.
     */
    #icdActionTimeout(ioNode: GeneralMatterNode): number {
        return Math.max(((ioNode.icd?.info?.idleModeDuration ?? 60) + 30) * 1000, 300_000);
    }

    /**
     * Create the "Node" device entry and also add all Endpoint-"Devices" for Device-Manager
     */
    #getNodeEntry(ioNode: GeneralMatterNode, backgroundColor: 'primary' | 'secondary'): DeviceInfo<string>[] {
        const status: DeviceStatus = ioNode.getStatus();
        const isEnabled = ioNode.isEnabled;
        const isConnected = ioNode.isConnected;
        const id = ioNode.nodeId;
        const details = ioNode.details;

        let updateAvailableMessage: string | undefined = undefined;
        let version: string | undefined = undefined;
        let newVersion: string | undefined = undefined;
        if (ioNode.node.basicInformation) {
            version = `${ioNode.node.basicInformation.softwareVersionString} (${ioNode.node.basicInformation.softwareVersion})`;
        }
        if (ioNode.softwareUpdateAvailable !== undefined) {
            const info = ioNode.softwareUpdateAvailable;
            newVersion = `${info.softwareVersionString} (${info.softwareVersion})`;
            updateAvailableMessage = `${version} → ${newVersion})`;
        }

        let actions: (DeviceAction<'adapter'> | null)[] = [
            {
                // This is a special action when the user clicks on the status icon
                id: ACTIONS.STATUS,
                handler: (_id, context) => this.#handleOnStatusNode(ioNode, context),
                timeout: 20_000,
            },
            {
                // This is a special action when the user clicks on the enabled icon
                id: ACTIONS.ENABLE_DISABLE,
                handler: (_id, context) => this.#handleEnableOrDisableNode(ioNode, context),
            },
            {
                id: 'deleteNode',
                icon: 'delete',
                description: this.#adapter.getText('Unpair this node'),
                handler: (_id, context) => this.#handleDeleteNode(ioNode, context),
                timeout: 30_000,
            },
            {
                id: 'renameNode',
                icon: 'edit',
                description: this.#adapter.getText('Rename this node'),
                handler: (_id, context) => this.#handleRenameNode(ioNode, context),
            },
            // this command is not available if a device is offline
            isConnected
                ? {
                      id: 'pairingCodeNode',
                      icon: 'qrcode',
                      description: this.#adapter.getText('Generate new pairing code'),
                      handler: (_id, context) => this.#handlePairingCode(ioNode, context),
                      timeout: 20_000,
                  }
                : null,
            isConnected
                ? {
                      id: 'configureNode',
                      icon: 'settings',
                      description: this.#adapter.getText('Configure this node'),
                      handler: (_id, context) => this.#handleConfigureNode(ioNode, context),
                  }
                : null,
            {
                id: 'logNodeDebug',
                icon: 'lines',
                description: this.#adapter.getText('Output Debug details this node'),
                handler: (_id, context) => this.#handleLogDebugNode(ioNode, context),
            },
            // Show software update action if an update is available
            updateAvailableMessage
                ? {
                      id: ACTIONS.UPDATE,
                      icon: 'update',
                      description: updateAvailableMessage,
                      handler: (_id, context) => this.#handleSoftwareUpdateNode(ioNode, context),
                  }
                : null,
            ioNode.icd?.litCapable
                ? {
                      id: 'icdManagement',
                      icon: ICD_LIT_ICON,
                      description: this.#adapter.getText('Manage Battery Saver Mode'),
                      handler: (_id, context) => this.#handleIcdManagement(ioNode, context),
                      timeout: this.#icdActionTimeout(ioNode),
                  }
                : null,
        ];

        // remove null actions
        actions = actions?.filter(it => it) || [];

        const connectionType = ioNode.connectionType;
        const icdIndicator = this.#getIcdIndicator(ioNode);
        const res = new Array<DeviceInfo<string>>();
        const node: DeviceInfo<string> = {
            id,
            name: `Node ${ioNode.name}`,
            icon: undefined,
            ...details,
            status,
            enabled: isEnabled,
            connectionType,
            hasDetails: true,
            actions: actions.length ? (actions as DeviceAction<'adapter', string>[]) : undefined,
            indicators: icdIndicator ? [icdIndicator] : undefined,
            backgroundColor,
            color: '#FFFFFF',
            group: {
                key: 'node',
                name: this.#adapter.getText('Node'),
                icon: 'node',
            },
            update: {
                available: { stateId: `${this.#adapter.namespace}.${ioNode.updateAvailableStateId}` },
                version,
                newVersion,
            },
        };

        res.push(node);

        if (isEnabled) {
            let deviceCount = 0;
            for (const device of ioNode.devices.values()) {
                const deviceInfo = this.#getNodeDeviceEntries(
                    device,
                    id,
                    details,
                    isConnected,
                    connectionType,
                    backgroundColor,
                );
                res.push(deviceInfo);
                deviceCount++;
            }
            // define the icon depends on the number of sub-devices
            node.icon = ioNode.hasAggregatorEndpoint ? 'hub5' : deviceCount > 1 ? 'hub3' : 'node';
        } else {
            node.icon = 'node';
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
        nodeConnected: boolean,
        nodeConnectionType: ConfigConnectionType,
        backgroundColor: 'primary' | 'secondary',
    ): DeviceInfo<string> {
        const icon = device.iconDeviceType;
        const data: DeviceInfo<string> = {
            id: `${nodeId}-${device.number}`,
            name: device.name,
            icon,
            ...nodeDetails,
            backgroundColor,
            status: device.getStatus({
                connection: nodeConnected ? 'connected' : 'disconnected',
            }),
            connectionType: nodeConnectionType,
            hasDetails: true,
            actions: [
                {
                    id: 'renameDevice',
                    icon: 'rename',
                    description: this.#adapter.getText('Rename this device'),
                    handler: (id, context) => this.#handleRenameDevice(device, context),
                },
                {
                    id: 'configureDevice',
                    icon: 'settings',
                    description: this.#adapter.getText('Configure this device'),
                    handler: (id, context) => this.#handleConfigureDevice(device, context),
                },
            ],
            group: {
                key: `device/${device.deviceType}`,
                name: this.#adapter.getText(device.deviceType),
                icon,
            },
        };

        if (device.hasIdentify() && nodeConnected) {
            data.actions!.push({
                id: 'identify',
                icon: 'identify',
                description: this.#adapter.getText('Identify this device'),
                handler: (id, context) => this.#handleIdentifyDevice(device, context),
                timeout: 10_000,
            });
        }

        return data;
    }

    async #handleEnableOrDisableNode(
        node: GeneralMatterNode,
        context: ActionContext,
    ): Promise<{ refresh: DeviceRefresh }> {
        if (node.isEnabled) {
            if (
                !(await context.showConfirmation(
                    this.#adapter.t('Are you sure you want to disable and disconnect the node?'),
                ))
            ) {
                return { refresh: 'none' };
            }
        }
        await node.setEnabled(!node.isEnabled);

        if (node.isEnabled) {
            await context.showMessage(
                this.#adapter.t(
                    'Node got enabled and will be connected now. It might take a moment until the devices of this node are shown.',
                ),
            );
        }

        return { refresh: 'devices' };
    }

    async #handleOnStatusNode(node: GeneralMatterNode, context: ActionContext): Promise<{ refresh: DeviceRefresh }> {
        const schema = convertDataToJsonConfig(await node.getConnectionStatus());

        await context.showForm(schema, {
            data: {},
            maxWidth: 'md',
            title: this.#adapter.getText('Connection Status'),
            buttons: [
                {
                    type: 'cancel',
                    label: this.#adapter.getText('Close'),
                },
            ],
        });

        return { refresh: 'none' };
    }

    async #handleDeleteNode(node: GeneralMatterNode, context: ActionContext): Promise<{ refresh: DeviceRefresh }> {
        this.adapter.log.info(`Delete node ${node.nodeId}`);
        if (!(await context.showConfirmation(this.#adapter.t('Are you sure?')))) {
            return { refresh: 'none' };
        }

        if (!node.node.isConnected) {
            if (
                !(await context.showConfirmation(
                    this.#adapter.t(
                        'The node is currently not connected. When you unpair it now you need to factory reset the node to commission again. Are you sure?',
                    ),
                ))
            ) {
                return { refresh: 'none' };
            }
        }

        await this.#adapter.sendToGui({
            command: 'progress',
            progress: {
                title: this.#adapter.t('Unpairing node...'),
                indeterminate: true,
                value: 0,
            },
        });

        // Start an interval that normally covers 30 seconds, and with each update the number gets slower increased for the percentage
        let errorHappened = false;
        try {
            await node.remove();
        } catch (error) {
            const errorText = inspect(error, { depth: 10 });
            this.adapter.log.error(`Error during unpairing for node ${node.nodeId}: ${errorText}`);
            errorHappened = true;
        }

        await this.#adapter.sendToGui({
            command: 'progress',
            progress: {
                close: true,
            },
        });

        if (errorHappened) {
            await context.showMessage(this.#adapter.t('Error happened during unpairing. Please check the log.'));
        }
        return { refresh: 'devices' };
    }

    async #handleRenameNode(node: GeneralMatterNode, context: ActionContext): Promise<{ refresh: DeviceRefresh }> {
        const result = await context.showForm(
            {
                type: 'panel',
                items: {
                    name: {
                        type: 'text',
                        label: this.#adapter.getText('Name'),
                        allowEmpty: false,
                        sm: 12,
                    },
                },
                style: {
                    minWidth: 200,
                },
            },
            {
                data: {
                    name: node.name,
                },
                title: this.#adapter.getText('Rename node'),
            },
        );

        if (result?.name !== undefined && result.name !== node.name) {
            this.adapter.log.info(`Rename node ${node.nodeId} to "${result.name}"`);
            await node.rename(result.name);
            return { refresh: 'devices' };
        }
        return { refresh: 'none' };
    }

    /**
     * Handle new pairing code request
     */
    async #handlePairingCode(node: GeneralMatterNode, context: ActionContext): Promise<{ refresh: DeviceRefresh }> {
        const result = await this.adapter.controllerNode?.showNewCommissioningCode(node.node.nodeId);

        this.adapter.log.info(`New pairing code for node ${node.nodeId}: ${JSON.stringify(result)}`);

        if (result?.manualPairingCode || result?.qrPairingCode) {
            const schema: JsonFormSchema = {
                type: 'panel',
                label: this.#adapter.getText('Pairing Code'),
                noTranslation: true,
                items: {},
            };
            if (result.manualPairingCode) {
                schema.items._text = {
                    type: 'text',
                    sm: 12,
                    readOnly: true,
                    copyToClipboard: true,
                    label: this.#adapter.getText('Use the following pairing code to commission the device'),
                    default: result.manualPairingCode,
                };
            }
            if (result.qrPairingCode) {
                schema.items._qrCode = {
                    type: 'qrCode',
                    newLine: true,
                    sm: 12,
                    size: 80,
                    data: result.qrPairingCode,
                };
            }

            await context.showForm(schema, {
                title: this.#adapter.getText('Pair with Device'),
                buttons: ['cancel'],
                maxWidth: 'md',
            });
        } else {
            await context.showMessage(this.#adapter.t('No paring code received'));
        }

        return { refresh: 'none' };
    }

    async #handleLogDebugNode(node: GeneralMatterNode, context: ActionContext): Promise<{ refresh: DeviceRefresh }> {
        const rootEndpoint = node.node.node;
        const peerAddress = PeerAddress(rootEndpoint.maybeStateOf(CommissioningClient)?.peerAddress);

        const endpointInfos = rootEndpoint ? logControllerEndpoint(rootEndpoint) : 'No root endpoint found';

        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        const debugInfos = `Node ID: ${node.nodeId}${peerAddress ? ` / ${peerAddress.toString()}` : ''}\n${endpointInfos}`;

        await context.showForm(
            {
                type: 'panel',
                items: {
                    _instructions: {
                        type: 'staticText',
                        text: this.#adapter.getText(
                            'In case of issues with this node please copy and post these details together with Debug logs to the issue.',
                        ),
                    },
                    debugInfos: {
                        type: 'text',
                        label: this.#adapter.getText('Debug Infos'),
                        minRows: 30,
                        sm: 12,
                        readOnly: true,
                        copyToClipboard: true,
                        trim: false,
                        noClearButton: true,
                    },
                },
            },
            {
                data: { debugInfos },
                maxWidth: 'md',
                title: this.#adapter.getText('Debug Infos'),
                buttons: [
                    {
                        type: 'copyToClipboard',
                        label: this.#adapter.getText('Copy to clipboard'),
                        copyToClipboardAttr: 'debugInfos',
                    },
                    {
                        type: 'cancel',
                        label: this.#adapter.getText('Close'),
                    },
                ],
            },
        );

        return { refresh: 'none' };
    }

    async #handleSoftwareUpdateNode(
        node: GeneralMatterNode,
        context: ActionContext,
    ): Promise<{ refresh: DeviceRefresh }> {
        const info = node.softwareUpdateAvailable;
        if (!info || !node.node.basicInformation) {
            await context.showMessage(this.#adapter.t('No software update information available'));
            return { refresh: 'none' };
        }

        const currentVersion = node.node.basicInformation.softwareVersionString;
        const currentVersionNum = node.node.basicInformation.softwareVersion;

        const sourceLabels: Record<string, string> = {
            'dcl-prod': 'OTA Update Source dcl-prod',
            'dcl-test': 'OTA Update Source dcl-test',
            local: 'OTA Update Source local',
        };
        const sourceLabel = this.#adapter.getText(sourceLabels[info.source] ?? info.source);

        const items: Record<string, ConfigItemAny> = {
            _header: {
                type: 'staticText',
                text: this.#adapter.getText('A software update is available for this device.'),
                style: { marginBottom: 16 },
            },
            _divider1: {
                type: 'divider',
            },
            _currentVersionHeader: {
                type: 'header',
                text: this.#adapter.getText('Current Version'),
                size: 5,
            },
            currentVersion: {
                type: 'staticInfo',
                label: this.#adapter.getText('Version'),
                data: `${currentVersion} (${currentVersionNum})`,
            },
            _newVersionHeader: {
                type: 'header',
                text: this.#adapter.getText('New Version'),
                size: 5,
                newLine: true,
            },
            newVersion: {
                type: 'staticInfo',
                label: this.#adapter.getText('New Version'),
                data: `${info.softwareVersionString} (${info.softwareVersion})`,
            },
            updateSource: {
                type: 'staticInfo',
                label: this.#adapter.getText('Update Source'),
                data: sourceLabel,
            },
            ...(info.source !== 'dcl-prod'
                ? {
                      _untrustedWarning: {
                          type: 'staticText',
                          text: this.#adapter.getText('Unverified OTA Update Source Warning'),
                          icon: 'warning',
                          style: {
                              marginTop: 12,
                              padding: '8px 12px',
                              backgroundColor: '#fff3cd',
                              color: '#856404',
                              border: '1px solid #ffc107',
                              borderRadius: 4,
                          },
                      },
                  }
                : {}),
            ...(info.releaseNotesUrl
                ? {
                      releaseNotes: {
                          type: 'staticText',
                          label: this.#adapter.getText('Release Notes'),
                          text: this.#adapter.getText('Release Notes'),
                          href: info.releaseNotesUrl,
                          target: '_blank',
                          button: true,
                          variant: 'outlined',
                          newLine: true,
                          style: { marginTop: 16 },
                      },
                  }
                : {}),
            _divider2: {
                type: 'divider',
                style: { marginTop: 16 },
            },
            _patienceNotice: {
                type: 'staticText',
                text: this.#adapter.getText(
                    'Software updates can take several minutes depending on the device and connection type (Thread, WiFi). The update may appear stuck at times - please be patient and do not interrupt the process.',
                ),
                style: { marginTop: 8, fontStyle: 'italic', fontSize: '0.9em' },
            },
        };

        const result = await context.showForm(
            {
                type: 'panel',
                items,
                style: {
                    minWidth: 350,
                },
            },
            {
                data: { confirmUpdate: true },
                title: this.#adapter.getText('Software Update Available'),
                buttons: [
                    {
                        type: 'cancel',
                        label: this.#adapter.getText('Close'),
                    },
                    {
                        type: 'apply',
                        label: this.#adapter.getText('Update now'),
                        color: 'primary',
                    },
                ],
                ignoreApplyDisabled: true,
            },
        );

        if (isObject(result)) {
            // User clicked "Update now" - start the update process
            this.adapter.log.info(`User requested software update for node ${node.nodeId}`);

            // Start the update process directly on the node
            // Progress will be shown via sendToGui with cancel support
            try {
                await node.startSoftwareUpdate();
            } catch (error) {
                await context.showMessage(`${this.#adapter.t('Failed to start software update')}: ${error}`);
            }
        }

        return { refresh: 'none' };
    }

    async #handleIcdManagement(ioNode: GeneralMatterNode, context: ActionContext): Promise<{ refresh: DeviceRefresh }> {
        const icd = ioNode.icd;
        if (icd === undefined) {
            await context.showMessage(this.#adapter.t('Battery Saver Mode is not supported by this device.'));
            return { refresh: 'none' };
        }

        const info = icd.info;
        const idleDuration = info?.idleModeDuration;
        const interval = idleDuration !== undefined ? formatDuration(idleDuration) : undefined;
        const registered = icd.registered;
        const canResync = registered && !icd.available;

        const items: Record<string, ConfigItemAny> = {
            _currentMode: {
                type: 'staticText',
                text: registered
                    ? interval
                        ? this.#adapter.getText('ICD form current battery saver with interval', interval)
                        : this.#adapter.getText('ICD form current battery saver')
                    : this.#adapter.getText('ICD form current standard'),
            },
        };

        if (registered && !icd.available) {
            items._offline = {
                type: 'staticText',
                newLine: true,
                text: interval
                    ? this.#adapter.getText('ICD form offline with interval', interval)
                    : this.#adapter.getText('ICD form offline'),
                style: { color: '#d32f2f', fontWeight: 'bold' },
            };
        }

        if (info?.features.userActiveModeTrigger) {
            const wake = wakeInstruction(info.userActiveModeTriggerHint, info.userActiveModeTriggerInstruction);
            items._wake = {
                type: 'staticText',
                newLine: true,
                text:
                    wake.kind === 'custom'
                        ? `${this.#adapter.t('To wake the device immediately, follow the device instructions:')} "${wake.text}"`
                        : `${this.#adapter.t('To wake the device immediately:')} ${this.#adapter.t(wake.text)}`,
            };
        }

        items._modeDivider = { type: 'divider', newLine: true };
        items.mode = {
            type: 'select',
            label: this.#adapter.getText('Response speed vs. battery life'),
            noTranslation: true,
            options: [
                { label: this.#adapter.t('Standard Mode'), value: 'standard' },
                { label: this.#adapter.t('Battery Saver Mode (Long Idle)'), value: 'batterySaver' },
            ],
            sm: 12,
        };
        items._standardInfo = {
            type: 'staticText',
            newLine: true,
            text: this.#adapter.getText('ICD form standard explanation'),
        };
        items._batterySaverInfo = {
            type: 'staticText',
            newLine: true,
            text: interval
                ? this.#adapter.getText('ICD form battery saver explanation with interval', interval)
                : this.#adapter.getText('ICD form battery saver explanation'),
        };
        items._ecosystemWarning = {
            type: 'infoBox',
            boxType: 'warning',
            newLine: true,
            text: this.#adapter.getText('ICD form ecosystem warning'),
        };
        items._restartWarning = {
            type: 'infoBox',
            boxType: 'error',
            newLine: true,
            text: this.#adapter.getText('ICD form iobroker restart warning'),
        };

        if (canResync) {
            items._resyncDivider = { type: 'divider', newLine: true };
            items.resync = {
                type: 'checkbox',
                label: this.#adapter.getText('Resync Battery Saver state'),
                newLine: true,
                sm: 12,
            };
            items._resyncInfo = {
                type: 'staticText',
                newLine: true,
                text: this.#adapter.getText('ICD form resync explanation'),
            };
        }

        const result = await context.showForm(
            { type: 'panel', items, style: { minWidth: 400 } },
            {
                data: { mode: registered ? 'batterySaver' : 'standard', resync: false },
                maxWidth: 'md',
                title: this.#adapter.getText('Battery Saver Mode'),
                buttons: [
                    { type: 'cancel', label: this.#adapter.getText('Close') },
                    { type: 'apply', label: this.#adapter.getText('Apply'), color: 'primary' },
                ],
                ignoreApplyDisabled: true,
            },
        );

        if (!isObject(result)) {
            return { refresh: 'none' };
        }

        if (result.resync === true) {
            return this.#runIcdResync(ioNode, icd, context);
        }
        const target = result.mode === 'batterySaver';
        if (target === registered) {
            return { refresh: 'none' };
        }
        return target ? this.#runIcdEnable(ioNode, icd, context, interval) : this.#runIcdDisable(ioNode, icd, context);
    }

    /**
     * Keeps the card in `pending` and an indeterminate progress dialog open while the peer is contacted.
     * `pending` is cleared in a `finally` so a rejected `openProgress`/`close` (e.g. a dropped GUI socket)
     * cannot leave the card stuck on "changing" forever.
     */
    async #runIcdOperation(
        ioNode: GeneralMatterNode,
        icd: NodeIcdManager,
        context: ActionContext,
        title: string,
        action: () => Promise<void>,
    ): Promise<{ refresh: DeviceRefresh }> {
        icd.pending = true;
        let progress: Awaited<ReturnType<ActionContext['openProgress']>> | undefined;
        let error: unknown;
        try {
            progress = await context.openProgress(title, { indeterminate: true });
            await action();
        } catch (caught) {
            error = caught;
        } finally {
            icd.pending = false;
        }
        if (progress !== undefined) {
            try {
                await progress.close();
            } catch (closeError) {
                this.adapter.log.warn(
                    `Failed to close ICD progress dialog for node ${ioNode.nodeId}: ${inspect(closeError, { depth: 5 })}`,
                );
            }
        }
        if (error !== undefined) {
            this.adapter.log.warn(`ICD operation failed for node ${ioNode.nodeId}: ${inspect(error, { depth: 5 })}`);
            await context.showMessage(
                `${this.#adapter.t('Battery Saver Mode operation failed')}: ${error instanceof Error ? error.message : inspect(error)}`,
            );
        }
        return { refresh: 'devices' };
    }

    async #runIcdEnable(
        ioNode: GeneralMatterNode,
        icd: NodeIcdManager,
        context: ActionContext,
        interval: string | undefined,
    ): Promise<{ refresh: DeviceRefresh }> {
        const confirmation = [
            interval
                ? this.#adapter.t('ICD confirm enable with interval', interval)
                : this.#adapter.t('ICD confirm enable'),
            this.#adapter.t('ICD form ecosystem warning'),
            this.#adapter.t('ICD form iobroker restart warning'),
        ].join('\n\n');
        if (!(await context.showConfirmation(confirmation))) {
            return { refresh: 'none' };
        }

        let conflict: IcdMultiAdminConflictError | undefined;
        const outcome = await this.#runIcdOperation(
            ioNode,
            icd,
            context,
            this.#adapter.t('Enabling Battery Saver Mode - waiting for the device to wake up...'),
            async () => {
                try {
                    await icd.register(false);
                } catch (error) {
                    if (!(error instanceof IcdMultiAdminConflictError)) {
                        throw error;
                    }
                    conflict = error;
                }
            },
        );
        if (conflict === undefined) {
            return outcome;
        }

        const names = conflict.vendorIds.length
            ? conflict.vendorIds
                  .map(vendorId => VendorIds[vendorId] ?? `${this.#adapter.t('Vendor')} ${toUpperCaseHex(vendorId)}`)
                  .join(', ')
            : this.#adapter.t('unknown ecosystems');
        if (!(await context.showConfirmation(this.#adapter.t('ICD confirm multi admin', names)))) {
            return { refresh: 'none' };
        }
        return this.#runIcdOperation(
            ioNode,
            icd,
            context,
            this.#adapter.t('Enabling Battery Saver Mode - waiting for the device to wake up...'),
            () => icd.register(true),
        );
    }

    async #runIcdDisable(
        ioNode: GeneralMatterNode,
        icd: NodeIcdManager,
        context: ActionContext,
    ): Promise<{ refresh: DeviceRefresh }> {
        // The guard read below can park for a full idle interval, so confirm before paying for it.
        if (!(await context.showConfirmation(this.#adapter.t('ICD confirm disable')))) {
            return { refresh: 'none' };
        }
        let blockedBy = 0;
        const outcome = await this.#runIcdOperation(
            ioNode,
            icd,
            context,
            this.#adapter.t('Switching to Standard Mode - waiting for the device to wake up...'),
            async () => {
                blockedBy = await icd.otherFabricClientCount();
                if (blockedBy > 0) {
                    return;
                }
                await icd.unregister(false);
            },
        );
        if (blockedBy > 0) {
            await context.showMessage(this.#adapter.t('ICD cannot disable other controllers', blockedBy));
        }
        return outcome;
    }

    async #runIcdResync(
        ioNode: GeneralMatterNode,
        icd: NodeIcdManager,
        context: ActionContext,
    ): Promise<{ refresh: DeviceRefresh }> {
        if (!(await context.showConfirmation(this.#adapter.t('ICD confirm resync')))) {
            return { refresh: 'none' };
        }
        return this.#runIcdOperation(ioNode, icd, context, this.#adapter.t('Resyncing...'), () => icd.resync());
    }

    async #handleConfigureNodeOrDevice(
        title: string,
        baseId: string,
        context: ActionContext,
        nodeOrDevice: GeneralMatterNode | GenericDeviceToIoBroker,
    ): Promise<{ refresh: DeviceRefresh }> {
        const obj = await this.adapter.getObjectAsync(baseId);

        const node = nodeOrDevice instanceof GeneralMatterNode ? nodeOrDevice : undefined;
        const device = nodeOrDevice instanceof GenericDeviceToIoBroker ? nodeOrDevice : undefined;

        let addBatteryPoweredInfo = false;
        const items: Record<string, ConfigItemAny> = {
            exposeMatterApplicationClusterData: {
                type: 'select',
                label: this.#adapter.t('Expose Matter Application Cluster Data'),
                options: [
                    { label: this.#adapter.t('Yes'), value: 'true' },
                    { label: this.#adapter.t('No'), value: 'false' },
                    { label: this.#adapter.t('Default'), value: '' },
                ],
                noTranslation: true,
                sm: 12,
            },
            exposeMatterSystemClusterData: {
                type: 'select',
                label: this.#adapter.t('Expose Matter System Cluster Data'),
                noTranslation: true,
                options: [
                    { label: this.#adapter.t('Yes'), value: 'true' },
                    { label: this.#adapter.t('No'), value: 'false' },
                    { label: this.#adapter.t('Default'), value: '' },
                ],
                sm: 12,
            },
        };
        const data: JsonFormData = {
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
        };

        if (device !== undefined) {
            const deviceConfig = device.deviceConfiguration;
            if (deviceConfig.pollInterval !== undefined) {
                items.pollInterval_devider = {
                    type: 'divider',
                };
                items.pollInterval = {
                    type: 'number',
                    label: this.#adapter.getText('Attribute Polling Interval (s)'),
                    min: 30,
                    max: 2147482,
                    sm: 12,
                };
                data.pollInterval = deviceConfig.pollInterval;

                if (device.node.deviceInformation?.isBatteryPowered) {
                    addBatteryPoweredInfo = true;
                }
            }
        } else if (node !== undefined) {
            const nodeConfig = node.nodeConfiguration;

            // Because of a Matter SDK Bug setting the subscriptionMaxIntervalS only makes sense
            // for Matter versions >= 1.3
            const specVersion = node.node.basicInformation?.specificationVersion;
            if (typeof specVersion === 'number' && specVersion !== 0) {
                const { major, minor } = SpecificationVersion.decode(specVersion);
                const matterVersion = parseFloat((major + minor / 100).toFixed(1));
                if (matterVersion >= 1.3) {
                    items.subscriptionMaxIntervalS_devider = {
                        type: 'divider',
                    };
                    items.subscriptionMaxIntervalS = {
                        type: 'number',
                        label: this.#adapter.getText('Subscription Maximum Interval (s, 0=Default)'),
                        min: 0,
                        max: 2147482,
                        sm: 12,
                    };
                    data.subscriptionMaxIntervalS = nodeConfig.subscriptionMaxIntervalS ?? 0;
                    items.subscriptionMaxIntervalS_info = {
                        type: 'staticText',
                        newLine: true,
                        text: this.#adapter.getText(
                            'This value is just a proposal for the device The device may decide for an other maximum interval.',
                        ),
                    };
                    if (node.node.deviceInformation?.isBatteryPowered) {
                        addBatteryPoweredInfo = true;
                    }
                }
            }

            if (addBatteryPoweredInfo) {
                items.pollInterval_batteryInfo = {
                    type: 'staticText',
                    newLine: true,
                    text: this.#adapter.getText(
                        'This device is battery powered. Be careful to not drain the battery too fast.',
                    ),
                };
            }
        }

        const result = await context.showForm(
            {
                type: 'panel',
                items,
                style: {
                    minWidth: 300,
                },
            },
            {
                data,
                title: this.#adapter.getText(title),
            },
        );

        if (device !== undefined && result?.pollInterval !== undefined) {
            device.setDeviceConfiguration({ pollInterval: result.pollInterval });
        } else if (
            node !== undefined &&
            result?.subscriptionMaxIntervalS !== undefined &&
            result?.subscriptionMaxIntervalS !== 0
        ) {
            node.setNodeConfiguration({ subscriptionMaxIntervalS: result.subscriptionMaxIntervalS });
        }

        if (
            result?.exposeMatterApplicationClusterData !== undefined &&
            result?.exposeMatterSystemClusterData !== undefined
        ) {
            await this.adapter.extendObjectAsync(baseId, {
                native: {
                    exposeMatterApplicationClusterData: strToBool(result.exposeMatterApplicationClusterData),
                    exposeMatterSystemClusterData: strToBool(result.exposeMatterSystemClusterData),
                    ...(device !== undefined ? device.deviceConfiguration : {}),
                    ...(node !== undefined ? node.nodeConfiguration : {}),
                },
            });
        }
        return { refresh: 'none' };
    }

    async #handleConfigureNode(node: GeneralMatterNode, context: ActionContext): Promise<{ refresh: DeviceRefresh }> {
        this.adapter.log.info(`Configure node ${node.nodeId}`);

        return await this.#handleConfigureNodeOrDevice('Configure node', node.nodeBaseId, context, node);
    }

    async #handleConfigureDevice(
        device: GenericDeviceToIoBroker,
        context: ActionContext,
    ): Promise<{ refresh: DeviceRefresh }> {
        this.adapter.log.info(`Configure device ${device.name}`);

        return await this.#handleConfigureNodeOrDevice('Configure device', device.baseId, context, device);
    }

    async #handleIdentifyDevice(
        device: GenericDeviceToIoBroker,
        context: ActionContext,
    ): Promise<{ refresh: DeviceRefresh }> {
        await device.identify();

        await context.showMessage(this.#adapter.t(`The device should now identify itself for 10 seconds.`));

        return { refresh: 'none' };
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
        const result = await context.showForm(
            {
                type: 'panel',
                items: {
                    name: {
                        type: 'text',
                        label: this.#adapter.getText('Name'),
                        allowEmpty: false,
                        sm: 12,
                    },
                },
                style: {
                    minWidth: 200,
                },
            },
            {
                data: {
                    name: device.name,
                },
                title: this.#adapter.getText('Rename device'),
            },
        );

        if (result?.name !== undefined && result.name !== device.name) {
            this.adapter.log.info(`Rename device ${device.name} to "${result.name}"`);
            await device.rename(result.name);
            return { refresh: 'devices' };
        }
        return { refresh: 'none' };
    }

    protected getDeviceInfo(id: string): DeviceInfo<string> {
        const idParts = id.split('-');
        const nodeId = idParts[0];

        const node = this.#adapter.controllerNode?.nodes.get(nodeId);

        if (!node) {
            throw new Error(`Node not found: ${nodeId}`);
        }

        const entries = this.#getNodeEntry(node, 'primary');

        const entry = entries.find(e => e.id === id);
        if (!entry) {
            throw new Error(`Device entry not found: ${id}`);
        }

        return entry;
    }

    getDeviceDetails(id: string): DeviceDetails<string> | null | { error: string } {
        this.adapter.log.debug(`Get details ${id}`);

        const idParts = id.split('-');
        const nodeId = idParts[0];
        const endpointId = idParts[1] !== undefined ? parseInt(idParts[1], 10) : undefined;

        const node = this.#adapter.controllerNode?.nodes.get(nodeId);

        if (!node) {
            return { error: 'Node not found' };
        }

        if (endpointId === undefined) {
            // Get Node details
            const schema = convertDataToJsonConfig(node.getNodeDetails());
            return { id, schema, data: {} };
        }

        // Get Endpoint details
        const device = node.devices.get(endpointId);
        if (!device) {
            return { error: 'Device not found' };
        }

        const schema = convertDataToJsonConfig(device.getDeviceDetails(node.isConnected));

        return { id, schema, data: {} };
    }

    async checkNodeUpdates(context: ActionContext): Promise<{ refresh: boolean }> {
        const updates = (await this.#adapter?.controllerNode?.queryUpdates()) ?? [];

        const message =
            this.#adapter?.t('%s updates available', updates.length) ?? `${updates.length} updates available`;
        await context.showMessage(message);

        return { refresh: !!updates.length };
    }

    async close(): Promise<void> {
        // do nothing
    }
}

export default MatterAdapterDeviceManagement;
