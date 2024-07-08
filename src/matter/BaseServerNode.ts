import { GeneralNode, MessageResponse } from './GeneralNode';
import type { MatterAdapter } from '../main';
import { ServerNode } from '@project-chip/matter.js/node';

export interface BaseCreateOptions {
    adapter: MatterAdapter;
}

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

export abstract class BaseServerNode implements GeneralNode {
    protected adapter: MatterAdapter;
    protected serverNode?: ServerNode;

    protected constructor(options: BaseCreateOptions) {
        this.adapter = options.adapter;
    }

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
