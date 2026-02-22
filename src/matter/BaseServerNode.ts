import { type ServerNode, type SessionsBehavior, type Endpoint, serialize, Diagnostic } from '@matter/main';
import { DeviceCommissioner, DeviceAdvertiser } from '@matter/main/protocol';
import type { MatterAdapter } from '../main';
import type { GeneralNode, MessageResponse } from './GeneralNode';
import { type StructuredJsonFormData, convertDataToJsonConfig } from '../lib/JsonConfigUtils';
import type { BridgedNodeEndpoint, RootEndpoint } from '@matter/main/endpoints';
import { PowerSource } from '@matter/main/clusters';
import type { GenericDevice } from '../lib/devices/GenericDevice';
import { PropertyType } from '../lib/devices/DeviceStateObject';
import { BatteryPowerSourceServer } from './behaviors/PowerSourceServer';
import type { JsonFormSchema } from '@iobroker/dm-utils';

export enum NodeStates {
    Creating = 'creating',
    WaitingForCommissioning = 'waitingForCommissioning',
    Commissioned = 'commissioned',
    ConnectedWithController = 'connected',
}

export interface ConnectionInfo {
    vendorId?: number;
    vendorName?: string;
    connected: boolean;
    label?: string;
}

export interface NodeStateResponse {
    status?: NodeStates;
    error?: boolean | string[];
    qrPairingCode?: string;
    manualPairingCode?: string;
    connectionInfo?: ConnectionInfo[];
}

/** Basic class for a Matter Server Node (Devices/Bridges) */
export abstract class BaseServerNode implements GeneralNode {
    protected serverNode?: ServerNode;
    protected commissioned: boolean | null = null;

    abstract port: number;
    #uuid: string;

    protected constructor(
        protected adapter: MatterAdapter,
        protected type: 'devices' | 'bridges',
        uuid: string,
    ) {
        this.#uuid = uuid;
    }

    get uuid(): string {
        return this.#uuid;
    }

    get error(): boolean | string[] {
        return false;
    }

    /** Advertise the device into the network via MDNS. */
    async advertise(): Promise<void> {
        if (this.serverNode === undefined) {
            return;
        }
        if (this.serverNode.lifecycle.isCommissioned) {
            await this.serverNode.env.get(DeviceCommissioner)?.allowBasicCommissioning();
        } else {
            this.serverNode.env.get(DeviceAdvertiser)?.restartAdvertisement();
        }
    }

    /** Factory reset the device. */
    async factoryReset(): Promise<void> {
        await this.serverNode?.erase();
    }

    /** Returns the state of the Node for the UI. */
    async getState(): Promise<NodeStateResponse> {
        if (!this.serverNode) {
            return {
                status: NodeStates.Creating,
            };
        }

        const { qrPairingCode, manualPairingCode } = this.serverNode.state.commissioning.pairingCodes;

        const result: NodeStateResponse = {
            status: NodeStates.WaitingForCommissioning,
            error: this.error,
            qrPairingCode: qrPairingCode,
            manualPairingCode: manualPairingCode,
        };

        // Device is not commissioned, so show QR code
        if (!this.serverNode.lifecycle.isCommissioned) {
            if (this.commissioned !== false) {
                this.commissioned = false;
                await this.adapter.setState(`${this.type}.${this.uuid}.commissioned`, this.commissioned, true);
            }

            return result;
        }
        if (this.commissioned !== true) {
            this.commissioned = true;
            await this.adapter.setState(`${this.type}.${this.uuid}.commissioned`, this.commissioned, true);
        }

        const activeSessions = Object.values(this.serverNode.state.sessions.sessions);
        const fabrics = Object.values(this.serverNode.state.commissioning.fabrics);

        result.connectionInfo = fabrics.map(fabric => ({
            vendorId: fabric?.rootVendorId,
            vendorName: fabric.label.toLowerCase().includes('iobroker') ? 'iobroker' : 'unknown',
            connected: activeSessions
                .filter(session => session.fabric?.fabricId === fabric.fabricId)
                .some(({ numberOfActiveSubscriptions }) => !!numberOfActiveSubscriptions),
            label: fabric?.label,
        }));

        if (result.connectionInfo.find(info => info.connected)) {
            this.adapter.log.debug(`${this.type} ${this.uuid} is already commissioned and connected with controller`);
            result.status = NodeStates.ConnectedWithController;
            return result;
        }
        this.adapter.log.debug(
            `${this.type} ${this.uuid} is already commissioned. Waiting for controllers to connect ...`,
        );

        result.status = NodeStates.Commissioned;

        return result;
    }

    async updateUiState(): Promise<void> {
        await this.adapter.sendToGui({
            command: 'updateStates',
            states: { [this.uuid]: await this.getState() },
        });
    }

    /** Handles the device specific Messages from the UI. */
    async handleCommand(obj: ioBroker.Message): Promise<MessageResponse> {
        const { command, message } = obj;
        switch (command) {
            case 'deviceReAnnounce':
                await this.advertise();
                return { result: await this.getState() };
            case 'deviceFactoryReset':
                await this.factoryReset();
                return { result: await this.getState() };
            case 'deviceExtendedInfo': {
                return {
                    result: {
                        schema: convertDataToJsonConfig(this.getDeviceDetails(message), this.adapter),
                        options: {
                            maxWidth: 'md',
                            minWidth: 610,
                            data: {},
                            title: this.adapter.getText(
                                this.type === 'bridges' && !('bridgedDeviceUuid' in message)
                                    ? 'Bridge Detail information'
                                    : 'Device Detail information',
                            ),
                            buttons: ['close'],
                        },
                    },
                };
            }
            case 'deviceDebugInfo': {
                const { data, schema } = this.getDeviceDebugInfo(message);
                return {
                    result: {
                        schema,
                        options: {
                            data,
                            maxWidth: 'md',
                            minWidth: 610,
                            title: this.adapter.getText(
                                this.type === 'bridges' && !('bridgedDeviceUuid' in message)
                                    ? 'Bridge Debug information'
                                    : 'Device Debug information',
                            ),
                            buttons: [
                                {
                                    type: 'copyToClipboard',
                                    label: this.adapter.getText('Copy to clipboard'),
                                    copyToClipboardAttr: 'debugInfos',
                                },
                                {
                                    type: 'close',
                                    label: this.adapter.getText('Close'),
                                },
                            ],
                        },
                    },
                };
            }
        }

        return { error: `Unknown command "${command}"` };
    }

    /** Registers update handlers for the ServerNode to update the UI on changes. */
    registerServerNodeHandlers(): void {
        if (!this.serverNode) {
            throw new Error('ServerNode not yet initialized.');
        }
        this.serverNode.events.commissioning.fabricsChanged.on(fabricIndex => {
            this.adapter.log.debug(
                `commissioningChangedCallback: Commissioning changed on Fabric ${fabricIndex}: ${serialize(this.serverNode?.state.operationalCredentials.fabrics.find(fabric => fabric.fabricIndex === fabricIndex))}`,
            );
            this.updateUiState().catch(error => this.adapter.log.info(`Could not update UI state: ${error}`));
        });

        const sessionChange = (session: SessionsBehavior.Session): void => {
            this.adapter.log.debug(
                `activeSessionsChangedCallback: Active sessions changed on Fabric ${session.fabric?.fabricIndex}${Diagnostic.json(session)}`,
            );
            this.updateUiState().catch(error => this.adapter.log.info(`Could not update UI state: ${error}`));
        };
        this.serverNode.events.sessions.opened.on(sessionChange);
        this.serverNode.events.sessions.closed.on(sessionChange);
        this.serverNode.events.sessions.subscriptionsChanged.on(sessionChange);
    }

    abstract getDeviceDetails(message: ioBroker.MessagePayload): StructuredJsonFormData;

    getDeviceDebugInfo(_message: ioBroker.MessagePayload): { schema: JsonFormSchema; data: any } {
        return {
            schema: {
                type: 'panel',
                items: {
                    _instructions: {
                        type: 'staticText',
                        text: this.adapter.getText(
                            'In case of issues with this node please copy and post these details together with Debug logs to the issue.',
                        ),
                    },
                    debugInfos: {
                        type: 'text',
                        label: this.adapter.getText('Debug Infos'),
                        minRows: 30,
                        sm: 12,
                        readOnly: true,
                        copyToClipboard: true,
                        trim: false,
                        noClearButton: true,
                    },
                },
            },
            data: null,
        };
    }

    /**
     * Initializes the reachable state handler for a device and map it to the Basic Information Cluster of the Matter +
     * device.
     */
    async initializeUnreachableStateHandler(
        endpoint: Endpoint<RootEndpoint>,
        ioBrokerDevice: GenericDevice,
    ): Promise<void> {
        if (!ioBrokerDevice.propertyNames.includes(PropertyType.Unreachable)) {
            return;
        }

        ioBrokerDevice.onChange(async event => {
            switch (event.property) {
                case PropertyType.Unreachable:
                    await endpoint.set({
                        basicInformation: {
                            reachable: !event.value,
                        },
                    });
                    break;
            }
        });

        await endpoint.set({
            basicInformation: {
                reachable: !ioBrokerDevice.getUnreachable(),
            },
        });
    }

    /**
     * Initializes the reachable state handler for a device and map it to the Bridged Node Basic Information Cluster of the
     * Matter device.
     */
    async initializeBridgedUnreachableStateHandler(
        endpoint: Endpoint<BridgedNodeEndpoint>,
        ioBrokerDevice: GenericDevice,
    ): Promise<void> {
        if (!ioBrokerDevice.propertyNames.includes(PropertyType.Unreachable)) {
            return;
        }

        ioBrokerDevice.onChange(async event => {
            switch (event.property) {
                case PropertyType.Unreachable:
                    await endpoint.set({
                        bridgedDeviceBasicInformation: {
                            reachable: !event.value,
                        },
                    });
                    break;
            }
        });

        await endpoint.set({
            bridgedDeviceBasicInformation: {
                reachable: !ioBrokerDevice.getUnreachable(),
            },
        });
    }

    #determineBatteryDetails(ioBrokerDevice: GenericDevice): {
        batPercentRemaining?: number | null;
        batChargeLevel: PowerSource.BatChargeLevel;
        batReplacementNeeded: boolean;
    } {
        const batteryValue = ioBrokerDevice.hasBattery() ? (ioBrokerDevice.getBattery() ?? null) : undefined;
        const batPercentRemaining = typeof batteryValue === 'number' ? batteryValue * 2 : batteryValue;

        const isLowBattery = ioBrokerDevice.hasLowBattery() ? (ioBrokerDevice.getLowBattery() ?? false) : undefined;
        let batChargeLevel = isLowBattery ? PowerSource.BatChargeLevel.Critical : PowerSource.BatChargeLevel.Ok;

        if (isLowBattery !== false && typeof batteryValue === 'number') {
            if (batteryValue <= 10) {
                batChargeLevel = PowerSource.BatChargeLevel.Critical;
            } else if (batteryValue <= 15) {
                batChargeLevel = PowerSource.BatChargeLevel.Warning;
            } else if (isLowBattery === undefined) {
                batChargeLevel = PowerSource.BatChargeLevel.Ok;
            }
        }

        return {
            batPercentRemaining,
            batChargeLevel,
            batReplacementNeeded: batChargeLevel !== PowerSource.BatChargeLevel.Ok,
        };
    }

    registerMaintenanceClusters(endpoint: Endpoint<any>, ioBrokerDevice: GenericDevice): void {
        if (!ioBrokerDevice.hasBattery() && !ioBrokerDevice.hasLowBattery()) {
            return;
        }

        const { batPercentRemaining, batChargeLevel, batReplacementNeeded } =
            this.#determineBatteryDetails(ioBrokerDevice);
        endpoint.behaviors.require(BatteryPowerSourceServer, {
            status: PowerSource.PowerSourceStatus.Active,
            order: 0,
            description: this.adapter.t('Battery as reported by ioBroker'),
            batPercentRemaining,
            batChargeLevel,
            batReplacementNeeded,
            batReplaceability: PowerSource.BatReplaceability.UserReplaceable, // Meaningful default
            endpointList: [],
        });
    }

    /**
     * Initialize other Maintenance states for the device and Map it to Matter.
     */
    initializeMaintenanceStateHandlers(endpoint: Endpoint<any>, ioBrokerDevice: GenericDevice): void {
        if (!ioBrokerDevice.hasBattery() && !ioBrokerDevice.hasLowBattery()) {
            return;
        }

        // install ioBroker listeners
        // here we react on changes from the ioBroker side for onOff and current lamp level
        ioBrokerDevice.onChange(async event => {
            switch (event.property) {
                case PropertyType.LowBattery:
                case PropertyType.Battery:
                    await endpoint.setStateOf(BatteryPowerSourceServer, this.#determineBatteryDetails(ioBrokerDevice));
                    break;
            }
        });
    }
}
