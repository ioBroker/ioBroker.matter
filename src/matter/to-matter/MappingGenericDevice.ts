import { Endpoint } from '@matter/main';
import { GenericDevice } from '../../lib';

export interface IdentifyOptions {
    currentState?: any;
    initialState?: any;
}

/** Base class to map an ioBroker device to a matter device. */
export abstract class MappingGenericDevice {
    #identifyTimeout?: NodeJS.Timeout;
    #identifyHighlightState = false;
    #name: string;
    #uuid: string;

    protected constructor(name: string, uuid: string) {
        this.#name = name;
        this.#uuid = uuid;
    }

    /**
     * Generic Identify Logic handler. This method uses `doIdentify()` and `resetIdentify()` to handle the identify
     * logic while an Identification process is running.
     */
    handleIdentify(identifyOptions: IdentifyOptions): void {
        clearTimeout(this.#identifyTimeout);
        this.#identifyTimeout = setTimeout(async () => {
            this.#identifyTimeout = undefined;
            const highlightState = !this.#identifyHighlightState;
            if (highlightState) {
                if (this.getIoBrokerDevice().isActionAllowedByIdentify()) {
                    await this.doIdentify(identifyOptions);
                }
            } else {
                if (this.getIoBrokerDevice().isActionAllowedByIdentify()) {
                    await this.resetIdentify(identifyOptions);
                }
            }
            this.handleIdentify(identifyOptions);
        }, 1000);
    }

    /**
     * This method is called when the Identification process is stopped.
     */
    async stopIdentify(identifyOptions: IdentifyOptions): Promise<void> {
        clearTimeout(this.#identifyTimeout);
        this.#identifyTimeout = undefined;
        // set to initial state
        if (this.getIoBrokerDevice().isActionAllowedByIdentify()) {
            await this.resetIdentify(identifyOptions);
        }
    }

    /**
     * This method gets triggered ever second when Identification is active and should implements device specific logic.
     */
    abstract doIdentify(identifyOptions: IdentifyOptions): Promise<void>;

    /**
     * This method is called at the end of the Identification and should restore the state from before the identification
     * started.
     */
    abstract resetIdentify(identifyOptions: IdentifyOptions): Promise<void>;

    /** Return the created Matter Endpoints of this device. */
    abstract getMatterEndpoints(): Endpoint[];

    /** Return the ioBroker device this mapping is for. */
    abstract getIoBrokerDevice(): GenericDevice;

    get name(): string {
        return this.#name;
    }

    get uuid(): string {
        return this.#uuid;
    }

    /**
     * Registers all device Matter change handlers relevant for this device to handle changes by Matter controllers to
     * control the device.
     */
    abstract registerMatterHandlers(): void;

    /** Registers all the ioBroker change handlers to update statee changes from ioBroker onto the Matter device. */
    abstract registerIoBrokerHandlersAndInitialize(): Promise<void>;

    /** Initialization Logic for the device. makes sure all handlers are registered for both sides. */
    async init(): Promise<void> {
        this.registerMatterHandlers();
        await this.registerIoBrokerHandlersAndInitialize();
    }
}
