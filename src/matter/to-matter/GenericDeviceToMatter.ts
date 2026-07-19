import { capitalize, Observable, type Endpoint, ObserverGroup, type MaybePromise } from '@matter/main';
import type { GenericDevice } from '../../lib';
import type { StructuredJsonFormData } from '../../lib/JsonConfigUtils';

/**
 * Convert an illuminance value in lux to a Matter IlluminanceMeasurement MeasuredValue.
 * Matter MeasuredValue = 10000*log10(lux)+1 for lux >= 1; 0 means too-low-to-measure. log10(<=0) is -Infinity, cropped to 0.
 */
export function luxToMatterMeasuredValue(device: GenericDevice, lux: number): number {
    return Math.round(device.cropValue(10_000 * Math.log10(lux) + 1, 0, 0xfffe, false));
}

/** Base class to map an ioBroker device to a matter device. */
export abstract class GenericDeviceToMatter {
    #name: string;
    #uuid: string;
    #observers = new ObserverGroup();
    #validChanged = Observable();
    #valid = true;
    #timeouts = new Set<ioBroker.Timeout>();

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

    /** Schedule a timeout that is automatically cleared on {@link destroy}. */
    protected setDeviceTimeout(callback: () => void, ms: number): ioBroker.Timeout | undefined {
        const timeout = this.ioBrokerDevice.adapter.setTimeout(() => {
            if (timeout !== undefined) {
                this.#timeouts.delete(timeout);
            }
            callback();
        }, ms);
        if (timeout !== undefined) {
            this.#timeouts.add(timeout);
        }
        return timeout;
    }

    /** Clear a timeout previously scheduled via {@link setDeviceTimeout}. */
    protected clearDeviceTimeout(timeout: ioBroker.Timeout | undefined): void {
        if (timeout !== undefined) {
            this.#timeouts.delete(timeout);
            this.ioBrokerDevice.adapter.clearTimeout(timeout);
        }
    }

    /** Registers all the handlers on ioBroker and Matter side and initialize with current values. */
    registerHandlersAndInitialize(): MaybePromise<void> {}

    /** Initialization Logic for the device. Makes sure all handlers are registered for both sides. */
    async init(): Promise<void> {
        await this.registerHandlersAndInitialize();
        this.ioBrokerDevice.on('validChanged', () => {
            const valid = this.ioBrokerDevice.isValid;
            this.ioBrokerDevice.adapter.log.info(
                `Device ${this.name} is now ${valid ? 'valid' : 'invalid'} (before: ${this.#valid ? 'valid' : 'invalid'})`,
            );
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
        for (const timeout of this.#timeouts) {
            this.ioBrokerDevice.adapter.clearTimeout(timeout);
        }
        this.#timeouts.clear();
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
