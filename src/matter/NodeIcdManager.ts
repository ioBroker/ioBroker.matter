import { IcdClient, IcdMultiAdminError, Observable, ObserverGroup } from '@matter/main';
import { IcdManagementClient, OperationalCredentialsClient } from '@matter/main/behaviors';
import type { IcdManagement } from '@matter/main/clusters';
import type { PairedNode } from '@project-chip/matter.js/device';
import { deriveIcdMode, otherFabricClientCount, type IcdMode } from './icdUtils';

/** Registration was refused because other-vendor administrators may not support LIT. */
export class IcdMultiAdminConflictError extends Error {
    readonly vendorIds: number[];

    constructor(vendorIds: number[]) {
        super('Battery Saver Mode was refused because other administrators may not support it');
        this.name = 'IcdMultiAdminConflictError';
        this.vendorIds = vendorIds;
    }
}

export interface IcdInfo {
    features: {
        checkInProtocolSupport: boolean;
        userActiveModeTrigger: boolean;
        longIdleTimeSupport: boolean;
        dynamicSitLitSupport: boolean;
    };
    operatingMode: IcdManagement.OperatingMode | undefined;
    /** Seconds the device may stay asleep between check-ins. */
    idleModeDuration: number | undefined;
    userActiveModeTriggerHint: IcdManagement.UserActiveModeTrigger | undefined;
    userActiveModeTriggerInstruction: string | undefined;
}

/**
 * ICD (Intermittently Connected Device) management for one paired node: reads the peer's ICD state and
 * drives the controller-side check-in registration that Matter calls LIT and we call Battery Saver Mode.
 */
export class NodeIcdManager {
    readonly changed = Observable<[]>();

    readonly #node: PairedNode;
    readonly #observers = new ObserverGroup();
    #pending = false;

    constructor(node: PairedNode) {
        this.#node = node;

        const root = node.node;
        // Both behaviors are absent for a non-ICD peer, and IcdClient is only injected once the peer's
        // IcdManagement cluster is discovered — eventsOf() throws on a behavior that isn't installed yet.
        if (root.behaviors.has(IcdClient)) {
            const icdEvents = root.eventsOf(IcdClient);
            this.#observers.on(icdEvents.registered, () => this.changed.emit());
            this.#observers.on(icdEvents.unregistered, () => this.changed.emit());
            this.#observers.on(icdEvents.available$Changed, () => this.changed.emit());
            this.#observers.on(icdEvents.checkInMissed, () => this.changed.emit());
        }

        if (root.behaviors.has(IcdManagementClient)) {
            const managementEvents = root.eventsOf(IcdManagementClient);
            this.#observers.on(managementEvents.operatingMode$Changed, () => this.changed.emit());
        }
    }

    get supported(): boolean {
        return this.#node.node.maybeStateOf(IcdManagementClient) !== undefined;
    }

    /** True only with the LongIdleTimeSupport feature AND a reported Matter specification version >= 1.4.0. */
    get litCapable(): boolean {
        return IcdClient.litSupported(this.#node.node);
    }

    get registered(): boolean {
        return this.#node.node.maybeStateOf(IcdClient)?.registered === true;
    }

    /**
     * Whether the peer is within its expected check-in window. A sleeping LIT device is available, so this
     * is the reachability signal for ICD, not `PairedNode.isConnected`.
     */
    get available(): boolean {
        return this.#node.node.maybeStateOf(IcdClient)?.available ?? true;
    }

    get info(): IcdInfo | undefined {
        const state = this.#node.node.maybeStateOf(IcdManagementClient);
        if (state === undefined) {
            return undefined;
        }
        const features = this.#node.node.maybeFeaturesOf(IcdManagementClient);
        return {
            features: {
                checkInProtocolSupport: features?.checkInProtocolSupport === true,
                userActiveModeTrigger: features?.userActiveModeTrigger === true,
                longIdleTimeSupport: features?.longIdleTimeSupport === true,
                dynamicSitLitSupport: features?.dynamicSitLitSupport === true,
            },
            operatingMode: state.operatingMode,
            idleModeDuration: state.idleModeDuration,
            userActiveModeTriggerHint: state.userActiveModeTriggerHint,
            userActiveModeTriggerInstruction: state.userActiveModeTriggerInstruction,
        };
    }

    get mode(): IcdMode {
        if (this.#pending) {
            return 'pending';
        }
        return deriveIcdMode({
            litCapable: this.litCapable,
            operatingMode: this.#node.node.maybeStateOf(IcdManagementClient)?.operatingMode,
            available: this.available,
        });
    }

    set pending(value: boolean) {
        if (this.#pending === value) {
            return;
        }
        this.#pending = value;
        this.changed.emit();
    }

    /** @throws {IcdMultiAdminConflictError} when other-vendor administrators block registration */
    async register(allowMultiAdmin: boolean): Promise<void> {
        try {
            await this.#node.node.act(agent => agent.get(IcdClient).register({ allowMultiAdmin }));
        } catch (error) {
            IcdMultiAdminError.accept(error);
            throw new IcdMultiAdminConflictError([...error.adminVendorIds]);
        }
    }

    /** `force` clears only local state, for a peer that cannot be reached any more. */
    async unregister(force: boolean): Promise<void> {
        await this.#node.node.act(agent => (force ? agent.get(IcdClient).forget() : agent.get(IcdClient).unregister()));
    }

    /**
     * Drops the local registration and reconnects; a LIT peer re-registers itself once subscribed.
     * `triggerReconnect` preserves the node's stored connect options.
     */
    async resync(): Promise<void> {
        await this.#node.node.act(agent => agent.get(IcdClient).forget());
        this.#node.triggerReconnect();
    }

    /** Registrations held by other fabrics. The unfiltered read parks until a sleeping LIT peer checks in. */
    async otherFabricClientCount(): Promise<number> {
        const registrations = await this.#node.node.getStateOf(IcdManagementClient, ['registeredClients'], {
            fabricFilter: false,
        });
        const ourFabricIndex = this.#node.node.maybeStateOf(OperationalCredentialsClient)?.currentFabricIndex;
        return otherFabricClientCount(
            registrations.registeredClients ?? new Array<IcdManagement.MonitoringRegistration>(),
            ourFabricIndex,
        );
    }

    close(): void {
        this.#observers.close();
        this.changed[Symbol.dispose]();
    }
}
