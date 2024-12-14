import { Logger, type ServerNode, type SessionsBehavior, serialize } from '@matter/main';
import { DeviceCommissioner } from '@matter/main/protocol';
import type { MatterAdapter } from '../main';
import type { GeneralNode, MessageResponse } from './GeneralNode';
import { type StructuredJsonFormData, convertDataToJsonConfig } from '../lib/JsonConfigUtils';

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
            await this.serverNode.advertiseNow();
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
            vendorName: 'TODO', // TODO: Get vendor name from Clusters
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

    /** Handles device specific Messages from the UI. */
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
                        schema: convertDataToJsonConfig(this.getDeviceDetails(message)),
                        options: {
                            maxWidth: 'md',
                            data: {},
                            title: `${this.type === 'bridges' && !('bridgedDeviceUuid' in message) ? 'Bridge' : 'Device'} Detail information`,
                            buttons: ['close'],
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
        this.serverNode.events.commissioning.fabricsChanged.on(async fabricIndex => {
            this.adapter.log.debug(
                `commissioningChangedCallback: Commissioning changed on Fabric ${fabricIndex}: ${serialize(this.serverNode?.state.operationalCredentials.fabrics.find(fabric => fabric.fabricIndex === fabricIndex))}`,
            );
            await this.updateUiState();
        });

        const sessionChange = async (session: SessionsBehavior.Session): Promise<void> => {
            this.adapter.log.debug(
                `activeSessionsChangedCallback: Active sessions changed on Fabric ${session.fabric?.fabricIndex}${Logger.toJSON(session)}`,
            );
            await this.updateUiState();
        };
        this.serverNode.events.sessions.opened.on(sessionChange);
        this.serverNode.events.sessions.closed.on(sessionChange);
        this.serverNode.events.sessions.subscriptionsChanged.on(sessionChange);
    }

    abstract getDeviceDetails(message: ioBroker.MessagePayload): StructuredJsonFormData;
}
