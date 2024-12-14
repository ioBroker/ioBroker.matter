import type { StructuredJsonFormData } from '../lib/JsonConfigUtils';

export type MessageResponse = void | { result: any } | { error: string };

export interface GeneralNode {
    handleCommand(obj: ioBroker.Message): Promise<MessageResponse>;
    getDeviceDetails?(message: ioBroker.MessagePayload): StructuredJsonFormData;
}
