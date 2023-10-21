import { Device } from '@project-chip/matter-node.js/device';
import { GenericDevice } from '../../lib';

export abstract class MappingGenericDevice {
    constructor(private name: string) {

    }

    abstract getMatterDevice(): Device;
    abstract getIoBrokerDevice(): GenericDevice;

    getName(): string {
        return this.name;
    }

    abstract init(): Promise<void>;
}