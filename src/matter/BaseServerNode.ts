import { ServerNode } from '@project-chip/matter.js/node';
import type { MatterAdapter } from '../main';
import { GeneralNode, MessageResponse } from './GeneralNode';

export enum NodeStates {
    Creating = 'creating',
    WaitingForCommissioning = 'waitingForCommissioning',
    Commissioned = 'commissioned',
    ConnectedWithController = 'connected',
}

export interface ConnectionInfo {
    vendorId?: number;
    connected: boolean;
    label?: string;
}

export interface NodeStateResponse {
    status: NodeStates;
    qrPairingCode?: string;
    manualPairingCode?: string;
    connectionInfo?: ConnectionInfo[];
}

export abstract class BaseServerNode implements GeneralNode {
    protected serverNode?: ServerNode;

    abstract uuid: string;

    protected constructor(protected adapter: MatterAdapter) {}

    async advertise(): Promise<void> {
        await this.serverNode?.advertiseNow();
    }

    async factoryReset(): Promise<void> {
        await this.serverNode?.factoryReset();
    }

    abstract getState(): Promise<NodeStateResponse>;

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
}
