export type MessageResponse = void | { result: any } | { error: string };

export interface GeneralNode {
    handleCommand(command: string, message: ioBroker.MessagePayload): Promise<MessageResponse>;
}
