import { SessionsBehavior } from '@project-chip/matter.js/behavior/system/sessions';
import { Logger } from '@project-chip/matter.js/log';
import { ServerNode } from '@project-chip/matter.js/node';
import type { MatterAdapter } from '../main';
import { GeneralNode, MessageResponse } from './GeneralNode';
import VENDOR_IDS from './vendorIds';

export enum NodeStates {
    Creating = 'creating',
    WaitingForCommissioning = 'waitingForCommissioning',
    Commissioned = 'commissioned',
    ConnectedWithController = 'connected',
}

export interface ConnectionInfo {
    vendor: string;
    connected: boolean;
    label?: string;
}

export interface NodeStateResponse {
    status: NodeStates;
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

    /** Advertise the device into the network via MDNS. */
    async advertise(): Promise<void> {
        await this.serverNode?.advertiseNow();
    }

    /** Factory reset the device. */
    async factoryReset(): Promise<void> {
        await this.serverNode?.factoryReset();
    }

    /** Returns the state of the Node for the UI. */
    async getState(): Promise<NodeStateResponse> {
        if (!this.serverNode) {
            return {
                status: NodeStates.Creating,
            };
        }

        // Device is not commissioned, so show QR code
        if (!this.serverNode.lifecycle.isCommissioned) {
            if (this.commissioned !== false) {
                this.commissioned = false;
                await this.adapter.setState(`${this.type}.${this.uuid}.commissioned`, this.commissioned, true);
            }
            const { qrPairingCode, manualPairingCode } = this.serverNode.state.commissioning.pairingCodes;
            return {
                status: NodeStates.WaitingForCommissioning,
                qrPairingCode: qrPairingCode,
                manualPairingCode: manualPairingCode,
            };
        } else {
            if (this.commissioned !== true) {
                this.commissioned = true;
                await this.adapter.setState(`${this.type}.${this.uuid}.commissioned`, this.commissioned, true);
            }

            const activeSessions = Object.values(this.serverNode.state.sessions.sessions);
            const fabrics = Object.values(this.serverNode.state.commissioning.fabrics);

            const connectionInfo: ConnectionInfo[] = activeSessions.map(session => {
                const vendorId = session?.fabric?.rootVendorId;
                return {
                    vendor: (vendorId && VENDOR_IDS[vendorId]) || `0x${(vendorId || 0).toString(16)}`,
                    connected: !!session.numberOfActiveSubscriptions,
                    label: session?.fabric?.label,
                };
            });

            fabrics.forEach(fabric => {
                if (!activeSessions.find(session => session.fabric?.fabricId === fabric.fabricId)) {
                    connectionInfo.push({
                        vendor: VENDOR_IDS[fabric?.rootVendorId] || `0x${(fabric?.rootVendorId || 0).toString(16)}`,
                        connected: false,
                        label: fabric?.label,
                    });
                }
            });

            if (connectionInfo.find(info => info.connected)) {
                console.log(`${this.type} ${this.uuid} is already commissioned and connected with controller`);
                return {
                    status: NodeStates.ConnectedWithController,
                    connectionInfo,
                };
            } else {
                console.log(
                    `${this.type} ${this.uuid} is already commissioned. Waiting for controllers to connect ...`,
                );
                return {
                    status: NodeStates.Commissioned,
                    connectionInfo,
                };
            }
        }
    }

    /** Handles device specific Messages from the UI. */
    async handleCommand(command: string, _message: ioBroker.MessagePayload): Promise<MessageResponse> {
        switch (command) {
            case 'deviceReAnnounce':
                await this.advertise();
                break;
            case 'deviceFactoryReset':
                await this.factoryReset();
                return { result: await this.getState() };
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
                `commissioningChangedCallback: Commissioning changed on Fabric ${fabricIndex}: ${this.serverNode?.state.operationalCredentials.fabrics.find(fabric => fabric.fabricIndex === fabricIndex)}`,
            );
            await this.adapter.sendToGui({
                command: 'updateStates',
                states: { [this.uuid]: await this.getState() },
            });
        });

        const sessionChange = async (session: SessionsBehavior.Session): Promise<void> => {
            this.adapter.log.debug(
                `activeSessionsChangedCallback: Active sessions changed on Fabric ${session.fabric?.fabricIndex}` +
                    Logger.toJSON(session),
            );
            await this.adapter.sendToGui({
                command: 'updateStates',
                states: { [this.uuid]: await this.getState() },
            });
        };
        this.serverNode.events.sessions.opened.on(sessionChange);
        this.serverNode.events.sessions.closed.on(sessionChange);
        this.serverNode.events.sessions.subscriptionsChanged.on(sessionChange);
    }
}
