import { GenericDevice } from '../../lib';
import { Endpoint } from '@project-chip/matter.js/endpoint';

export interface IdentifyOptions {
    currentState?: any;
    initialState?: any;
}

export abstract class MappingGenericDevice {
    private identifyTimeout?: NodeJS.Timeout;
    private identifyHighlightState = false;

    constructor(private name: string) {

    }

    handleIdentify(identifyOptions: IdentifyOptions): void {
        clearTimeout(this.identifyTimeout);
        this.identifyTimeout = setTimeout(async() => {
            this.identifyTimeout = undefined;
            const highlightState = !this.identifyHighlightState;
            if (highlightState) {
                if (this.getIoBrokerDevice().isActionAllowedByIdentify()) {
                    this.doIdentify(identifyOptions);
                }
            } else {
                if (this.getIoBrokerDevice().isActionAllowedByIdentify()) {
                    this.resetIdentify(identifyOptions);
                }
            }
            this.handleIdentify(identifyOptions);
        }, 1000);
    }

    stopIdentify(identifyOptions: IdentifyOptions): void {
        clearTimeout(this.identifyTimeout);
        this.identifyTimeout = undefined;
        // set to initial state
        if (this.getIoBrokerDevice().isActionAllowedByIdentify()) {
            this.resetIdentify(identifyOptions);
        }
    }

    abstract doIdentify(identifyOptions: IdentifyOptions): void;
    abstract resetIdentify(identifyOptions: IdentifyOptions): void;

    abstract getMatterDevice(): Endpoint<any>;
    abstract getIoBrokerDevice(): GenericDevice;

    getName(): string {
        return this.name;
    }

    abstract registerMatterHandlers(): void;
    abstract init(): Promise<void>;
}
