import { GeneralNode, MessageResponse } from './GeneralNode';

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
    abstract advertise(): Promise<void>;
    abstract factoryReset(): Promise<void>;
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

        return { error: `Unknown command ${command}` };
    }
}
