import { capitalize, Observable, type Endpoint, ObserverGroup, type MaybePromise } from '@matter/main';
import type { GenericDevice } from '../../lib';
import type { StructuredJsonFormData } from '../../lib/JsonConfigUtils';

export interface IdentifyOptions {
    currentState?: any;
    initialState?: any;
}

/** Base class to map an ioBroker device to a matter device. */
export abstract class GenericDeviceToMatter {
    #identifyTimeout?: NodeJS.Timeout;
    #identifyHighlightState = false;
    #name: string;
    #uuid: string;
    #observers = new ObserverGroup();
    #validChanged = Observable();
    #valid = true;

    protected constructor(name: string, uuid: string) {
        this.#name = name;
        this.#uuid = uuid;
    }

    get matterEvents(): ObserverGroup {
        return this.#observers;
    }

    get validChanged(): Observable {
        return this.#validChanged;
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
                if (this.ioBrokerDevice.isActionAllowedByIdentify()) {
                    await this.doIdentify(identifyOptions);
                }
            } else {
                if (this.ioBrokerDevice.isActionAllowedByIdentify()) {
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
        if (this.ioBrokerDevice.isActionAllowedByIdentify()) {
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
    abstract get matterEndpoints(): Endpoint[];

    /** Return the ioBroker device this mapping is for. */
    abstract ioBrokerDevice: GenericDevice;

    get name(): string {
        return this.#name;
    }

    get uuid(): string {
        return this.#uuid;
    }

    get isValid(): boolean {
        return this.ioBrokerDevice.isValid;
    }

    /**
     * Registers all device Matter change handlers relevant for this device to handle changes by Matter controllers to
     * control the device.
     */
    abstract registerMatterHandlers(): void;

    /** Registers all the ioBroker change handlers to update state changes from ioBroker onto the Matter device. */
    abstract registerIoBrokerHandlersAndInitialize(): MaybePromise<void>;

    /** Initialization Logic for the device. makes sure all handlers are registered for both sides. */
    async init(): Promise<void> {
        this.registerMatterHandlers();
        await this.registerIoBrokerHandlersAndInitialize();
        this.ioBrokerDevice.on('validChanged', () => {
            const valid = this.ioBrokerDevice.isValid;
            if (valid === this.#valid) {
                return;
            }
            this.#valid = valid;
            this.#validChanged.emit();
        });
    }

    async destroy(): Promise<void> {
        // Close all subscribed matter events
        this.#observers.close();
        // The endpoints are destroyed by the Node handler because maybe more endpoints were added
        await this.ioBrokerDevice.destroy();
    }

    getDeviceDetails(): StructuredJsonFormData {
        const details: StructuredJsonFormData = {};

        details.detectedStates = {
            __header__device: 'Detected ioBroker Device type',
            deviceType: capitalize(this.ioBrokerDevice.deviceType ?? 'unknown'),
            __header__states: 'Detected device states',
            __text__info: 'The following states were detected for this device:',
            ...this.ioBrokerDevice.getStates(true, true),
        };

        const endpoints = this.matterEndpoints;
        if (endpoints.length > 0) {
            details.endpoints = {
                __header__endpoints: 'Device Endpoints',
                __text__info: 'The following Matter endpoints are mapped for this device.',
            };
            endpoints.forEach(endpoint => {
                details.endpoints[`__header__endpoint${endpoint.number}`] = `Endpoint ${endpoint.number}`;
                details.endpoints[`dt${endpoint.number}__deviceType`] = capitalize(endpoint.type.name);
                // TODO expose potentially more
            });
        }

        return details;
    }
}
