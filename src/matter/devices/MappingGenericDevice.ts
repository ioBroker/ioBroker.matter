import { Device } from '@project-chip/matter-node.js/device';
import { AttributeServer } from '@project-chip/matter-node.js/cluster';

import { GenericDevice } from '../../lib';

export interface IdentifyOptions {
    counter: number;
    identifyTime: number;
    currentState: any;
    initialState: any;
}

export abstract class MappingGenericDevice {
    constructor(private name: string) {

    }

    identify(attrIdentifyTime: AttributeServer<number>, identifyOptions: IdentifyOptions): void {
        setTimeout(async () => {
            identifyOptions.counter--;
            identifyOptions.identifyTime -= 0.5;
            // send update to controller
            attrIdentifyTime.setLocal(identifyOptions.identifyTime);
            if (identifyOptions.identifyTime > 0) {
                if (identifyOptions.counter % 2 === 0) {
                    if (this.getIoBrokerDevice().isActionAllowedByIdentify()) {
                        this.doIdentify(identifyOptions);
                    }
                }

                this.identify(attrIdentifyTime, identifyOptions);
            } else {
                // set to initial state
                if (this.getIoBrokerDevice().isActionAllowedByIdentify()) {
                    this.resetIdentify(identifyOptions);
                }
            }
        }, 500);
    }

    abstract doIdentify(identifyOptions: IdentifyOptions): void;
    abstract resetIdentify(identifyOptions: IdentifyOptions): void;

    abstract getMatterDevice(): Device;
    abstract getIoBrokerDevice(): GenericDevice;

    getName(): string {
        return this.name;
    }

    abstract init(): Promise<void>;
}